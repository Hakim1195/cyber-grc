# Rapport de la porte de sécurité S1 — troisième passage (re-jeu intégral)

> Troisième revue adversariale indépendante de la vague 1 (lot L1), après les correctifs
> apportés au refus du second passage. La porte est **rejouée intégralement**
> (`docs/PLAN_EXECUTION.md` §1) : les quinze contrôles de la grille §4, tous.
>
> **L'auteur de ce rapport n'a écrit aucune ligne du code examiné, et n'est l'auteur
> d'aucun des deux rapports précédents.** Travail en lecture seule : aucun fichier du
> dépôt n'a été modifié, aucun commit n'a été fait (`git status` vide en fin de revue).
> Tous les essais ont été rejoués depuis zéro sur une base dédiée (**`grc_audit3`**,
> PostgreSQL 16.13), montée par `db/dev/preparer_base_dev.sh --recreer` à partir des
> quatre migrations. Les scripts d'attaque et les copies mutées du dépôt vivent hors du
> dépôt. Les bases `grc_audit`, `grc_audit2`, `grc_correctif` et `grc_install` des
> dossiers précédents n'ont pas été touchées.
>
> Date : 31 août 2026 · Périmètre : `backend/db/**`, `backend/src/**`, `backend/test/**`,
> `backend/deploy/**` · Rapports précédents : [`RAPPORT_S1.md`](RAPPORT_S1.md),
> [`RAPPORT_S1_BIS.md`](RAPPORT_S1_BIS.md) · Arbitrages : `backend/db/CONVENTIONS.md` §16 et §17.

---

## 1. Verdict

> ## Porte REFUSÉE
>
> **Le contrôle S4 de la grille §4 est en échec.** Son texte de preuve dit « le client ne
> peut pas fixer `version` » ; il le peut, à l'**insertion** — chemin qu'aucun des deux
> passages précédents n'a essayé, tous deux ayant éprouvé la seule mise à jour. Dans le
> même mouvement, `cree_par` et `cree_le` sont fournis par l'appelant, et le déclencheur
> qui les **gèle** fige alors la valeur forgée pour toujours.

**Décompte : 0 bloquant · 4 majeurs · 5 mineurs · 4 observations.**

Et il faut le dire aussi nettement que le refus : **c'est le premier passage qui ne trouve
aucun défaut de cloisonnement.** J'ai attaqué la frontière entre filiales par tous les
chemins que j'ai su construire — balayage indépendant du catalogue des clés étrangères, des
contraintes d'unicité, des actions référentielles, des déclencheurs, des politiques, des
privilèges — et elle a tenu. Les correctifs des deux vagues précédentes sont bons, et les
propriétés qu'ils affirment sont vraies : je les ai toutes rejouées moi-même, sans reprendre
une seule sortie annoncée par quiconque.

Ce qui reste en défaut se situe **à côté** du cloisonnement, sur trois axes que personne
n'avait encore parcourus :

1. **L'insertion.** Les deux rapports ont éprouvé l'`update` de fond en comble et jamais
   l'`insert`. Or c'est là que la traçabilité et le verrouillage optimiste se font dicter
   leur valeur par l'appelant (T-1).
2. **Le sens Groupe → filiale.** §17.6 pose la règle — « une action de portée Groupe ne
   doit pas modifier les données d'une filiale à son insu » — et l'applique à
   `mesure_catalogue`. Elle n'a été balayée nulle part ailleurs : la dernière clé
   étrangère en `set null` du schéma la viole (T-2).
3. **Ce qui s'exécute au déploiement.** Le garde-fou de couverture RLS, écrit précisément
   pour être appelé, n'est appelé par **rien** de ce qui tourne sur la machine cible (T-4).

Aucun de ces quatre majeurs n'est difficile à corriger : un déclencheur `before insert`,
une action référentielle, une contrainte de cohérence sur l'acteur du journal, et deux
appels de fonction. Aucun ne remet en cause l'architecture. Mais T-1 met un contrôle de la
grille en échec, et §1 du plan d'exécution est explicite : « un défaut de la grille §4
arrête la vague ». Je refuse donc, en disant nettement que **le reste du travail de la
vague 1 est sain et n'appelle aucune reprise**, et que la porte sera franchissable dès que
les quatre majeurs seront fermés — accompagnés, comme la fois précédente, de ce qui les
éprouve.

---

## 2. Le sort des constats des deux passages précédents

Pour chacun : le statut, et **la preuve que j'ai rejouée moi-même**. Je n'ai repris aucune
sortie des rapports antérieurs, ni aucun résultat annoncé par les correcteurs. Sauf mention
contraire, les commandes tournent sous **`grc_app`** — c'est de ce rôle que parle la
question d'audit.

### 2.1 Tableau de synthèse

| # | Constat | Statut vérifié par moi |
|---|---|---|
| **B-1** | Sept clés étrangères traversant la frontière de filiale | **fermé** |
| **M-1** | `search_path` non figé, masquage par `pg_temp` | **fermé** (avec une limite neuve : T-10) |
| **M-2** | Substrat d'authentification non protégé | **fermé pour ce qui pouvait l'être**, report L3 écrit et épinglé |
| **M-3** | Drapeau Groupe : appropriation et destruction du socle | **fermé** |
| **m-1** | Oracle d'existence par les messages de contrainte | **fermé sur le canal des clés étrangères** ; subsiste, affaibli, sur les clés primaires (T-8) |
| **m-2** | Virgule admise par le domaine `id_metier` | **fermé** |
| **m-3** | Garde-fou de couverture aveugle au prédicat non trivial | **fermé**, avec sa limite écrite |
| **m-4** | Journal écrit sur le périmètre de lecture | **fermé** |
| **m-5** | Bornes de la reprise payées après `JSON.parse` | **fermé** |
| **m-6** | Écarts au périmètre d'écriture des agents | **non corrigé** — les commits restent transverses |
| **N-1** | La filiale d'écriture n'était pas recoupée avec le périmètre de lecture | **fermé**, et éprouvé |
| **N-2** | `filiales` réinscriptible par n'importe quelle filiale | **fermé**, avec une brèche résiduelle par action référentielle (T-7) |
| **N-3** | `--reprendre-propriete` rouvrait `migrations_schema` | **fermé** |
| **N-4** | Le drapeau d'administration survivait au recyclage d'une connexion | **fermé**, et fortement éprouvé |
| **N-5** | L'acteur du journal était fourni par le client | **corrigé, mais la correction peut être inerte sans que rien ne le dise** (T-3) |
| **N-6** | « Il s'archive » sans mécanisme | **fermé** |
| **N-7** | `search_path` de session divergent pool / banc d'essai | **fermé** |
| **N-8** | `migrate.mjs` applique sans un mot une migration rétro-numérotée | **non corrigé** — reproduit |
| **N-9** | Références polymorphes sans contrôle de cohérence | **non corrigé** — conforme au report annoncé (L6/L8) |
| **N-10** | Clé composite neutralisée pour les lignes de portée Groupe | **fermé** |
| **N-11** | Déclencheurs neufs armés en `origin` | **fermé** (9 sur 9 en `always`) |
| **N-12** | `src/reprise/index.ts` porte deux octets NUL | **non corrigé** — mesuré à nouveau |
| **N-13** | Textes normatifs en décalage avec le code | **partiellement corrigé**, et un quatrième décalage s'y ajoute (T-5) |

### 2.2 Les preuves

**B-1 — fermé.** Balayage indépendant, écrit sans lire le leur : toute clé étrangère dont
l'enfant *et* le parent portent un `filiale_id` **non nul** doit inclure `filiale_id`.

```
with cl as (select … from pg_class … join pg_attribute a on a.attname='filiale_id' and a.attnotnull)
select count(*) from pg_constraint k join cl e on e.oid=k.conrelid join cl p on p.oid=k.confrelid
 where k.contype='f' and not exists (… a.attname='filiale_id' dans conkey …);

 fk_simples_entre_tables_cloisonnees
                                   0
```

Et le sens inverse, que j'ai balayé en plus : les seules clés étrangères d'une table de
niveau Groupe vers une table de niveau filiale sont les six liaisons (protégées par leurs
politiques) et `fk_filiales_logo`, désormais **composite** :
`FOREIGN KEY (logo_piece_jointe_id, id) REFERENCES pieces_jointes(id, filiale_id) ON DELETE SET NULL (logo_piece_jointe_id)`.
Le déni de logo inter-filiales de N-2 est bien fermé (C68/C69, rejoués).

**M-1 — fermé.** `select count(*) from f_verifier_chemin_recherche()` → `0`. Et surtout,
sous `grc_app` :

```
create temporary table pg_class_faux (x int);
ERROR:  permission denied to create temporary tables in database "grc_audit3"
```

Le corollaire d'exploitation du §17.2 tient : le rôle applicatif ne peut plus rien masquer
par `pg_temp`. J'ai aussi vérifié qu'il ne peut pas désarmer les déclencheurs :
`set session_replication_role = replica;` → `ERROR: permission denied to set parameter`.

**M-2 — fermé pour ce qui pouvait l'être.** Les cinq tables de configuration ont bien une
écriture conditionnée au drapeau (C44/C45, C66/C67 rejoués ; la mutation M2 ci-dessous le
confirme par l'absurde). Le §17.4 dit maintenant, à l'endroit exact, ce que le drapeau
**n'est pas** — c'était la condition n° 6 du re-passage, elle est tenue. Le report L3 des
trois tables de session est écrit, daté et épinglé par un test. Deux réserves neuves s'y
attachent tout de même : T-6 (le refus est muet sur `update`/`delete`) et T-7 (une action
référentielle écrit dans `filiales` sans le drapeau).

**M-3 — fermé.** Cinq déclencheurs `*_portee_figee`, tous en mode `always` :

```
 declencheurs_portee | en_always
                   5 |         5
```

C40/C41 (appropriation et promotion) et C42/C51–C54 (destruction du socle) rejoués : `23514`
et `23503` comme annoncé.

**m-1 — fermé sur le canal des clés étrangères.** C'est un effet de bord heureux du
correctif B-1, et personne ne l'avait mesuré. Les deux sondes rendent aujourd'hui le
**même** message, valeurs comprises :

```
-- sonde sur un risque qui EXISTE chez la filiale A, invisible de B
insert into actions (…, risque_id) values (…, 'RISK-A');
ERROR:  insert or update on table "actions" violates foreign key constraint "fk_actions_risque"
DETAIL:  Key is not present in table "risques".

-- sonde sur un identifiant qui n'existe nulle part
insert into actions (…, risque_id) values (…, 'RISK-INEXISTANT');
ERROR:  insert or update on table "actions" violates foreign key constraint "fk_actions_risque"
DETAIL:  Key is not present in table "risques".
```

PostgreSQL masque les valeurs de clé dans le détail lorsque la ligne visée est invisible
sous RLS : l'oracle est clos sur ce chemin. Il subsiste, affaibli, sur les clés primaires
(T-8).

**m-2 — fermé.** `select 'FIL,X'::id_metier;` → `ERROR: value for domain id_metier violates
check constraint "id_metier_check"`. Le domaine refuse aussi les espaces de tête et de fin,
et reste permissif par ailleurs, comme annoncé.

**m-3 — fermé, et sa limite est écrite.** Le garde-fou ne compare plus au littéral `true` :
il exige que le prédicat **mentionne** la fonction de périmètre. Éprouvé par sabotage
(§4, T-4) : `force_absente` et `lecture_non_cloisonnee` remontent bien. Le commentaire de la
fonction énonce lui-même ce qu'elle ne peut pas voir — c'est la règle du §17.5, respectée.

**m-4 — fermé.** C49 rejoué : périmètre `FIL-A,FIL-B`, filiale active `FIL-A`, écriture au
journal attribuée à `FIL-B` → `42501`.

**m-5 — fermé.** Les tests de la reprise passent, dont « entrée hostile volumineuse :
refusée après lecture d'une fraction du fichier » (455 ms sur mon exécution) et « le plafond
de taille prime toujours sur le budget de nœuds ».

**m-6 — non corrigé.** Les quatre derniers commits sont transverses :

```
3dd8bbf  backend/db/CONVENTIONS.md · backend/db/migrations/001_socle.sql · backend/test/base/rls.test.mjs
cc579d2  backend/db/verifier_cloisonnement.sql · backend/test/base/socle.test.mjs
c14dca1  backend/deploy/install.sh
1339acd  001, 002, 003, 004 · deploy/install.sh · test/base/rls.test.mjs
```

`CONVENTIONS.md` est réservé à l'orchestrateur (`PLAN_EXECUTION` §2) et se retrouve dans un
commit SCHEMA ; migrations, banc d'essai et déploiement voyagent ensemble. C'est le point 7
de la définition de « terminé ».

**N-1 — fermé, et éprouvé.** C'était la condition n° 1 du re-passage, et elle est tenue
**dans ses trois volets** : la condition dans `f_filiale_ecriture()`, les cas d'essai dans
`test/base/rls.test.mjs`, et les contrôles C60 à C64 dans `verifier_cloisonnement.sql`.

```
=== C60 Écrire un risque dans une filiale NI lue NI active            GRC04   OK
=== C61 Forger une entrée de JOURNAL dans une filiale NI lue NI active GRC04  OK
=== C62 Écrire chez SOI après avoir déclaré une autre filiale active   GRC04  OK
=== C63 Périmètre de lecture VIDE et filiale active posée              GRC04  OK
=== C64 Écrire dans la filiale active, celle-ci étant DANS le périmètre (symétrique)  OK
=== C65 Politiques d'écriture cloisonnées ne passant pas par f_filiale_ecriture (72 balayées)  0  OK
```

Et la mutation M1 (§5) montre que le banc d'essai **mord** désormais sur cette propriété :
quatre échecs quand je retire la condition. La remarque du second rapport — « la propriété
n'est éprouvée par rien » — n'est plus vraie.

**N-2 — fermé**, avec une brèche résiduelle. `filiales` est bien passée aux tables de
configuration ; C66/C67 et C73 rejoués. Voir T-7 pour ce qui reste ouvert.

**N-3 — fermé.** J'ai relu le chemin `--reprendre-propriete` : les deux `revoke` ciblés
(`journal_audit`, `migrations_schema`) sont reposés **après** les `grant … on all tables`,
un contrôle final vérifie que `grc_app` n'a que `select` sur le registre, et la reprise
**refuse** de s'exécuter quand `reassign owned` emporterait d'autres bases du cluster. Sur
ma base : `grc_app` sur `migrations_schema` → `SELECT` seul ; sur `journal_audit` →
`INSERT, SELECT`. Conforme.

**N-4 — fermé, et fortement éprouvé.** Les quatre réglages sont posés sans condition à
chaque transaction (`src/db/pool.ts`, `appliquerPerimetre`). La mutation M4 (retrait du
quatrième `set_config`) fait tomber **19 tests**. C'est la propriété la mieux tenue du lot.

**N-5 — corrigé, mais la correction peut être inerte.** Le déclencheur écrase bien
`utilisateur_id` (C75 rejoué). Voir **T-3** : la manière dont il le résout n'a de sens que
si `grc.utilisateur` porte l'identifiant métier du compte, ce que la documentation du socle
contredit et que rien ne vérifie.

**N-6 — fermé.** `mesure_catalogue` porte `statut in ('active','archivee')` et `archive_le`,
liés par `ck_mesure_catalogue_archive`. C70, C71 et C74 rejoués ; la mutation M7 (relâchement
de la contrainte) fait tomber un test ciblé.

**N-7 — fermé.** Le pool fixe `search_path=public` et dit lui-même, en commentaire, que ce
**n'est pas** une mesure de sécurité ; le banc d'essai n'accorde plus `temporary`.

**N-8 — non corrigé, reproduit.** Sur une base neuve portant 001 à 004, j'ai déposé un
`000_prealable.sql` :

```
  000_prealable.sql ........... appliquée en 2 ms
  001_socle.sql ............... déjà appliquée
  …
Schéma à jour : 1 migration(s) appliquée(s) sur 5.
```

Appliquée sans un mot, hors de l'ordre que son numéro annonce. Et — c'est le prolongement
neuf — la table qu'elle crée **n'a ni RLS ni politique**, et rien ne le signale : voir T-4.

**N-9 — non corrigé**, conformément au report annoncé (L6/L8).

**N-10 — fermé.** La clé de portée `(document_id, portee_groupe)` s'appuie sur une colonne
engendrée qui n'est jamais nulle ; C72 rejoué (`23503`), et la mutation M6 (retrait de la
clé) fait tomber le test qui porte le nom du constat. Effet de bord à connaître : T-12.

**N-11 — fermé.** Les neuf déclencheurs de cohérence et de portée sont en `tgenabled = 'A'`
(C76, et mon propre décompte). Les 32 autres déclencheurs du schéma restent en `'O'` — sans
effet, `grc_app` ne pouvant pas poser `session_replication_role` (vérifié ci-dessus).

**N-12 — non corrigé.** Mesuré par mes soins :

```
src/reprise/index.ts 2 octets NUL
```

**N-13 — partiellement corrigé.** Le commentaire de la dérogation du journal est à jour ; le
§17.2 dit maintenant honnêtement que deux des trois `revoke` sont implicites et que c'est la
**vérification** qui garantit. Mais un quatrième décalage s'ouvre : le §17.9 affirme
« Aucun flux légitime n'en souffre », ce qui est faux (T-5).

---

## 3. La grille §4 — les quinze contrôles, rejoués

Base d'appui commune à tous les contrôles ci-dessous, obtenue avant toute attaque :

```
$ bash db/dev/preparer_base_dev.sh --base grc_audit3 --recreer
  001_socle.sql … 002_metier_noyau.sql … 003_metier_operations.sql … 004_rls.sql  appliquées

$ psql -U grc_app -d grc_audit3 -f db/verifier_cloisonnement.sql
  contrôles | réussis | échoués
         76 |      76 |       0

$ npm test
  ℹ tests 269 · pass 269 · fail 0

$ npm run verifier-types   → exit 0
$ npm audit                → found 0 vulnerabilities
```

### S1 — Cloisonnement par filiale non contournable · **passé sur le schéma, réserve d'exploitation**

**Ce qui tient, et que j'ai éprouvé moi-même.** Les trois preuves attendues sont fournies :

- *Session filiale A : zéro ligne de la filiale B.* Rejoué sur les 24 tables de niveau
  filiale, les 5 mixtes, les 6 liaisons. Zéro fuite.
- *`force row level security` sur toute table à `filiale_id`.* Vérifié sur les 47 tables :
  `relrowsecurity` et `relforcerowsecurity` vrais partout ;
  `select count(*) from f_verifier_couverture_rls()` → `0`.
- *`grc_app` sans `bypassrls`, non propriétaire.* Vérifié : ni `SUPERUSER`, ni `BYPASSRLS`,
  aucun objet possédé, aucun héritage de rôle privilégié, pas de `temporary`.

**Ce que j'ai essayé pour la mettre en défaut, en plus des deux passages précédents.** Mes
attaques ont porté sur les canaux **déclaratifs** qui contournent délibérément la RLS,
puisque c'est la famille dont relevait B-1 :

| Canal | Résultat |
|---|---|
| Clés étrangères entre tables cloisonnées | balayage indépendant : **0** clé simple |
| Clés étrangères Groupe → filiale | 12 recensées, toutes en cascade sur liaison, sauf `fk_filiales_logo` (composite) |
| Actions référentielles `set null` / `set default` | **3** recensées ; deux correctes, une fautive → **T-2** |
| Contraintes d'unicité ne comprenant pas `filiale_id` | 37 recensées ; toutes des clés primaires ou des unicités techniques, sauf l'espace de nommage lui-même → **T-8** |
| Politiques ciblées sur un rôle (`polroles`) | 188 politiques, **188 vers PUBLIC**, 0 ciblée : aucun angle mort par le rôle |
| Politiques restrictives | aucune : la couverture se lit entièrement dans les politiques permissives |
| Colonnes engendrées entrant dans une clé | 2, correctes (N-10) ; effet de bord T-12 |

**La réserve.** Elle ne porte pas sur le schéma mais sur ce qui le maintient : **rien de ce
qui s'exécute au déploiement ne vérifie une seule de ces propriétés** (T-4). C'est une
réserve d'exploitation, pas un défaut de conception.

### S2 — Le périmètre ne vient jamais du navigateur · **réserve** (reconduite)

Côté serveur, le contrat est tenu et je l'ai relu ligne à ligne : `avecTransaction` exige un
`PerimetreSession` construit par la couche d'authentification, `appliquerPerimetre` passe
les quatre valeurs **par paramètres liés** (`set_config($1, $2, true)`), et aucun chemin de
code ne lit un corps, une entête, une URL ou un cookie. `validerPerimetre` refuse en amont
un périmètre vide, une écriture sans filiale active, et une filiale active hors périmètre.

La réserve est celle du second passage, et elle est intacte : le frontend porte toujours son
périmètre en clair dans le navigateur.

```
cyber-gouvernance_V4/js/modules/exigences.js:10   localStorage.getItem("cyber-context")
cyber-gouvernance_V4/js/modules/actions.js:10     localStorage.getItem("cyber-context")
cyber-gouvernance_V4/js/modules/dashboard.js:281  localStorage.getItem("cyber-context")
cyber-gouvernance_V4/js/modules/synthese.js:193   localStorage.getItem("cyber-context")
```

Le retrait est un livrable FRONT de la vague 4 (`PLAN_EXECUTION` §3) : **sans objet à cette
porte**, à établir à la porte S4. Il n'a aucun effet aujourd'hui, la SPA ne parlant pas
encore au serveur.

### S3 — Journal d'audit inaltérable et complet · **réserve**

**Les quatre couches de l'ajout seul, éprouvées une par une sous `grc_app`** : privilèges
(`INSERT, SELECT` seuls), déclencheurs `GRC01` (`delete from journal_audit` → « Table
journal_audit en ajout seul : opération DELETE refusée »), mode `always` (les trois
déclencheurs en `tgenabled='A'`, et `session_replication_role` refusé au rôle), non-propriété
(aucun objet possédé). `f_journal_audit_verifier()` ne renvoie rien après toutes mes
tentatives.

**Ce qui vaut la réserve — trois choses, dont deux neuves.**

1. *La lecture n'est pas cloisonnée* — dérogation documentée, déjà mesurée par le second
   passage, et que je confirme sans la compter comme neuve. Je l'ai rejouée pour vérifier
   qu'elle n'a pas été resserrée : une session `grc_app` de périmètre strictement `FIL-A`
   lit **le contenu complet** d'une donnée allemande par `valeurs_apres`, et le fait même
   **sans aucun réglage de périmètre**. La correction est un livrable ferme de L5.
2. *L'acteur peut être nul sans que rien ne le dise* — **T-3**, neuf.
3. *Une entrée transversale se forge sans périmètre* — la branche `filiale_id is null` de
   `pol_journal_audit_ajout` est le seul chemin d'écriture du schéma qui n'exige **rien** :
   ni périmètre, ni filiale active, ni drapeau. Elle est nécessaire (démarrage du service,
   échec de connexion), mais elle laisse le libellé de l'acteur entièrement au client, et
   l'entrée produite est numérotée, horodatée, chaînée, scellée, indistinguable d'une vraie
   et **impossible à retirer**. Détail sous T-3.

**Complétude** : `ck_journal_audit_action` liste bien les vingt actions du `PLAN_SERVEUR`
§1.7, `export` et `import` compris. Rien ne les émet (L5) : **sans objet**, à établir à la
porte S3.

### S4 — Verrouillage optimiste effectif · **ÉCHEC**

La moitié « API » (traduction du zéro ligne en `GRC03`) reste le lot L2 : sans objet. La
moitié « base » était donnée pour passée par les deux passages précédents. **Elle ne passe
pas.**

Les deux rapports ont posé la même question — « le client peut-il fixer `version`
lui-même ? » — et l'ont éprouvée sur un `update`, où `f_maj_tracabilite()` écrase. Personne
n'a essayé l'`insert`, où **aucun déclencheur n'intervient** :

```
insert into risques (id, filiale_id, nom, version, cree_par)
  values ('R1','FIL-A','r',42,'usurpe');                        INSERT 0 1

 id | version | cree_par
 R1 |      42 | usurpe
```

Le texte de preuve du contrôle S4 — « **Le client ne peut pas fixer `version`** » — est
faux. Détail, conséquences et scénario sous **T-1**.

Ce qui tient, et que j'ai rejoué : sur `update`, `version` fournie est ignorée et
incrémentée, `cree_le` / `cree_par` sont gelés, `modifie_par` vient de la session ; et deux
écritures concurrentes sur la même version donnent `UPDATE 1` puis `UPDATE 0`.

### S5 — Aucune injection SQL · **passé**

- `src/` : aucune requête construite par concaténation. Recherche de gabarits `${…}` à
  l'intérieur d'une chaîne SQL dans `pool.ts`, `config/index.ts` et `migrate.mjs` :
  **aucune occurrence**. Les quatre `set_config` du périmètre passent par `$1..$4`.
- `db/migrate.mjs` : les trois requêtes paramétrées (`select 1 from migrations_schema where
  version = $1`, deux `update … where version = $1`). Le contenu d'une migration est envoyé
  tel quel, ce qui est le propos de l'outil, et les fichiers viennent du dépôt.
- Migrations : **43** `execute format(...)` sur 45 emploient `%I` ou `%L` ; les deux
  restantes (001, lignes 57 et 63) interpolent `current_user` via `%I`. Aucun identifiant
  interpolé ne vient d'une entrée utilisateur : les listes de tables sont des constantes
  `text[]` écrites dans le fichier.
- `db/dev/preparer_base_dev.sh` et `deploy/install.sh` : le nom de base est validé contre
  `^[A-Za-z_][A-Za-z0-9_$]*$` avant toute interpolation, et le SQL arrive par l'entrée
  standard (rien dans `ps`).

### S6 — Droits vérifiés côté serveur à chaque requête · **sans objet (L3)**

Il n'existe aucun point d'entrée métier : le serveur expose `/api/sante` et rien d'autre. La
RLS répond à « quelles lignes », jamais à « qui a le droit de faire quoi ». À établir à la
porte S3. Ce qui existe déjà et sera son socle : `profils`, `profil_domaines`,
`domaine_fonctionnel` (30 domaines), `niveau_droit` (5 niveaux), `groupes_ad`.

### S7 — Le droit d'export est distinct de la lecture · **sans objet (L3)**

Le schéma prévoit la place (`domaine_fonctionnel` ne contient pas d'entrée « export » : le
droit est un axe à part, `PLAN_SERVEUR` §3.3, et `ck_journal_audit_action` admet `export`).
Rien n'est implémenté. À établir à la porte S3. **Réserve à porter à cette porte-là** : un
export réussi ou refusé doit être journalisé, et T-3 montre que l'acteur d'une telle entrée
peut être nul.

### S8 — Secrets · **passé**

- Aucun secret versionné : recherche de mots de passe littéraux, de clés privées et de
  clés d'API sur l'ensemble des fichiers suivis — deux fichiers ressortent,
  `db/dev/preparer_base_dev.sh` (le mot de passe `dev`, documenté comme tel, refusé sous
  `NODE_ENV=production`) et `deploy/install.sh` (qui **engendre** les secrets, n'en porte
  aucun).
- `.env.example` : toutes les variables sensibles sont **vides**
  (`BASE_MOT_DE_PASSE=`, `SESSION_SECRET=`, `LDAP_MOT_DE_PASSE_SERVICE=`,
  `SMTP_OAUTH_CLIENT_SECRET=`…).
- `resumerConfiguration()` ne cite aucun secret ; le journal Fastify masque
  `authorization`, `cookie` et `set-cookie` (`censor: '[masqué]'`).
- `verifierBase()` renvoie le message d'erreur de la base dans un champ **réservé au
  journal**, jamais dans la réponse `/api/sante` — vérifié en lisant la construction de la
  réponse.

### S9 — Chaîne de contrôle des pièces jointes · **sans objet (L6)**

La table `pieces_jointes` porte les colonnes de la chaîne (`sha256`, `type_mime`,
`derniere_reanalyse`, `chemin_stockage`), la configuration porte `PJ_TAILLE_MAX` et refuse
une taille supérieure à la limite de corps du serveur. Aucun des huit contrôles n'est
implémenté, ClamAV est absent de la machine. À établir à la porte S4.

### S10 — Sortie et en-têtes · **partiel, documentaire**

Ce que j'ai pu vérifier en lisant (ni Apache ni Debian ici) :

- `deploy/apache/cyber-grc.conf` : CSP stricte (`default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`), `nosniff`,
  `X-Frame-Options: DENY`, HSTS un an, COOP/CORP `same-origin`, `Permissions-Policy`
  fermée, `Cache-Control: no-store`, `X-Powered-By` retiré, TLS 1.2/1.3 seuls,
  `LimitRequestBody 27262976`, et — point qui compte — **les six en-têtes de transfert
  entrantes sont effacées avant d'être reposées** (`RequestHeader unset X-Forwarded-For`,
  `-Host`, `-Server`, `X-Real-IP`, `Forwarded`), ce qui ferme la contrebande d'entête vers
  le mandataire.
- `src/serveur.ts` repose `nosniff` et `no-store` lui-même : défense en profondeur si le
  service était interrogé sans passer par le frontal.
- La moitié « cookie de session » (`HttpOnly` + `SameSite` + `Secure`) **n'existe pas** :
  c'est le lot L3.

### S11 — Limitation du rythme et verrouillage · **sans objet (L3)**

Le schéma porte `utilisateurs.tentatives_echouees` et `verrouille_jusqu_a`, et
`ck_journal_audit_action` admet `connexion_echouee`. Rien ne les alimente. `RequestReadTimeout`
d'Apache couvre le seul martèlement lent (Slowloris). À établir à la porte S3.

### S12 — Les erreurs ne renseignent pas l'attaquant · **réserve**

Le gestionnaire d'erreurs de `src/serveur.ts` est correct pour les 5xx : message générique,
référence de requête, pile et message internes au seul journal technique. Pour les 4xx, il
renvoie `erreur.message` tel quel — acceptable pour la validation de schéma de Fastify,
à revoir quand les erreurs métier arriveront (`GRC01` à `GRC04` portent des `hint` qui
nomment des tables et des fichiers du dépôt). Réserve reconduite, à trancher à la porte S2.

S'y ajoute le canal SQL, mesuré ci-dessus : le message d'unicité d'une clé primaire dit
qu'un identifiant existe ailleurs (T-8), et le refus muet des tables de configuration ne dit
rien du tout (T-6) — deux défauts symétriques, l'un trop bavard, l'autre trop discret.

### S13 — Dénis de service applicatifs · **passé, avec une réserve d'exploitation**

- Corps borné : `SERVEUR_TAILLE_MAX_CORPS` côté Fastify **et** `LimitRequestBody` côté
  Apache, avec un contrôle croisé qui refuse une configuration où la taille de pièce jointe
  dépasse la taille de corps.
- Délais de garde posés **à la connexion** libpq, donc valables pour toute requête, y
  compris d'un futur code qui les oublierait : `statement_timeout`,
  `idle_in_transaction_session_timeout`, `lock_timeout`.
- Pool borné (`BASE_POOL_MAX`, défaut 10, plafond 200), délais de connexion et d'inactivité.
- Reprise : bornes payées avant `JSON.parse` (m-5 fermé), plafond de taille prioritaire sur
  le budget de nœuds, profondeur bornée.
- Réserve d'exploitation, neuve dans sa forme : **T-1 permet de rendre une ligne
  définitivement immodifiable** en posant `version = 2147483647` à l'insertion. Ce n'est pas
  un déni de service sur le serveur, c'en est un sur la donnée.

### S14 — Intégrité des opérations composites · **passé**

Rejoué moi-même, sur une base neuve, en injectant une panne à la dernière instruction de
`004_rls.sql` :

```
  003_metier_operations.sql ... appliquée en 113 ms
  004_rls.sql ................. ÉCHEC
 ERR 004_rls.sql : panne provoquee en fin de 004
      SQLSTATE P0001
      La transaction du fichier a été annulée : la base est restée dans son état antérieur.

état après l'échec :  0 politiques | 3 migrations enregistrees | 12 fonctions
code de sortie migrate.mjs = 6
```

Aucun état intermédiaire observable, code de sortie non nul, message qui nomme la cause.
Le contrôle du registre (« le fichier s'est appliqué mais ne s'est pas enregistré ») et
l'ordre déterministe sont en place. La cascade et la propagation métier relèvent de L2.

### S15 — Dépendances · **passé**

```
$ npm audit
found 0 vulnerabilities
```

Deux dépendances de production (`fastify ^5.12.1`, `pg ^8.23.0`), trois de développement,
66 paquets installés au total, toutes justifiées en tête de `src/serveur.ts` et de
`src/db/pool.ts`. `engines` borne Node à `>=22.11.0 <25`. Les gammes sont en `^` et non
épinglées à l'exact : `package-lock.json` fige l'installation, ce qui satisfait le contrôle ;
je le signale sans en faire un constat, la version exacte étant reproductible.

### Récapitulatif

| Contrôle | Verdict |
|---|---|
| S1 Cloisonnement | **passé** (schéma) · réserve d'exploitation (T-4) |
| S2 Périmètre jamais du navigateur | réserve (frontend, L4) |
| S3 Journal inaltérable et complet | **réserve** (lecture non cloisonnée, T-3) |
| S4 Verrouillage optimiste | **ÉCHEC** (T-1) |
| S5 Injection SQL | **passé** |
| S6 Droits côté serveur | sans objet (L3) |
| S7 Droit d'export distinct | sans objet (L3) |
| S8 Secrets | **passé** |
| S9 Pièces jointes | sans objet (L6) |
| S10 Sortie et en-têtes | partiel, documentaire |
| S11 Rythme et verrouillage | sans objet (L3) |
| S12 Erreurs | réserve |
| S13 Dénis de service | **passé**, réserve (T-1) |
| S14 Opérations composites | **passé** |
| S15 Dépendances | **passé** |

---

## 4. Les constats neufs

### T-1 · MAJEUR — À l'insertion, le client fixe `version`, `cree_par` et `cree_le` ; le gel fige ensuite la valeur forgée

**Où.** Les 47 tables. `f_maj_tracabilite()` et `f_maj_horodatage()` sont des déclencheurs
`before **update**` : ils écrasent `version`, `modifie_le`, `modifie_par`, et gèlent
`cree_le` / `cree_par`. **Aucun déclencheur `before insert` n'existe.** Les colonnes
`version integer not null default 1` et `cree_par text not null default
f_utilisateur_courant()` ne portent que des *valeurs par défaut* — et une valeur par défaut
n'est pas une contrainte : elle ne s'applique que si l'appelant se tait.

**Scénario 1 — la preuve fabriquée.** Le produit sert à justifier officiellement la
gouvernance du groupe et sera lu en audit ISO 27001. La question d'audit classique est :
« qui a accepté ce risque, et quand ? ».

```
insert into risques (id, filiale_id, nom, cree_par, cree_le, modifie_par, modifie_le)
  values ('R-USURPE','FIL-A','Risque accepte par la direction',
          'marc.dupuis (DG)','2024-01-15','marc.dupuis (DG)','2024-01-15');   INSERT 0 1

    id    |     cree_par     |  cree_le   |   modifie_par    | version
 R-USURPE | marc.dupuis (DG) | 2024-01-15 | marc.dupuis (DG) |       1
```

La ligne a été créée aujourd'hui, par `alice`, et se présente comme créée le 15 janvier 2024
par le directeur général. Puis `alice` la modifie :

```
update risques set nom='revise' where id='R-USURPE' and version=1;           UPDATE 1

    id    |     cree_par     |  cree_le   | modifie_par | version
 R-USURPE | marc.dupuis (DG) | 2024-01-15 | alice       |       2
```

**Le mécanisme qui protège la vérité protège ici le mensonge** : `f_maj_tracabilite()` gèle
`cree_par` et `cree_le`, donc la forgerie devient *définitive* et *inaltérable*. C'est
exactement la pathologie que le §17.8 décrit pour le journal d'audit — « un journal
inaltérable dont l'acteur est déclaré par le client garantit l'intégrité d'une fausse
preuve » — laissée ouverte sur les 47 tables métier. Le principe général qu'énonce ce même
§17.8 (« tout ce qui fait la valeur probante d'une trace vient du serveur, jamais de
l'appelant ») a été appliqué à une colonne d'une table, et à aucune autre.

**Scénario 2 — la ligne définitivement immodifiable.** `version` est un `integer`.

```
insert into risques (id, filiale_id, nom, version)
  values ('R-GEL','FIL-A','Risque gele', 2147483647);                        INSERT 0 1

update risques set nom='essai' where id='R-GEL' and version=2147483647;
ERROR:  integer out of range
CONTEXT:  PL/pgSQL function f_maj_tracabilite() line 3 at assignment

delete from risques where id='R-GEL';                                        DELETE 1
```

`new.version := old.version + 1` déborde. La ligne ne peut **plus jamais** être modifiée —
l'erreur avorte de surcroît la transaction entière, donc toute opération composite qui la
touche. Elle reste supprimable, ce qui limite les dégâts à une perte de donnée plutôt qu'à
un blocage définitif ; mais dans un registre de conformité, « supprimez et recréez » n'est
pas une réponse : la ligne portait un historique.

**Portée.** Le rôle applicatif, dans sa propre filiale, sans drapeau ni privilège
particulier. Il ne franchit aucune frontière de filiale — c'est pourquoi ce n'est pas un
bloquant. Mais il met en échec le texte de preuve du contrôle S4, et il est **sur le chemin
direct de L2 et de L7** : la couche d'accès générique par entité (L2) et l'import généralisé
(L7) écriront des `insert` à partir de structures venues du client. La reprise
`grc-backup`, elle, est propre sur ce point et le dit (`src/reprise/index.ts` : « ni
`filiale_id`, ni `cree_par`, ni `version` ne sont posés ici ») — mais elle produit une charge,
pas une insertion, et rien dans la base ne rattrapera une couche d'écriture moins prudente.

**Ce qui ferme.** Un déclencheur `before insert` symétrique de `f_maj_tracabilite()`
(`new.version := 1; new.cree_le := now(); new.cree_par := f_utilisateur_courant();
new.modifie_le := null; new.modifie_par := null`), posé sur les mêmes tables et par la même
boucle. Variante plus radicale et tout aussi valable : `revoke insert (version, cree_le,
cree_par) on … from grc_app`. Dans les deux cas, un cas d'essai « une ligne créée avec
`version = 42` naît en version 1 » et un balayage « toute table métier porte un déclencheur
`before insert` », faute de quoi le correctif ne serait pas plus éprouvé que le défaut.

### T-2 · MAJEUR — Une action de portée Groupe réécrit les lignes de filiales qu'elle ne lit pas

**Où.** `fk_personnes_utilisateur` : `personnes.utilisateur_id → utilisateurs(id) ON DELETE
SET NULL`. C'est la **seule** action référentielle du schéma qui traverse une frontière de
niveau sans être bornée par `filiale_id`. Les deux autres `set null` sont correctes
(`fk_incidents_risque` et `fk_filiales_logo` sont composites) ; les trois autres références
à `utilisateurs` sont en `restrict`.

**Scénario.** Un RSSI groupe supprime un compte, en administration Groupe, avec un périmètre
réduit à `FIL-A` :

```
-- état initial : une personne de portée Groupe, une à Toulouse, une en Allemagne
   id   | filiale_id | utilisateur_id | version |   cree_par   | modifie_par
 PERS-A | FIL-A      | UTIL-1         |       1 | admin-groupe |
 PERS-B | FIL-B      | UTIL-1         |       1 | admin-groupe |
 PERS-G |            | UTIL-1         |       1 | admin-groupe |

-- session : grc.utilisateur='rssi-groupe', grc.filiales='FIL-A', grc.filiale_id='FIL-A'
select count(*) from personnes where filiale_id = 'FIL-B';   →  0   (il ne la voit pas)
delete from utilisateurs where id = 'UTIL-1';                →  DELETE 1

-- état après
   id   | filiale_id | utilisateur_id | version |   cree_par   | modifie_par | horodate
 PERS-A | FIL-A      |                |       2 | admin-groupe | rssi-groupe | t
 PERS-B | FIL-B      |                |       2 | admin-groupe | rssi-groupe | t
 PERS-G |            |                |       2 | admin-groupe | rssi-groupe | t
```

Une ligne de la filiale allemande, **que la session ne peut pas lire** (`count = 0`), a été
modifiée : son lien a été rompu, sa `version` incrémentée, et `modifie_par` porte le nom de
quelqu'un qui n'y a jamais travaillé.

**Pourquoi la RLS ne l'arrête pas.** La politique d'écriture de `personnes` exige
`filiale_id = f_filiale_ecriture()`. Elle n'est jamais évaluée : les contrôles d'intégrité
référentielle de PostgreSQL contournent délibérément la RLS. C'est exactement le
raisonnement écrit au §17.1 pour les clés étrangères — appliqué aux clés, et **jamais aux
actions référentielles**.

**Pourquoi c'est le même défaut que B-1 et que §17.6.** Le §17.6 s'ouvre sur : « une action
de portée Groupe ne doit pas modifier les données d'une filiale à son insu », et décrit
l'effet à éviter : « incrémente leur `version` et inscrit dans leurs lignes le nom de
quelqu'un qui n'y a jamais travaillé — la pathologie exacte du constat bloquant B-1 ». C'est
mot pour mot ce que la sortie ci-dessus montre. La règle a été appliquée à
`mesure_catalogue` (quatre références passées en `restrict`) et n'a été balayée nulle part
ailleurs.

**Conséquence pratique au-delà de la traçabilité.** L'incrément de `version` casse le
verrouillage optimiste (risque projet P1) pour les utilisateurs des dix-neuf autres filiales
qui éditaient ces fiches : ils recevront un `GRC03` « modifié entre-temps » sans que
personne chez eux n'ait rien modifié — le premier rapport avait déjà signalé cet effet pour
B-1.

**Pourquoi majeur et non bloquant.** L'opération est une action d'administration Groupe, pas
une opération ordinaire de filiale ; l'effet est la mise à `null` d'une colonne facultative
et un incrément de version, pas une destruction ; et la suppression d'un compte n'est pas le
chemin nominal de déprovisionnement (`actif = false`, `PLAN_SERVEUR` §1.5). Elle le
deviendra en **L13** (cycle de vie, purges RGPD). Je note toutefois, pour que l'arbitrage
soit fait en connaissance de cause, que le drapeau d'administration n'est pas un privilège
(§17.4) : dans le modèle « rôle applicatif compromis », le chemin est ouvert à n'importe
quelle session.

**Ce que le banc d'essai en dit.** Rien. J'ai injecté la correction — `on delete set null` →
`on delete restrict` — et rejoué le banc :

```
ℹ tests 269 · pass 269 · fail 0
```

`grep -rn "delete from utilisateurs" test/ db/verifier_cloisonnement.sql` ne rend **aucune
ligne** : la suppression d'un compte n'est exercée nulle part, ni par les 269 tests, ni par
les 76 contrôles. C'est la signature exacte que le second rapport avait identifiée pour N-1.

**Ce qui ferme.** `on delete restrict`, cohérent avec les trois autres références à
`utilisateurs` (et avec le fait que le §12 veut qu'une trace survive à la disparition du
compte) ; ou, si la rupture du lien est voulue, un chemin applicatif explicite qui délie
filiale par filiale, dans le périmètre, comme le fait déjà la couche applicative pour
`mesure_catalogue` (§17.6). Plus, dans les deux cas, **un balayage** : « toute action
référentielle qui franchit une frontière de niveau est-elle bornée par `filiale_id` ? » —
le motif employé pour les clés étrangères et pour les `restrict` du catalogue, étendu aux
actions.

### T-3 · MAJEUR — L'acteur du journal peut être nul en silence, et le seul test qui le couvre efface la question

**Où.** `f_journal_audit_chainage()` (001) :

```sql
new.utilisateur_id := (select u.id from utilisateurs u where u.id = f_utilisateur_courant());
```

Le déclencheur **joint** le réglage de session à la **clé primaire** de `utilisateurs`, et
met `null` quand il ne trouve rien. Or `grc.utilisateur` a deux contrats incompatibles dans
le code livré :

| Où | Ce que le réglage est censé contenir |
|---|---|
| `001_socle.sql`, exemple d'emploi | `set local grc.utilisateur = 'jdupont';` — un **sAMAccountName** |
| `f_utilisateur_courant()`, commentaire | « Identifiant de l'utilisateur de la transaction […] Alimente `cree_par` / `modifie_par` » — un **libellé lisible**, écrit dans les 47 tables |
| `f_journal_audit_chainage()` | joint à `utilisateurs.id`, un **`id_metier`** (`UTIL-…`) |
| `src/db/pool.ts` | `utilisateurId` — « tel qu'il sera tracé dans le journal d'audit » ; `PERIMETRE_SYSTEME` y met `'systeme'` |

`utilisateurs` porte **deux** colonnes distinctes : `id` (`id_metier`) et `identifiant`
(sAMAccountName, unique sur `lower(identifiant)`). Les deux contrats ne peuvent pas être
vrais ensemble, et **les deux échouent en silence** :

```
-- grc.utilisateur = 'jdupont' (le login), le compte existant portant id = 'UTIL-1'
insert into personnes  (…)            -- puis
insert into journal_audit (filiale_id, utilisateur_libelle, action, resume) values (…);

           source            |   valeur
 personnes.cree_par          | jdupont         <- correct, lisible
 journal.utilisateur_id      | (NUL)           <- l'acteur a disparu
 journal.utilisateur_libelle | Jean Dupont     <- fourni par le client, seule identité restante
```

Si L3 met le **login**, chaque entrée du journal — de l'ouverture de session à l'export —
prend la branche « acteur nul », et l'identité affichée est celle que l'appelant a bien
voulu écrire. Si L3 met l'**identifiant métier**, la correction N-5 fonctionne, mais
`cree_par` et `modifie_par` deviennent des `UTIL-1720000000000-482` sur les 47 tables :
l'application perd la lisibilité que le produit mono-filiale avait, et il faudra une
jointure pour afficher un nom.

**Ce qui rend cela majeur plutôt que mineur : rien ne le signalerait.** La branche nulle est
*légitime* et *documentée* (traitements système, échec de connexion sur un compte inconnu),
la chaîne d'empreintes reste intacte, `f_journal_audit_verifier()` ne renvoie rien, et le
banc d'essai la **bénit** explicitement (`test/base/rls.test.mjs` : « un identifiant de
session sans compte connu donne un acteur NUL, pas un échec »). Le seul test qui prouve la
correction N-5 contourne la question en provisionnant un compte dont **l'`id` est le
login** :

```js
await c.query(`insert into utilisateurs (id, identifiant, nom_affichage)
                 values ($1, $2, 'Compte d''essai') …`, [utilisateur, utilisateur]);
//                        ^^^ id = 'alice'   ^^^ identifiant = 'alice'
```

Le mécanisme est donc prouvé dans la seule configuration qui n'existera pas en production.
Aucune assertion, nulle part, ne dit qu'un utilisateur **connu et authentifié** produit un
acteur non nul lorsque `id ≠ identifiant`.

**Ce que la branche nulle ouvre, par ailleurs.** Elle n'exige rien du tout. La politique
d'ajout du journal est
`case when filiale_id is null then true else filiale_id = f_filiale_ecriture() end` : sur la
branche gauche, **ni périmètre, ni filiale active, ni drapeau**. Depuis une session dont les
quatre réglages sont vides :

```
insert into journal_audit (filiale_id, utilisateur_libelle, action, resume, valeurs_apres)
  values (null,'alice.martin (RSSI groupe)','export','Export complet du perimetre Groupe',
          '{"fichier":"tout.xlsx"}'::jsonb);                              INSERT 0 1

 numero |  fil  |  uid  |    utilisateur_libelle     | action |               resume
      2 | (nul) | (NUL) | alice.martin (RSSI groupe) | export | Export complet du perimetre Groupe

select count(*) from f_journal_audit_verifier();   →  0     (chaîne intacte)
delete from journal_audit where action = 'export';
ERROR:  Table journal_audit en ajout seul : opération DELETE refusée.
```

Une entrée d'audit **fabriquée**, numérotée et horodatée par le serveur, chaînée, scellée,
qui accuse nommément une personne d'un export qu'elle n'a pas fait — et que l'inaltérabilité
rend **impossible à retirer**. Le §17.8 avait justifié de laisser `utilisateur_libelle` au
client par « c'est un confort de lecture qui doit survivre à la disparition du compte » ;
cette justification suppose que `utilisateur_id` porte la vérité **à côté**. Quand il est
nul, le confort de lecture *est* l'identité.

**Ce qui ferme.** Trois pièces, aucune coûteuse : (1) arbitrer par écrit dans
`CONVENTIONS.md` ce que `grc.utilisateur` contient, et corriger l'exemple `'jdupont'` du
socle en conséquence ; (2) faire dire au déclencheur la différence entre « pas d'acteur »
(chaîne vide ou `'systeme'`, légitime) et « acteur non résolu » (une valeur qui ne désigne
aucun compte, qui est un défaut : `GRC04` plutôt qu'un `null` muet) ; (3) un cas d'essai où
`utilisateurs.id ≠ utilisateurs.identifiant`.

### T-4 · MAJEUR — Le garde-fou de couverture RLS n'est appelé par rien de ce qui s'exécute au déploiement

**Le fait.** `f_verifier_couverture_rls()` et `f_verifier_chemin_recherche()` sont appelées
par les migrations, par `test/base/rls.test.mjs` et par `db/verifier_cloisonnement.sql`.
Elles ne sont appelées ni par `db/migrate.mjs`, ni par `deploy/install.sh` :

```
$ grep -c "relrowsecurity\|relforcerowsecurity\|pg_policy\|row level security\|f_verifier_couverture_rls" deploy/install.sh
0
```

**Zéro occurrence.** Et la section §9 de ce script s'intitule « Contrôles de sécurité — on
vérifie, on ne suppose pas », et annonce : « Ces contrôles rejouent la partie “base de
données” de la grille du `docs/PLAN_EXECUTION.md` §4 (**S1 cloisonnement**, S3 journal
inaltérable) ». Ce qu'ils vérifient réellement : les attributs des rôles, l'héritage de
rôle, le propriétaire de la base, les privilèges et les déclencheurs de `journal_audit`, les
privilèges de `migrations_schema`. **Pas une ligne sur la RLS**, qui est pourtant le seul
objet du contrôle S1.

**Pourquoi les migrations ne rattrapent pas.** Elles ne sont pas rejouées. Sur une base à
jour — c'est-à-dire à chaque ré-exécution de `install.sh`, et **sur le chemin
`--reprendre-propriete`** :

```
  001_socle.sql ............... déjà appliquée
  …
Schéma à jour : 4 migration(s), rien à appliquer.
```

Le garde-fou du §8 de `004_rls.sql` ne s'exécute jamais.

**Scénario 1 — une installation ouverte se déclare conforme.** J'ai saboté une base saine,
puis rejoué à la main les trois contrôles que `install.sh` exécute :

```
alter table risques no force row level security;
drop policy pol_risques_lecture on risques;
create policy pol_risques_lecture on risques for select using (true);

contrôle S3 « journal »        →  (vide)            = VERT
contrôle S3 « déclencheurs »   →  (aucun desarme)   = VERT
contrôle S14 « registre »      →  (vide)            = VERT
```

Trois contrôles verts, « Installation terminée ». Ce que la fonction non appelée aurait dit :

```
  objet  |        anomalie        |  detail
 risques | force_absente          | la table n'a pas « force row level security » …
 risques | lecture_non_cloisonnee | une politique de lecture ne consulte pas le périmètre …
```

Et l'effet réel, sous `grc_app`, périmètre `FIL-B` :

```
   id   | filiale_id |        nom
 RISK-A | FIL-A      | Secret de Toulouse
```

**Ce scénario n'est pas théorique sur le chemin de réparation.** `--reprendre-propriete`
existe précisément parce qu'une installation antérieure a pu donner les tables au compte du
service. Le script raisonne juste sur les déclencheurs — « une base dont le compte du
service était propriétaire a pu voir ses déclencheurs désarmés […] on les réarme » — et
s'arrête là. Le même compte a pu tout aussi bien faire `alter table … disable row level
security` ou `drop policy`. La réparation restaure la troisième couche du journal et laisse
le cloisonnement dans l'état où elle l'a trouvé, sans le regarder.

**Scénario 2 — la table neuve qui ne fuit pas en silence, mais qui fuit.** Le commentaire de
`f_verifier_couverture_rls()` dit : « À appeler par toute migration future qui crée une
table : sans politique, elle doit échouer au déploiement, pas fuir en silence. » L'appel est
laissé à la discipline de l'auteur de la migration à venir, et **rien ne l'impose**. Sur une
base à jour, j'ai déposé une migration qui crée une table sans rien d'autre :

```
  000_prealable.sql ........... appliquée en 2 ms
Schéma à jour : 1 migration(s) appliquée(s) sur 5.        (code de sortie 0)

select * from f_verifier_couverture_rls();
    objet     |          anomalie          | …
 zz_prealable | rls_desactivee             | …
 zz_prealable | force_absente              | …
 zz_prealable | politique_lecture_absente  | …
 zz_prealable | politique_ecriture_absente | …

select has_table_privilege('grc_app','zz_prealable','select');   →  t
```

Une table lisible de toutes les filiales, créée sans un mot, avec un code de sortie zéro.
Les lots L2 à L15 apporteront des migrations ; le filet censé les rattraper n'est branché
sur rien.

**Ce qui ferme.** Deux appels. `migrate.mjs`, après avoir appliqué (et aussi en mode
`--verifier`), joue `select * from f_verifier_couverture_rls()` et
`select * from f_verifier_chemin_recherche()` et sort en erreur si l'une renvoie une ligne.
`install.sh` §9 fait le même contrôle, avec le message qui va avec. C'est la seule manière
de rendre vraie la phrase que la section §9 écrit déjà.

### T-5 · MINEUR — « Aucun flux légitime n'en souffre » : la création d'une filiale en souffre

Le §17.9 justifie le recoupement de `f_filiale_ecriture()` par : « **Aucun flux légitime
n'en souffre**, et c'est vérifiable : un périmètre système n'a pas de filiale active […] ;
une administration Groupe […] bascule entre des filiales **de** son périmètre. » Deux flux
sont nommés. Un troisième existe, et il est au programme du lot L4 (« création de filiale ») :

```
-- administration Groupe, périmètre FIL-A
insert into filiales (id, code, raison_sociale, pays) values ('FIL-C','ESP','Espagne','ES');
INSERT 0 1                                                    -- la création passe

-- amorcer la filiale neuve, filiale active restée FIL-A
insert into referentiels_actifs (id, filiale_id, ref_id) values ('RA-1','FIL-C','anssi-hygiene');
ERROR:  new row violates row-level security policy for table "referentiels_actifs"

-- ... en basculant la filiale active sur FIL-C
select set_config('grc.filiale_id','FIL-C',true);
insert into referentiels_actifs (id, filiale_id, ref_id) values ('RA-1','FIL-C','anssi-hygiene');
ERROR:  Filiale active FIL-C hors du périmètre lisible de la session : on n'écrit pas dans
        une filiale que l'on ne lit pas.                              (GRC04)
```

La filiale vient d'être créée : elle ne peut pas figurer dans un périmètre résolu à
l'ouverture de session. Créer une filiale et l'amorcer dans le même mouvement est donc
impossible.

Le remède est trivial — étendre `grc.filiales` dans la même transaction, ou re-résoudre le
périmètre après la création — et le comportement de la base est **correct** : c'est bien la
propriété qu'on veut. Ce qui est en défaut, c'est la **phrase normative**, quatrième
affirmation du §17 à ne pas correspondre au code (`search_path` sans `pg_temp`, une barrière
qui n'en est pas une, un archivage sans mécanisme, un `revoke` annoncé explicite en trois
endroits). Elle doit dire ce qui est vrai, et L4 doit savoir ce qui l'attend.

### T-6 · MINEUR — Sur les tables de configuration, le refus d'écriture est muet en modification et en suppression

Les migrations posent, à trois endroits, le principe que le refus doit être **bruyant** : le
§12 écarte les `rule … do instead nothing` parce qu'« une règle transforme la suppression en
opération silencieuse qui RÉUSSIT » ; le §6 de `004` garde des politiques ouvertes sur
`journal_audit` pour la même raison ; et la règle n° 4 du fichier pose qu'une écriture sans
filiale active doit échouer bruyamment, « un refus muet (“0 ligne insérée”) serait très
coûteux à diagnostiquer ».

Les cinq tables de configuration ne suivent pas cette règle :

```
-- session de filiale, sans le drapeau d'administration
update filiales set raison_sociale='Pirate' where id='FIL-A';
UPDATE 0                        <-- aucune erreur, aucune trace, l'appelant croit avoir agi
```

L'`insert`, lui, lève bien `42501` (« new row violates row-level security policy ») — c'est
ce que teste C44. **La démonstration n'éprouve que la moitié bruyante** : aucun des 76
contrôles ni des 269 tests n'exerce un `update` ou un `delete` refusé sur ces tables. Pour
un module d'administration qui affichera « enregistré » sur un `UPDATE 0`, l'écart compte.

### T-7 · MINEUR — Une filiale sans le drapeau écrit dans `filiales` par action référentielle

Corollaire de T-2, sur un chemin où il est borné. `fk_filiales_logo` est composite et ne peut
donc toucher que la ligne de la filiale concernée — le correctif N-2 est bon. Mais l'action
référentielle contourne la politique d'écriture, qui exige l'administration Groupe :

```
-- session FIL-A, grc.administration_groupe vide
update filiales set raison_sociale='Pirate' where id='FIL-A';    UPDATE 0   (refusé)
   version_avant | modifie_par_avant
               2 | semeur

delete from pieces_jointes where id='PJ-A';                      DELETE 1   (sa propre pièce jointe)

   version_apres | modifie_par_apres | logo
               3 | semeur            | (nul)
```

La propriété « ces tables ne sont écrites qu'en administration Groupe » n'est donc pas
absolue. L'effet est borné (une colonne, la propre ligne de la session), mais il incrémente
`filiales.version` : un administrateur Groupe qui éditait la fiche au même moment recevra un
conflit de version provoqué par un utilisateur qui n'a pas le droit d'écrire là. À arbitrer
et à écrire, comme le reste du §17.4.

### T-8 · MINEUR — L'espace des identifiants métier est de niveau Groupe, alors que les données sont de niveau filiale

Toutes les clés primaires métier sont `unique (id)` sur l'ensemble du groupe, et les
contraintes d'unicité, comme les clés étrangères, **ignorent la RLS**. La filiale B se voit
donc refuser un identifiant qu'elle ne peut pas voir :

```
-- FIL-A détient RISK-A ; session FIL-B
select count(*) from risques where id='RISK-A';                  →  0    (invisible)
insert into risques (id, filiale_id, nom) values ('RISK-A','FIL-B','le mien');
ERROR:  23505: duplicate key value violates unique constraint "pk_risques"
SCHEMA NAME:  public   TABLE NAME:  risques   CONSTRAINT NAME:  pk_risques
```

L'oracle est **faible** — PostgreSQL masque les valeurs de clé, il faut donc deviner
l'identifiant pour apprendre quelque chose — mais le **déni est ferme** : cet identifiant est
définitivement indisponible pour B, sans explication qu'elle puisse comprendre. Deux
décisions du lot L1 rendent la chose non hypothétique : le §2 conserve délibérément les
identifiants texte de l'export `grc-backup` « pour que l'import soit un round-trip exact »,
et la reprise admet explicitement les formes anciennes — sans suffixe aléatoire, voire sans
préfixe (`processus-facturation` dans les jeux d'essai). Vingt filiales important chacune
leur historique (L7, « import généralisé », critère décisif client) partagent le même espace
de nommage.

Ce n'est pas une brèche de cloisonnement et je ne le présente pas comme telle. C'est une
**condition d'entrée de L2 et L7** : l'API devra traduire `23505` en un message qui ne parle
pas d'une ligne invisible, et l'import devra dire à l'opérateur ce qu'il doit faire quand un
identifiant est déjà pris ailleurs. Le dire maintenant coûte moins cher qu'un `alter` sur une
base peuplée — c'est l'argument même du §17.3.

### T-9 · MINEUR — `backend/README.md` §8 ne reflète plus l'état réel

Point 6 de la définition de « terminé » (§5). Les chiffres annoncés sont ceux d'un état
révolu :

| Ce que le README annonce | Ce que j'ai mesuré |
|---|---|
| « **28 contrôles** » (deux fois : §« Cloisonnement par filiale » et §8) | **76 contrôles**, 76 réussis |
| « **144 tests** `node:test` (78 sur la base […] ; 66 sur la reprise) » | **269 tests**, 269 réussis |

Ce sont précisément les chiffres qui constituent la preuve du lot. Le reste du §8
(« Réserves ») est en revanche exact et honnête, y compris la mention que la porte S1 est en
cours d'instruction et qu'aucun verdict n'y est annoncé.

### Observations (sans scénario d'exploitation)

**T-10 — `f_verifier_chemin_recherche()` accepte `pg_temp` en première position.** Le §17.2
est catégorique : « `pg_temp` doit être **NOMMÉ, et nommé en dernier** », et donne la mesure
qui le justifie. Le garde-fou ne vérifie que la première moitié (`v_chemin not like
'%pg_temp%'`). Une fonction déclarée `set search_path = pg_temp, pg_catalog, public` passe
sans un mot :

```
create or replace function f_essai_chemin_en_tete() returns int
  language sql stable set search_path = pg_temp, pg_catalog, public as $$ select 1 $$;
select * from f_verifier_chemin_recherche() where objet like 'f_essai%';
(0 rows)
```

Sans effet aujourd'hui — les dix-huit fonctions livrées ont toutes le bon ordre, et personne
d'extérieur n'écrit de migration — mais c'est un garde-fou qui affirme plus qu'il ne
vérifie, ce que le §17.5 range précisément parmi les choses qui « endorment la vigilance ».
Second angle, de la même famille : le balayage ne retient que `p.prokind = 'f'` ; une
procédure (`prokind = 'p'`) y échapperait. Il n'y en a aucune aujourd'hui (18 fonctions,
0 procédure).

**T-11 — `f_verifier_couverture_rls()` ne balaie que `relkind = 'r'`.** Les 47 tables sont
toutes ordinaires, donc sans effet immédiat ; une table partitionnée (`'p'`) échapperait au
balayage, alors que le contrôle d'appartenance du §0 de `004`, lui, pense à
`relkind in ('r','p','v','m')`. Le commentaire de la fonction dit « TOUTE table du schéma
public ».

**T-12 — La colonne engendrée casse l'aller-retour naïf, sur deux tables.** Effet de bord du
correctif N-10, à connaître avant L2 et L7 :

```
insert into documents (id, filiale_id, titre, …, portee_groupe) values (…, false);
ERROR:  cannot insert a non-DEFAULT value into column "portee_groupe"
DETAIL:  Column "portee_groupe" is a generated column.
```

`documents` et `document_referentiels` sont les deux seules tables du schéma pour lesquelles
un `select *` ne se réinsère pas tel quel, et pour lesquelles `COPY … FROM` sans liste de
colonnes échoue. La charge produite par `src/reprise/**` n'est pas concernée (elle est
construite champ par champ, et le module ne pose ni `filiale_id`, ni `cree_par`, ni
`version`) ; c'est la couche d'écriture de L2 et l'export/réimport d'exploitation
(`PLAN_SERVEUR` §2.7, « export complet remis à l'acquéreur ») qui doivent employer une liste
de colonnes explicite. Une ligne dans `CONVENTIONS.md` suffirait.

**T-13 — La démonstration affirme une propriété que le schéma cessera de tenir.**
`db/verifier_cloisonnement.sql` se termine par la phrase qui sera montrée à l'auditeur ISO
27001 : « CLOISONNEMENT DÉMONTRÉ : la filiale de Toulouse ne voit aucune ligne de la filiale
allemande […] ». Dans le même tableau, C22 enregistre « Journal d'audit : lecture NON
cloisonnée (dérogation assumée) » avec le verdict « **OK (constaté)** ». Les deux sont vrais
aujourd'hui parce que le journal est vide. Ils cesseront de l'être dès que L5 alimentera
`valeurs_avant` / `valeurs_apres` — j'ai vérifié qu'une seule entrée suffit :

```
-- session grc_app, périmètre strictement FIL-A
select count(*) from risques where filiale_id='FIL-B';      →  0
select filiale_id, valeurs_apres->>'description' from journal_audit where filiale_id='FIL-B';
 FIL-B | Vol de propriete intellectuelle chez le sous-traitant Muller GmbH
```

La NOTICE finale gagnerait à porter sa réserve, plutôt qu'à laisser un lecteur pressé
conclure. À noter aussi, puisque le commentaire de la migration présente le risque comme un
« défaut de filtrage applicatif » : `grc_lecture` — le compte de supervision et d'exports
d'exploitation — dispose de `select` sur `journal_audit` et lit donc la même copie fantôme,
sans passer par l'application du tout.

---

## 5. Le banc d'essai mord-il encore ?

Exigence de la porte : un test qui passe quoi qu'on fasse ne prouve rien. J'ai copié le
backend hors du dépôt et cassé **sept** propriétés, choisies dans le périmètre corrigé au
second passage — donc celles que personne n'avait encore éprouvées par mutation.

| # | Propriété cassée | Résultat |
|---|---|---|
| 1 | Condition d'appartenance retirée de `f_filiale_ecriture()` (régression N-1) | **4 échecs** — « LE CAS OUVERT : écrire dans une filiale NI lue NI active », « et le JOURNAL D'AUDIT non plus », « même la filiale LUE est refusée si elle n'est pas la filiale ACTIVE », « un périmètre de lecture VIDE ferme aussi l'écriture » |
| 2 | `filiales` remise parmi les tables ouvertes (régression N-2) | **6 échecs**, dont « LE CAS DEMANDÉ : la filiale A ne modifie pas la fiche de la filiale B » et **« LE BALAYAGE : les cinq tables de configuration ont bien une écriture conditionnée »** |
| 3 | Écrasement de l'acteur retiré du chaînage (régression N-5) | **3 échecs** |
| 4 | Quatrième réglage non reposé à chaque transaction (régression N-4) | **19 échecs** |
| 5 | Déclencheurs de cohérence et de portée armés en `origin` (régression N-11) | **1 échec**, précisément ciblé |
| 6 | `fk_document_referentiels_portee` retirée (régression N-10) | **1 échec**, qui porte le nom du constat |
| 7 | Contrainte `état ↔ date d'archivage` relâchée (régression N-6) | **1 échec** |

**Sept sur sept.** La sensibilité est excellente, et elle s'est étendue exactement là où le
second rapport la disait absente : le correctif N-1, dont l'injection ne changeait alors
rien, fait aujourd'hui tomber quatre tests ; la mutation n° 2 tombe sur un **balayage** des
cinq tables de configuration, c'est-à-dire le filet structurel que le second rapport appelait
de ses vœux.

**Et la mesure inverse, celle qui compte pour un troisième passage.** J'ai injecté la
correction de **T-2** — `fk_personnes_utilisateur` passée de `set null` à `restrict` :

```
ℹ tests 269 · pass 269 · fail 0
```

Rien ne bouge. Ni les 269 tests, ni les 76 contrôles n'exercent la suppression d'un compte
(`grep -rn "delete from utilisateurs"` : aucune ligne). Même constat pour T-1 : aucun test
n'insère une ligne en fournissant `version`, `cree_par` ou `cree_le` ; et pour T-3 : le seul
test de l'acteur provisionne un compte dont l'`id` **est** le login.

**Conclusion, et elle est la même pour la troisième fois : la sensibilité est excellente, la
couverture reste le point faible, et c'est exactement là que les constats neufs se
trouvent.** Le remède structurel n'est toujours pas d'ajouter des cas mais des **balayages**.
Trois manquent, et chacun aurait attrapé un de mes majeurs :

- « toute action référentielle qui franchit une frontière de niveau est-elle bornée par
  `filiale_id` ? » → T-2 ;
- « toute table métier porte-t-elle un déclencheur `before insert` qui impose `version`,
  `cree_le` et `cree_par` ? » → T-1 ;
- « le garde-fou de couverture est-il appelé par ce qui s'exécute au déploiement ? » → T-4.

---

## 6. La définition de « terminé » (§5)

| # | Point | Constat |
|---|---|---|
| 1 | **Ça compile** | OK — `npm run verifier-types`, exit 0, mode `strict` |
| 2 | **Ça s'applique depuis zéro** | OK — quatre migrations rejouées sur base neuve par `migrate.mjs`, sans intervention, et une panne injectée ne laisse aucun état intermédiaire (§3, S14) |
| 3 | **C'est prouvé** | OK — `npm test` : **269 tests, 0 échec** ; `verifier_cloisonnement.sql` sous `grc_app` : **76 contrôles, 76 réussis** ; `npm audit` : 0 vulnérabilité |
| 4 | **C'est conforme** | **Réserve** — T-1 est un écart au §3 (colonnes obligatoires) et au principe du §17.8 ; T-2 est un écart au §17.6 ; T-5 est un écart du §17.9 à lui-même ; T-10 un écart du garde-fou au §17.2 |
| 5 | **C'est en français** | OK, sans exception, y compris les messages d'erreur, les `hint` et les `comment on` |
| 6 | **C'est documenté** | **Réserve** — `README.md` §8 annonce 28 contrôles et 144 tests là où il y en a 76 et 269 (T-9). Le second passage n'avait pas évalué ce point ; il est évaluable, et il est en défaut |
| 7 | **C'est dans le périmètre** | **Réserve** — les commits de correction restent transverses, `CONVENTIONS.md` (réservé à l'orchestrateur) compris (m-6, non corrigé) |
| 8 | **Les manques sont dits** | OK, et c'est toujours la meilleure partie du dossier : le report L3 des trois tables de session est écrit, daté et **épinglé par un test qui tombera le jour où il sera levé** ; la dérogation de lecture du journal est annoncée, sa correction esquissée et attribuée à L5 ; l'arbitrage `mappings` est désormais écrit au lieu d'être déduit ; et le §17.4 dit maintenant ce que le drapeau d'administration n'est pas |

---

## 7. Ce que la grille ne couvre pas à ce stade

**Six des quinze contrôles restent sans objet ou documentaires** parce que le code qu'ils
visent n'existe pas : S6, S7, S9, S11, la moitié « API » de S4, la moitié « cookie » de S10.
Une porte S1 franchie ne dirait donc rien de la sécurité du produit — seulement que le schéma
et le cloisonnement sont sains.

Les trois angles morts du second passage sont reconduits sans changement, et je n'ai rien à
y ajouter : le cloisonnement n'est prouvé qu'au niveau SQL (rien de bout en bout,
navigateur → Apache → Fastify → PostgreSQL ; c'est l'objet de la porte S4) ; l'autorisation
n'existe pas (la RLS répond à « quelles lignes », jamais à « qui a le droit de faire quoi »,
et toute personne disposant des identifiants `grc_app` conserve un accès complet au socle
d'authentification et au journal) ; la complétude du journal est invérifiable (vingt actions
prévues, aucune émise).

**Un quatrième angle mort, que ce passage met en évidence.** La grille §4 est écrite en
quinze contrôles de **comportement**, et elle ne demande nulle part que les garde-fous soient
**branchés**. C'est ainsi que T-4 a pu traverser deux passages : `f_verifier_couverture_rls()`
existe, est correcte, est testée, est montrée à l'auditeur — et n'est appelée par rien de ce
qui tourne sur la machine cible. Un contrôle « les vérifications automatiques sont-elles
exécutées là où elles doivent l'être ? » manque à la grille, et il vaudrait pour toutes les
portes à venir.

**Ce qui reste explicitement pour le test d'intrusion de L15**, et que la grille ne remplacera
pas : l'enchaînement de faiblesses mineures en chemin d'attaque complet (typiquement T-8 pour
énumérer, T-1 pour antidater, T-3 pour attribuer la trace à quelqu'un d'autre), la couche
Apache en conditions réelles (renégociation TLS, désynchronisation de requêtes, contrebande
d'entêtes vers le mandataire — la configuration efface bien les six entêtes de transfert
entrantes, encore faut-il l'éprouver), la robustesse du VPN comme chemin d'accès unique, la
résistance des exports et des pièces jointes à un contenu piégé, et l'ingénierie sociale sur
le compte de secours.

**Limites assumées, reconduites telles quelles** : ni `root` sur la VM, ni le propriétaire de
la base ne sont dans le modèle de menace (`CONVENTIONS` §12). Je l'ai constaté sans en faire
un constat : sous `grc_proprietaire`, un `alter table … no force row level security` suffit à
ouvrir une table — et c'est justement pourquoi T-4 compte, puisque rien, au déploiement, ne
constate qu'on l'a fait.

---

## 8. Ce que je n'ai pas pu vérifier ici

| Sujet | Pourquoi |
|---|---|
| **PostgreSQL 17** | La machine porte **16.13**, la cible est **17**. Aucune fonctionnalité postérieure à 15 n'est employée et le garde en tête de `004` exige 15 au minimum. Mais le comportement de la RLS, des contrôles d'intégrité référentielle, des **actions référentielles** (T-2), des **colonnes engendrées** (T-12), du masquage des valeurs de clé dans les messages d'erreur (m-1, T-8) et de `pg_temp` n'a été observé qu'en 16. **À rejouer sur 17 avant la mise en service.** |
| **`install.sh` de bout en bout** | Ni Debian 13, ni Apache, ni systemd, ni `apt`. Le script a été **lu intégralement**, et sa section §9 reproduite à la main sur ma base — c'est ainsi que T-4 a été établi. Le reste (unité systemd, vhost, création d'utilisateur système, droits de fichiers) repose sur la lecture. S10 et une partie de S8 sont donc des contrôles documentaires. |
| **ClamAV** | Absent. S9 reste sans objet jusqu'à la porte S4. |
| **Active Directory / LDAPS** | Absent. S6, S7 et S11 attendent la doublure d'annuaire (livrable OUTILLAGE de la vague 3). T-3 ne pourra être clos définitivement qu'avec L3, puisqu'il porte sur ce que L3 mettra dans `grc.utilisateur`. |
| **Relais SMTP** | Absent. La non-fuite par courriel (porte S6) n'est pas éprouvable. |
| **Volumétrie réelle** | Essais sur quelques dizaines de lignes. Les politiques de liaison font deux `exists` corrélés par ligne ; leur coût à l'échelle de vingt filiales sur trois ans n'a pas été mesuré. Réserve reconduite du second passage, **non testée, donc non affirmée**. |
| **Concurrence réelle sur le journal** | `f_journal_audit_chainage()` prend un verrou consultatif de transaction : point de sérialisation global sur la table la plus écrite du produit. Non mesuré sous charge. À éprouver en L5. |
| **Le frontend** | Hors de mon périmètre d'attaque. Je me suis borné à constater que `cyber-context` vit toujours dans `localStorage` (S2), ce qui est conforme au plan (retrait en vague 4). |
| **Synchronisation NTP** | L'horodatage du journal est posé côté serveur (`clock_timestamp()`, jamais par le client — vérifié), mais la synchronisation de la source de temps est une propriété de la VM, à vérifier au déploiement. |

---

## 9. Conditions de re-passage

La porte sera rejouée **intégralement**, une quatrième fois. Pour qu'elle soit franchissable :

1. **T-1 corrigé** — un déclencheur `before insert` qui impose `version`, `cree_le` et
   `cree_par` sur les tables métier (ou le retrait du privilège d'insertion sur ces
   colonnes), **plus** un cas d'essai (« une ligne créée avec `version = 42` naît en
   version 1 ; `cree_par` fourni est ignoré ») **et un balayage** (« toute table métier porte
   le déclencheur »). C'est ce contrôle qui met S4 en échec : sans lui, la porte ne peut pas
   passer.
2. **T-2 corrigé** — `fk_personnes_utilisateur` en `restrict`, ou un chemin applicatif
   explicite ; plus un cas d'essai « la suppression d'un compte ne touche aucune ligne hors
   du périmètre » et le **balayage des actions référentielles** qui manque au §17.1.
3. **T-3 arbitré** — écrire dans `CONVENTIONS.md` ce que `grc.utilisateur` contient,
   corriger l'exemple `'jdupont'` de `001_socle.sql`, distinguer « pas d'acteur » de
   « acteur non résolu », et ajouter un cas d'essai où `utilisateurs.id ≠ identifiant`.
   Un report est acceptable s'il est écrit et daté ; le silence ne l'est pas.
4. **T-4 corrigé** — `f_verifier_couverture_rls()` et `f_verifier_chemin_recherche()`
   appelées par `migrate.mjs` **et** par `deploy/install.sh` §9, avec échec sur toute ligne
   renvoyée. C'est le contrôle qui manque à la grille elle-même (§7).
5. **T-5 à T-9 traités ou reportés par écrit** — T-5 et T-9 sont des corrections de texte ;
   T-6, T-7 et T-8 peuvent être reportés à L2/L4 s'ils sont **inscrits**.
6. **T-10 à T-13, N-8, N-9, N-12, m-6** — traitables dans la vague 2, à condition d'être
   inscrits. T-13 mérite d'être fait tout de suite : c'est la phrase que verra l'auditeur.

Le reste du travail de la vague 1 n'appelle aucune reprise. **Le cloisonnement par filiale,
qui est la raison d'être de ce lot, tient sous attaque** — c'est la première fois qu'un
passage peut l'écrire, et il faut le dire aussi clairement que le refus.

---

*Rapport établi par l'agent SECU-3, en lecture seule sur le dépôt. Aucun fichier du code
livré n'a été modifié, aucun rapport existant n'a été touché, aucun commit n'a été fait —
`git status --porcelain` est vide en fin de revue. Les bases et scripts d'essai vivent hors
du dépôt. Base d'audit `grc_audit3` conservée en l'état ; les bases de travail
(`grc_audit3_n8`, `grc_audit3_s14`) ont été supprimées, comme les copies mutées du backend.
Les bases `grc_audit`, `grc_audit2`, `grc_correctif` et `grc_install` des travaux précédents
n'ont pas été touchées.*
