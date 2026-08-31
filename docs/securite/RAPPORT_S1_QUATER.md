# Rapport de la porte de sécurité S1 — quatrième passage (re-jeu intégral)

> Quatrième revue adversariale indépendante de la vague 1 (lot L1), après les correctifs
> apportés au refus du troisième passage. La porte est **rejouée intégralement**
> (`docs/PLAN_EXECUTION.md` §1) : les **seize** contrôles de la grille §4, S16 compris.
>
> **L'auteur de ce rapport n'a écrit aucune ligne du code examiné, et n'est l'auteur
> d'aucun des trois rapports précédents.** Travail en lecture seule : aucun fichier du
> dépôt n'a été modifié hors celui-ci, aucun `git add`, aucun commit, aucune poussée
> (`git status --porcelain` vide avant rédaction). Tous les essais ont été rejoués depuis
> zéro sur une base dédiée — **`grc_audit4`**, PostgreSQL 16.13, montée par
> `db/dev/preparer_base_dev.sh --base grc_audit4 --recreer` à partir des quatre
> migrations. Les scripts d'attaque et la copie mutée du backend vivent hors du dépôt.
> Les bases `grc_audit`, `grc_audit2`, `grc_audit3`, `grc_correctif` et `grc_install` des
> passages précédents n'ont pas été touchées.
>
> Date : 31 août 2026 · Périmètre : `backend/db/**`, `backend/src/**`, `backend/test/**`,
> `backend/deploy/**` · Rapports précédents : [`RAPPORT_S1.md`](RAPPORT_S1.md),
> [`RAPPORT_S1_BIS.md`](RAPPORT_S1_BIS.md), [`RAPPORT_S1_TER.md`](RAPPORT_S1_TER.md) ·
> Arbitrages : `backend/db/CONVENTIONS.md` §16, §17 et §18.

---

## 1. Verdict

> ## Porte FRANCHIE SOUS RÉSERVE
>
> **Aucun constat bloquant.** Le cloisonnement entre filiales tient sous tous les chemins
> que j'ai su construire, y compris ceux qu'aucun des trois passages n'avait parcourus ;
> les vingt-neuf constats antérieurs sont fermés ou explicitement reportés, et je les ai
> tous rejoués moi-même. **Cinq majeurs restent**, dont trois se corrigent par une ligne.
> Ils doivent être fermés — avec ce qui les éprouve — **avant que la vague 2 soit
> poussée**, et vérifiés à la porte S2.

**Décompte : 0 bloquant · 5 majeurs · 4 mineurs · 8 observations.**

### Ce que j'ai cherché, et pourquoi la porte passe

Trois passages ont refusé, chacun sur un chemin que le précédent ne regardait pas : les
clés étrangères, le recoupement des réglages de session, l'insertion. J'ai donc écarté
d'emblée l'idée de rejouer leurs scénarios pour conclure « rien à signaler » — je les ai
rejoués parce que la règle l'exige, mais **le travail neuf est ailleurs** : dans les
contraintes d'**unicité** (personne n'avait balayé que les clés étrangères), dans la
**valeur sentinelle** `'systeme'`, dans ce que les nouveaux `restrict` rendent
**impossible**, et dans ce qui s'exécute réellement au **déploiement** — le contrôle S16,
qui vient précisément d'être ajouté pour cette raison.

Les cinq majeurs se répartissent en deux familles :

1. **Le garde-fou neuf n'est pas branché, exactement comme le précédent ne l'était pas.**
   `f_verifier_tracabilite()` / `f_verifier_schema()` — écrites pour fermer T-1 — ne sont
   appelées **ni par `db/migrate.mjs`, ni par `deploy/install.sh`**, qui n'ont jamais été
   modifiés depuis. L'histoire du dépôt le montre à nu : le commit `0826dc6` branche les
   deux anciens garde-fous ; le commit suivant, `58431b3`, écrit le troisième et ne
   retouche aucun des deux fichiers de déploiement. Le §18.4 des conventions affirme
   pourtant que « tout contrôle automatique du schéma est appelé […] la fin d'une
   migration **et** l'installation » : c'est faux pour celui-là (**Q-1**).
2. **Trois défauts que le balayage des clés étrangères ne pouvait pas voir** : une
   contrainte d'unicité sans `filiale_id` qui permet un déni de service **irréversible**
   d'une filiale sur une autre (**Q-2**), une valeur sentinelle capturable qui fausse
   définitivement l'acteur du journal scellé (**Q-3**), la démonstration de recette qui
   **crie au loup** sur toute base portant un socle Groupe réel (**Q-4**), et un
   septième angle mort dans le garde-fou de couverture (**Q-5**).

### Pourquoi je ne refuse pas

Le critère employé depuis le premier passage est celui-ci : *corriger maintenant coûte
peu, corriger après la mise en service exige de réparer des lignes qu'on ne pourra plus
distinguer des légitimes.* Je l'applique dans les deux sens.

- **Aucun contrôle de la grille §4 n'est en échec franc.** S4 — celui qui avait fait
  refuser au troisième passage — est tenu : à l'insertion comme à la mise à jour, le
  client ne fixe plus ni `version`, ni `cree_le`, ni `cree_par`, sur les 42 tables
  concernées, et je l'ai vérifié table par table. S1 est tenu sur son texte de preuve
  exact. **S16 est tenu à la lettre** — `f_verifier_schema()` est appelée par un chemin
  de **recette** (`db/verifier_cloisonnement.sql`, contrôles C79 et C84) qui **fait bien
  échouer** ce chemin, et la grille dit « un chemin de déploiement **ou** de recette ».
  Ce qui est en défaut, c'est le texte normatif qui en promet davantage, et l'intention
  de S16, qui visait la machine cible.
- **Le contre-argument mérite d'être posé, et je le pose** : si l'orchestrateur lit S16
  comme exigeant un chemin de **déploiement** — ce que le §18.4 écrit noir sur blanc, et
  ce que la raison d'être du contrôle suggère —, alors Q-1 met S16 en échec et la porte
  doit être refusée. Je tranche pour le franchissement sous réserve parce que le schéma
  **tel qu'il est livré aujourd'hui** est correct (42 déclencheurs sur 42, vérifiés), que
  l'exposition porte sur les migrations **à venir** et sur une base trafiquée à la main,
  et que le correctif est de deux lignes dans chacun des deux fichiers. Mais je ne le
  dissimule pas derrière une lecture commode : c'est un arbitrage, et il est ici.
- **Un chantier qu'on ne laisse jamais franchir une porte finit par contourner la
  porte.** Le lot L1 est sain. Le refuser une quatrième fois sur des défauts qui ne
  touchent ni la confidentialité entre filiales, ni l'intégrité des données livrées,
  coûterait plus qu'il ne rapporterait.

### Ce que la réserve engage

| # | Majeur | Correctif | Échéance |
|---|---|---|---|
| **Q-1** | `f_verifier_schema()` appelée par aucun chemin de déploiement | 2 lignes dans `db/migrate.mjs`, 1 dans `deploy/install.sh` | **avant la première poussée de la vague 2** |
| **Q-2** | `uq_approbations_etape` sans `filiale_id` : squat irréversible inter-filiales | 1 contrainte, table vide | avant la mise en service pilote |
| **Q-3** | L'identifiant `systeme` est capturable par un compte | 1 `check`, table vide | avant la mise en service pilote |
| **Q-4** | `verifier_cloisonnement.sql` C04 : faux positif sur toute base peuplée | 1 prédicat | avant la première recette devant témoin |
| **Q-5** | `f_verifier_couverture_rls()` ignore `import_erreurs` | 1 élément de tableau | avec Q-1 |

Chacun **avec ce qui l'éprouve** : la règle « sans les tests, le correctif ne compte
pas » vaut ici comme aux trois passages précédents, et elle vaut particulièrement pour
Q-1, dont le défaut est justement d'être un contrôle que rien n'exerce.

---

## 2. Le sort des constats des trois passages précédents

Pour chacun : le statut, et **la preuve que j'ai rejouée moi-même**. Je n'ai repris aucune
sortie des rapports antérieurs, ni aucun résultat annoncé par les correcteurs. Sauf
mention contraire, les commandes tournent sous **`grc_app`** — c'est de ce rôle que parle
la question d'audit.

### 2.1 Tableau de synthèse

| # | Constat | Statut vérifié par moi |
|---|---|---|
| **B-1** | Sept clés étrangères traversant la frontière de filiale | **fermé** — balayage indépendant : 0 |
| **M-1** | `search_path` non figé, masquage par `pg_temp` | **fermé**, et le garde-fou mord désormais dans les trois cas |
| **M-2** | Substrat d'authentification non protégé | **fermé pour ce qui pouvait l'être** ; report L3 tenu ; T-6 subsiste |
| **M-3** | Drapeau Groupe : appropriation et destruction du socle | **fermé** |
| **m-1** | Oracle d'existence par les messages de contrainte | **non corrigé** sur les clés primaires (T-8) — report S12/L2 tenu |
| **m-2** | Virgule admise par le domaine `id_metier` | **fermé** |
| **m-3** | Garde-fou de couverture aveugle au prédicat non trivial | **fermé**, mais sa portée reste plus étroite que son commentaire (**Q-5**) |
| **m-4** | Journal écrit sur le périmètre de lecture | **fermé** |
| **m-5** | Bornes de la reprise payées après `JSON.parse` | **fermé** |
| **m-6** | Écarts au périmètre d'écriture des agents | **non corrigé** — les commits restent transverses |
| **N-1** | La filiale d'écriture n'était pas recoupée avec le périmètre de lecture | **fermé** |
| **N-2** | `filiales` réinscriptible par n'importe quelle filiale | **fermé** |
| **N-3** | `--reprendre-propriete` rouvrait `migrations_schema` | **fermé** |
| **N-4** | Le drapeau d'administration survivait au recyclage d'une connexion | **fermé** |
| **N-5** | L'acteur du journal était fourni par le client | **fermé** — mais la résolution est **capturable** (**Q-3**) |
| **N-6** | « Il s'archive » sans mécanisme | **fermé** |
| **N-7** | `search_path` de session divergent pool / banc d'essai | **fermé** |
| **N-8** | `migrate.mjs` applique sans un mot une migration rétro-numérotée | **partiellement fermé** — la conséquence est attrapée, l'ordre reste muet |
| **N-9** | Références polymorphes sans contrôle de cohérence | **non corrigé** — et **Q-2** en est la conséquence armée |
| **N-10** | Clé composite neutralisée pour les lignes de portée Groupe | **fermé** |
| **N-11** | Déclencheurs neufs armés en `origin` | **fermé** (9 sur 9) |
| **N-12** | `src/reprise/index.ts` porte deux octets NUL | **fermé** — plus un seul octet NUL dans le dépôt |
| **N-13** | Textes normatifs en décalage avec le code | **non corrigé** — trois décalages neufs (**Q-6**) |
| **T-1** | À l'insertion, le client fixe `version`, `cree_par`, `cree_le` | **fermé** sur les 42 tables |
| **T-2** | Une action de portée Groupe réécrit les lignes de filiales qu'elle ne lit pas | **fermé** — balayage : 0 sur 36 clés |
| **T-3** | L'acteur du journal peut être nul en silence | **fermé** sur le mécanisme (login ≠ clé primaire) |
| **T-4** | Le garde-fou de couverture RLS n'est appelé par rien au déploiement | **fermé pour deux garde-fous, ROUVERT pour le troisième** (**Q-1**) |
| **T-5** | « Aucun flux légitime n'en souffre » : la création d'une filiale en souffre | **fermé** — la réserve est écrite dans `004` §2 |
| **T-6** | Refus d'écriture muet sur les tables de configuration | **non corrigé** — reproduit |
| **T-7** | Une filiale écrit dans `filiales` par action référentielle | **fermé** (`restrict`) |
| **T-8** | L'espace des identifiants métier est de niveau Groupe | **non corrigé** — reproduit, affaibli |
| **T-9** | `backend/README.md` §8 ne reflète plus l'état réel | **non corrigé**, et désormais **factuellement faux** (**Q-6**) |
| **T-10** | `pg_temp` accepté en première position | **fermé** |
| **T-11** | `f_verifier_couverture_rls()` ne balaie que `relkind = 'r'` | **fermé** |
| **T-12** | La colonne engendrée casse l'aller-retour naïf | **documenté** (§18.6) — reste dû à L2 et L7 |
| **T-13** | La démonstration affirme une propriété que le schéma cessera de tenir | **fermé sur la formulation** ; le fait subsiste, reporté à L5 |

### 2.2 Les preuves, constat par constat

**B-1 — fermé.** J'ai balayé le catalogue moi-même plutôt que de relire les migrations :
toute clé étrangère dont l'enfant **et** le parent portent un `filiale_id` non nul, et
dont la clé ne compte qu'une colonne.

```
 controle | conname | enfant | parent | colonnes
----------+---------+--------+--------+----------
(0 rows)
```

Les vingt-quatre contrôles C29 à C39 et C59 de `db/verifier_cloisonnement.sql` rendent le
même verdict par le comportement (`23503` sur chacune des sept clés d'origine).

**M-1 — fermé, et le garde-fou mord.** Je ne me suis pas contenté de constater zéro
anomalie : j'ai créé six fonctions et une procédure fautives dans le schéma et vérifié
que chacune est nommée.

```
       objet       |       anomalie
-------------------+----------------------
 f_essai_premier() | pg_temp_mal_place        -- set search_path = pg_temp, pg_catalog, public
 f_essai_rien()    | search_path_non_fige     -- aucun set search_path
 f_essai_sans()    | pg_temp_non_relegue      -- set search_path = pg_catalog, public
 p_essai_rien()    | search_path_non_fige     -- une PROCÉDURE (prokind = 'p')
```

`f_essai_guillemets()`, déclarée `set search_path = pg_catalog, public, "pg_temp"`, passe
sans anomalie : PostgreSQL normalise les guillemets dans `proconfig`, il n'y a donc pas de
faux positif. Les objets d'essai ont été supprimés.

**M-2 — fermé pour ce qui pouvait l'être.** Écriture des cinq tables de configuration
réservée à l'administration Groupe, vérifiée sous `grc_app` sans le drapeau : `insert`
refusé (`42501`). Le report L3 pour `sessions` / `session_filiales` / `session_domaines`
est écrit à l'endroit exact (004 §6) et repris au §17.4. **T-6 subsiste** : la
modification et la suppression, elles, sont refusées **silencieusement** (voir §2.2, T-6).

**M-3 — fermé.** `update mesure_catalogue set filiale_id = …` refusé dans les deux sens
(`23514`), déclencheur `trg_mesure_catalogue_portee_figee` armé en `always` — les neuf
déclencheurs de cohérence et de portée le sont (C76 : 9 sur 9).

**m-1 / T-8 — non corrigé, reproduit.** L'espace des identifiants reste de niveau Groupe.
Depuis un périmètre strictement `FIL-A` :

```
insert into risques (id, filiale_id, nom) values ('RISK-B1','FIL-A','sonde');
ERROR:  duplicate key value violates unique constraint "pk_risques"
insert into risques (id, filiale_id, nom) values ('RISK-INEXISTANT','FIL-A','sonde');
INSERT 0 1
```

Conforme au report annoncé (S12 / L2). À noter au passage, et c'est plutôt une bonne
nouvelle : PostgreSQL **supprime le `DETAIL`** qui citerait la valeur de la clé, la ligne
en conflit n'étant pas visible sous RLS. L'oracle dit « ça existe », pas « voici quoi ».

**m-2 — fermé.** C46 : un identifiant de filiale contenant une virgule est refusé
(`23514`) ; C47 : un identifiant ancien sans préfixe passe toujours.

**m-3 — fermé, mais sa portée reste surestimée.** Le garde-fou détecte bien un prédicat
qui ne nomme pas la fonction de périmètre. Il ne couvre pas `import_erreurs` : voir
**Q-5**.

**m-4 — fermé.** C49 et C61 : un périmètre Groupe ne peut écrire au journal ni d'une
filiale qu'il lit sans y opérer, ni d'une filiale qu'il ne lit pas.

**m-5 — fermé.** Les 290 tests passent, dont ceux qui mesurent l'arrêt de la pré-analyse
avant `JSON.parse` sur une entrée hostile volumineuse.

**m-6 — non corrigé.** Les commits restent transverses : `58431b3` touche à lui seul
`db/CONVENTIONS.md` (orchestrateur), `db/migrations/001_socle.sql` (SCHEMA),
`db/verifier_cloisonnement.sql` et `test/base/rls.test.mjs` (OUTILLAGE). Ce n'est pas un
défaut de sécurité et je ne le compte pas comme tel ; c'est la trace d'un dispositif de
propriété des fichiers qui n'a jamais été appliqué. Il redeviendra un vrai risque quand
plusieurs agents travailleront réellement en parallèle, à la vague 2.

**N-1 — fermé, et éprouvé au-delà de la démonstration.** `f_filiale_ecriture()` recoupe
les deux réglages. Périmètre `FIL-A`, filiale active `FIL-B` : `GRC04`, message qui nomme
la filiale. Périmètre vide et filiale active posée : `GRC04`. Écriture dans la filiale
active appartenant au périmètre : passe. (C60 à C64.)

**N-2 / T-7 — fermé.** Sans le drapeau, `insert into filiales` → `42501` (C66) ; poser sa
pièce jointe comme logo d'une autre filiale → `23503` (C68) ; supprimer la pièce jointe
qui sert de logo à sa propre filiale → `23503` (C85, l'action référentielle est en
`restrict`). La fiche de la filiale voisine est intacte, version inchangée (C73).

**N-3 — fermé.** `deploy/install.sh` contrôle explicitement que `grc_app` n'a que
`select` sur `migrations_schema`, et **échoue** (`echec`) sur `INSERT`, `UPDATE`,
`DELETE` ou `TRUNCATE`. Vérifié dans la base : C26 rend « select ».

**N-4 — fermé.** `src/db/pool.ts` pose les **quatre** réglages sans condition à chaque
transaction, par `set_config(…, true)` et par le protocole étendu ; le banc d'essai
`test/base/pool.test.mjs` l'éprouve. Sous `grc_app`, `set session_replication_role =
replica` est refusé (« permission denied to set parameter »).

**N-5 — fermé sur le mécanisme.** Le déclencheur écrase `utilisateur_id` sans condition ;
une valeur fournie par l'appelant est ignorée. Vérifié : une entrée insérée avec
`utilisateur_id = 'USER-2'` depuis une session sans `grc.utilisateur` ressort avec un
acteur **nul** et le libellé client conservé. **Mais la résolution est capturable** :
voir **Q-3**.

**N-6 — fermé.** `mesure_catalogue.statut` / `archive_le` existent, l'équivalence
`ck_mesure_catalogue_archive` ferme les deux sens (C71), et une mesure archivée reste
lisible et rattachée (C74).

**N-7 — fermé.** Le pool dit lui-même, en commentaire, que `search_path=public` n'est pas
une mesure de sécurité. Et le fait est vérifié dans la base :

```
 current_user | create_schema | temporary
--------------+---------------+-----------
 grc_app      | f             | f
```

`create temporary table` → « permission denied to create temporary tables ». `create
table public.…` et `create function public.…` → « permission denied for schema public ».

**N-8 — partiellement fermé, et c'est un progrès réel.** Le nom hors convention est
désormais refusé (`002b_retro.sql` → code de sortie 5). Un `000_prealable.sql` déposé sur
une base portant 001 à 004 est **toujours appliqué sans un mot** sur l'ordre (« 1
migration(s) appliquée(s) sur 5 ») — mais sa **conséquence** est maintenant attrapée,
grâce au correctif T-4 :

```
Garde-fous du schéma — anomalies :
  prealable_oubliee → rls_desactivee
  prealable_oubliee → force_absente
  prealable_oubliee → politique_lecture_absente
  prealable_oubliee → politique_ecriture_absente
 ERR Schéma NON CONFORME : 4 anomalie(s) …
CODE=7
```

C'est exactement ce que le branchement des garde-fous devait produire. Il ne le produit
pas pour la traçabilité : c'est **Q-1**.

**N-9 — non corrigé**, conformément au report annoncé (L6 / L8). Les rattachements
polymorphes `pieces_jointes(entite_type, entite_id)` et `approbations(objet_type,
objet_id)` n'ont toujours aucun contrôle de cohérence. **Q-2 est ce report, armé** : le
défaut ne reste pas théorique une fois combiné à une contrainte d'unicité mal cadrée.

**N-10 — fermé.** C72 : une ligne de portée Groupe de `document_referentiels` désignant
un document local d'une autre filiale → `23503`, grâce à la clé de portée sur la colonne
engendrée, qui n'est jamais nulle.

**N-11 — fermé.** C76 : 9 déclencheurs sur 9 armés en `always`. Les 42 déclencheurs de
création le sont aussi (`f_poser_tracabilite_insertion()` pose `enable always`), et
`f_verifier_tracabilite()` le vérifie — j'ai désarmé `trg_risques_creation` et obtenu
`creation_desarmable`, puis rétabli.

**N-12 — fermé.** Balayage de **tous** les fichiers suivis par git à la recherche d'un
octet NUL : aucun.

**N-13 — non corrigé.** Trois décalages neufs, dont un dans le catalogue de la base
elle-même : voir **Q-6**.

**T-1 — fermé.** Sur les 42 tables portant `cree_par`, un déclencheur `before insert`
adapté à la forme de la table, armé en `always` (C79 : 0 anomalie sur 42 balayées). Je
l'ai éprouvé plutôt que constaté :

```
insert into actifs (id, filiale_id, nom, version, cree_le, cree_par)
values ('ACTIF-FORGE','FIL-A','Actif forgé', 2147483647, '2024-01-15', 'marc.dupuis (DG)');
     id      | version | cree_par |  cree_le
-------------+---------+----------+------------
 ACTIF-FORGE |       1 | alice    | 2026-08-31
```

Même résultat sur une table de liaison (`risque_exigences` : `cree_le` antidaté ignoré,
`cree_par` imposé) et sur une table à `version` (`evaluations` : `version` 77 → 1,
`modifie_par` / `modifie_le` annulés). Le « ignoré, jamais refusé » est bien tenu :
aucune de ces insertions n'échoue, ce qui est la condition de la reprise.

**T-2 — fermé.** Balayage indépendant de toutes les actions référentielles d'une table
cloisonnée vers une table de niveau Groupe portant `cascade` ou `set null` : une seule
ligne, `fk_session_filiales_session` (enfant et parent appartiennent à la même session, le
rayon ne quitte pas la session). C82 balaie 36 clés et rend 0.

**T-3 — fermé.** C83 provisionne un compte dont la clé primaire
(`USR-1720000000000-482`) diffère de l'identifiant (`bruno`) et vérifie que la résolution
se fait sur le login. C'est bien une propriété, pas une coïncidence.

**T-4 — fermé pour deux garde-fous sur trois.** `migrate.mjs` et `install.sh` jouent
`f_verifier_couverture_rls()` et `f_verifier_chemin_recherche()` et **font échouer** leur
chemin (démontré ci-dessus, code de sortie 7). Le troisième, écrit ensuite, n'a pas été
branché : **Q-1**.

**T-5 — fermé.** La réserve sur la création d'une filiale est écrite dans `004_rls.sql`
§2, à l'endroit exact, avec ce que le lot L4 doit en faire.

**T-6 — non corrigé, reproduit.** Sous `grc_app`, sans le drapeau d'administration :

```
update profils set nom = 'Renommé sans droit' where id='PROFIL-1';   UPDATE 0
delete from profils where id='PROFIL-1';                             DELETE 0
insert into profils (id, code, nom) values ('PROFIL-X','X','X');
ERROR:  new row violates row-level security policy for table "profils"
```

Le refus est bruyant à l'ajout, muet aux deux autres. Le prolongement neuf est au **Q-7** :
ce silence n'est plus seulement gênant à diagnostiquer, il est **indiscernable d'un
conflit de version** pour la couche d'écriture du lot L2.

**T-9 — non corrigé, et aggravé.** Voir **Q-6**.

**T-10 — fermé.** `pg_temp` en tête est désormais nommé (`pg_temp_mal_place`), et les
procédures sont balayées (`prokind in ('f','p')`). Démontré ci-dessus.

**T-11 — fermé.** `f_verifier_couverture_rls()` balaie `relkind in ('r','p')`. Il n'y a
toujours aucune table partitionnée ; le filet n'attend plus la première.

**T-12 — documenté, non refermé (et ce n'est pas anormal).** Le §18.6 pose la règle
(« l'insertion nomme ses colonnes »). `src/reprise/**` n'écrit pas en base ; la dette est
à la charge de L2 et L7. J'ajoute une conséquence que personne n'a relevée et qui touche
le même sujet : voir **O-1**, `COPY … FROM` est refusé pour **tous** les comptes.

**T-13 — fermé sur la formulation.** La `notice` finale de `verifier_cloisonnement.sql`
porte désormais sa réserve, nommément, en tête de phrase, avec `grc_lecture` cité. Le
fait, lui, subsiste et je l'ai reproduit : depuis un périmètre strictement `FIL-A`,

```
select count(*) from risques where filiale_id='FIL-B';                        →  0
select filiale_id, valeurs_apres->>'description' from journal_audit …
 FIL-B | Vol de propriété intellectuelle chez le sous-traitant Muller GmbH
```

Le resserrement est un livrable ferme de L5 ; rien à corriger ici.

---

## 3. La grille §4, seize contrôles

Rejouée intégralement. « Sans objet » n'est pas « passé » : les contrôles qui portent sur
une couche non encore écrite sont marqués comme tels, avec ce que j'ai quand même pu
vérifier.

| # | Contrôle | Statut | Preuve, et ce que j'ai tenté |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | **PASSÉ** | 47 tables en `enable` + `force` (C27 : 0 manquante) ; `grc_app` ni `SUPERUSER` ni `BYPASSRLS`, propriétaire d'aucun objet (C23, C24, vérifié aussi par `pg_roles`) ; session `FIL-A` : zéro ligne de `FIL-B` sur les 24 tables de niveau filiale, les 5 mixtes et les 6 liaisons (C02 à C07). Tenté en plus : vol de ligne par `insert … on conflict do update` sur une ligne de `FIL-B` → « new row violates row-level security policy » ; `create table` / `create function` / `create temporary table` sous `grc_app` → refusés. **Réserve : Q-2**, qui n'est pas une brèche de confidentialité mais bien un franchissement de frontière. |
| **S2** | Le périmètre ne vient jamais du navigateur | **PASSÉ** | `src/db/pool.ts` : `avecTransaction` exige un `PerimetreSession` et `appliquerPerimetre` pose les quatre réglages par paramètre lié, jamais par concaténation. Aucun chemin ne relie un corps, une entête, un paramètre d'URL ou un cookie à `grc.*` : le serveur n'expose qu'`/api/sante`, qui n'ouvre aucune transaction. `validerPerimetre` refuse un périmètre vide, une écriture sans filiale active, et une filiale active hors périmètre — et la base **recoupe** de toute façon (`f_filiale_ecriture`, C60-C64). |
| **S3** | Journal d'audit inaltérable et complet | **PASSÉ pour L1** | `update` / `delete` / `truncate` refusés : privilèges sous `grc_app` (C25), `GRC01` sous le propriétaire (C10-C12) ; quatre déclencheurs `enable always` ; `f_journal_audit_verifier()` ne renvoie rien après mes insertions. La **couverture** des événements du §1.7 relève de L5 et n'est pas évaluable : le domaine `ck_journal_audit_action` prévoit bien `export`, `import`, `refus_autorisation`, `connexion_echouee`. **Réserve : Q-3**, l'acteur peut être capté. |
| **S4** | Verrouillage optimiste effectif | **PASSÉ pour L1** | Le client ne peut plus fixer `version`, ni à la mise à jour (gel par `f_maj_tracabilite`) ni à la **création** (`f_init_tracabilite`, 42 tables, éprouvé). C78 : une ligne créée avec `version = 2147483647` naît en v1 et se modifie en v2. La propriété « deux écritures concurrentes, une seule passe » est une **contrainte d'API**, pas de schéma — et un `insert … on conflict do update` la contourne (**O-2**). À prouver à S2, avec le test de concurrence prévu au `PLAN_EXECUTION` §3. |
| **S5** | Aucune injection SQL | **PASSÉ pour ce qui existe** | Le seul code qui parle à la base est `src/db/pool.ts` et `db/migrate.mjs`. Toutes les valeurs passent par `$n`. Les identifiants interpolés viennent de constantes figées : `GARDE_FOUS` (`Object.freeze`) dans `migrate.mjs`, listes `constant text[]` dans `004_rls.sql` via `format('%I')`, tableau littéral dans la boucle `for garde in …` de `install.sh`. Le nom de base d'`install.sh` et de `preparer_base_dev.sh` est validé par expression régulière avant interpolation. |
| **S6** | Droits vérifiés côté serveur à chaque requête | **SANS OBJET** (L3) | Aucun point d'entrée métier n'existe. Ce que L1 apporte et que j'ai vérifié : `session_domaines` porte les droits résolus, et le §17.4 dit explicitement que `grc.administration_groupe` **n'est pas un privilège** — j'ai confirmé qu'un `set local grc.administration_groupe='oui'` par `grc_app` suffit. À ne pas hériter comme acquis à S3. |
| **S7** | Le droit d'export est distinct de la lecture | **SANS OBJET** (L3/L4) | Le schéma le porte : `groupes_ad.accorde_export`, `sessions.peut_exporter`, action `export` au journal. Rien à exercer. |
| **S8** | Secrets | **PASSÉ** | Balayage du dépôt (hors `node_modules`) sur `password|mot_de_passe|secret|token|api_key` suivis d'une valeur : aucune occurrence. `.env.example` livre toutes les clés **vides**. `install.sh` engendre les secrets par `openssl rand -hex 32`, écrit `/etc/cyber-grc/env` en `root:cyber-grc 0640`, et passe les mots de passe par l'entrée standard (`-f -`) pour qu'ils n'apparaissent pas dans `ps`. `preparer_base_dev.sh` refuse de tourner sous `NODE_ENV=production`. |
| **S9** | Chaîne de contrôle des pièces jointes | **SANS OBJET** (L6) | Le schéma porte les huit contrôles en métadonnées (`etat_analyse`, `quarantaine`, `sha256`, `chemin_stockage` hors webroot, `derniere_reanalyse`) et deux contraintes de cohérence. Rien à exercer. |
| **S10** | Sortie et en-têtes | **PARTIEL** | `src/serveur.ts` pose `x-content-type-options: nosniff` et `cache-control: no-store` sur toute réponse, et `deploy/apache/durcissement-global.conf` complète côté frontal. CSP et cookie de session : L3. **O-6** : le gestionnaire 404 renvoie `requete.url` dans le corps JSON — inoffensif avec `nosniff` et un `content-type` JSON, à ne pas reproduire dans du HTML. |
| **S11** | Limitation du rythme et verrouillage | **SANS OBJET** (L3) | Le schéma le porte (`utilisateurs.tentatives_echouees`, `verrouille_jusqu_a`, action `connexion_echouee`). |
| **S12** | Les erreurs ne renseignent pas l'attaquant | **PARTIEL** | `setErrorHandler` : au-delà de 500, message générique + `reference`, pile au journal seulement. Côté base, les messages `GRC04` / `23514` nomment la cause sans révéler de donnée d'une autre filiale — et `f_coherence_mesure_catalogue()` ferme délibérément l'oracle en confondant « inconnue » et « locale à une autre ». Subsiste : **T-8** (oracle par clé primaire) et **Q-2**, où le message reçu par la victime (`duplicate key`, sans `DETAIL`) ne lui apprend **rien du tout** — le défaut inverse. |
| **S13** | Dénis de service applicatifs | **PASSÉ pour L1** | `bodyLimit` configuré, `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout` posés **à la connexion** (donc valables pour toute requête, y compris d'un code futur qui les oublierait), pool borné (`BASE_POOL_MAX`), `install.sh` recoupe `LimitRequestBody` d'Apache avec `SERVEUR_TAILLE_MAX_CORPS`. La pré-analyse de la reprise borne taille **et** nombre de nœuds avant `JSON.parse`. Pagination : L2. **Q-2 est un déni de service applicatif**, mais il vient du schéma, pas du débit. |
| **S14** | Intégrité des opérations composites | **PASSÉ pour L1** | Chaque migration est transactionnelle (`begin`/`commit` dans le fichier) ; `migrate.mjs` applique fichier par fichier en transaction et enregistre l'empreinte ; `avecTransaction` encadre tout par `begin`/`commit`/`rollback`. C56 : délier puis supprimer une mesure du socle dans la **même** transaction fonctionne, `restrict` étant vérifié à l'instruction. `verifier_cloisonnement.sql` se termine par un `rollback` et ne laisse rien (vérifié : 0 ligne `FIL-DEMO%` après exécution). |
| **S15** | Dépendances | **PASSÉ** | `npm audit --omit=dev` : « found 0 vulnerabilities ». Deux dépendances de production seulement (`fastify`, `pg`), justifiées en tête de `src/serveur.ts`, versions bornées dans `package.json` et figées par `package-lock.json`. `npm run verifier-types` passe en mode strict. |
| **S16** | **Les garde-fous sont branchés** | **PASSÉ SOUS RÉSERVE** | **Ce qui est branché et fait échouer** : `f_verifier_couverture_rls()` et `f_verifier_chemin_recherche()`, par `db/migrate.mjs` (code de sortie 7, démontré ci-dessus sur `000_prealable.sql`) **et** par `deploy/install.sh` §9 (boucle `for garde in …`, `echec` sur anomalie, `echec` aussi si la fonction ne peut pas être jouée). Contrôle de propriété du registre : branché et bloquant. **Ce qui ne l'est pas** : `f_verifier_schema()` et `f_verifier_tracabilite()`, appelées par la **recette** seule → **Q-1**. Et le chemin de recette qui les porte échoue aujourd'hui pour une raison étrangère sur toute base peuplée → **Q-4**. |

---

## 4. Constats neufs

### 4.1 Majeurs

---

### Q-1 · MAJEUR — Le garde-fou écrit pour fermer T-1 n'est appelé par aucun chemin de déploiement

**Le fait.** `CONVENTIONS.md` §18.4 pose la règle : « tout contrôle automatique du schéma
est appelé par un chemin réel — la fin d'une migration **et** l'installation — et **fait
échouer** ce chemin ». Le §18.5 la précise dans un tableau : les fonctions de vérification
tournent « à chaque migration et à chaque installation », le script de recette « n'est
appelé par aucun chemin d'installation ». C'est vrai pour deux fonctions sur trois.

```
$ grep -n "f_verifier" backend/db/migrate.mjs | grep "nom:"
    nom: 'f_verifier_couverture_rls',
    nom: 'f_verifier_chemin_recherche',

$ grep -n "f_verifier_schema\|f_verifier_tracabilite" backend/db/migrate.mjs backend/deploy/install.sh
(aucune ligne)
```

Le point d'appel **unique** que `001_socle.sql` construit — `f_verifier_schema()`, qui
agrège chemin de recherche, traçabilité et couverture RLS — n'est invoqué que par les
quatre migrations et par `db/verifier_cloisonnement.sql` (C84). Sur une base à jour, les
migrations ne sont pas rejouées : c'est mot pour mot la situation de T-4.

**L'histoire du dépôt le montre.** Le commit `0826dc6` (« Garde-fous branchés : un
contrôle que rien n'appelle est un commentaire ») touche `db/migrate.mjs` et
`deploy/install.sh`. Le commit **suivant**, `58431b3` (« Traçabilité imposée à
l'insertion »), écrit `f_verifier_tracabilite()` et `f_verifier_schema()` et modifie
`db/CONVENTIONS.md`, `db/migrations/001_socle.sql`, `db/verifier_cloisonnement.sql`,
`test/base/rls.test.mjs` — **et aucun des deux fichiers de déploiement**.

**Le scénario, joué.** J'ai déposé une migration `005_lot_futur.sql` réaliste : elle crée
une table cloisonnée, recopie consciencieusement ses quatre politiques et son déclencheur
de mise à jour, et **oublie le couple du §15 bis** (`f_poser_tracabilite_insertion()` puis
`f_verifier_schema()`) — les deux instructions étant dans le même bloc à recopier, on les
oublie ensemble.

```
  005_lot_futur.sql ........... appliquée en 52 ms
Schéma à jour : 1 migration(s) appliquée(s) sur 5.
  garde-fous du schéma : couverture RLS, chemin de recherche des fonctions — aucune anomalie.
CODE MIGRATE = 0

$ psql -c "select * from f_verifier_schema();"
  controle   |       objet       |      anomalie       | detail
-------------+-------------------+---------------------+----------------------------------
 tracabilite | incidents_majeurs | creation_non_tracee | la table porte « cree_par » mais
                                                         aucun déclencheur « before insert »
```

Et sur une base simplement trafiquée — un `drop trigger trg_risques_creation on risques`,
soit exactement ce que le chemin `--reprendre-propriete` d'`install.sh` existe pour
rattraper :

```
$ node db/migrate.mjs
  garde-fous du schéma : couverture RLS, chemin de recherche des fonctions — aucune anomalie.
CODE SORTIE migrate = 0
$ node db/migrate.mjs --verifier
  garde-fous du schéma : … — aucune anomalie.
CODE SORTIE verifier = 0
```

**Ce que ça coûte.** Sur cette base, `grc_app` retrouve aussitôt les deux effets de T-1 :

```
insert into risques (id, filiale_id, nom, version, cree_le, cree_par)
values ('RISK-FORGE','FIL-A','Risque accepté par la direction',
        2147483647,'2024-01-15','marc.dupuis (DG)');                    INSERT 0 1

     id     |  version   |     cree_par     |  cree_le
------------+------------+------------------+------------
 RISK-FORGE | 2147483647 | marc.dupuis (DG) | 2024-01-15

update risques set nom = 'tentative' where id='RISK-FORGE' and version = 2147483647;
ERROR:  integer out of range        -- la ligne est définitivement immodifiable
```

Une pièce d'audit antidatée de quinze mois, signée du directeur général, que
`f_maj_tracabilite()` gèlera pour toujours — et une ligne que plus personne ne peut
modifier. Sur la table voisine, dont le déclencheur est en place, la même insertion est
proprement ignorée. **Rien, sur la machine cible, ne fait la différence entre les deux.**

**Pourquoi majeur et non bloquant.** Le schéma livré aujourd'hui est correct : 42
déclencheurs sur 42, armés en `always`, non conditionnels, vérifiés. L'exposition porte
sur les migrations à venir et sur une base trafiquée. Et la lettre de S16 est tenue par le
chemin de recette. **Pourquoi il doit être fermé avant la vague 2** : c'est la vague qui
écrira les premières tables après L1, et c'est le contrôle qui vient d'être ajouté à la
grille pour cette raison exacte.

**Le correctif.** Deux entrées dans la constante `GARDE_FOUS` de `migrate.mjs` — ou, mieux,
remplacer les deux par `f_verifier_schema()` seule, dont c'est la raison d'être, en gérant
sa colonne `controle` — et une ligne dans la boucle `for garde in …` d'`install.sh`.
Attention à un détail : `f_verifier_schema()` rend **quatre** colonnes (`controle, objet,
anomalie, detail`) là où les deux autres en rendent trois ; `migrate.mjs` et `install.sh`
sélectionnent nommément `objet, anomalie, detail`, ce qui fonctionne tel quel.

---

### Q-2 · MAJEUR — Une filiale bloque **irréversiblement** le circuit d'approbation d'une autre

**Le fait.** `uq_approbations_etape` porte `(objet_type, objet_id, etape, ordre)` — **sans
`filiale_id`**, alors qu'`approbations` est une table de niveau filiale. Les contrôles
d'unicité de PostgreSQL contournent la RLS exactement comme les contrôles d'intégrité
référentielle : c'est le raisonnement du §17.1, appliqué aux clés étrangères et **jamais
aux contraintes d'unicité**. J'ai balayé le catalogue ; c'est la seule contrainte
d'unicité d'une table cloisonnée qui pose un problème métier :

```
      controle       |      tab       |         conname          |            colonnes
---------------------+----------------+--------------------------+---------------------------------
 UNIQUE-SANS-FILIALE | approbations   | uq_approbations_etape    | objet_type,objet_id,etape,ordre
 UNIQUE-SANS-FILIALE | pieces_jointes | uq_pieces_jointes_chemin | chemin_stockage
```

(`documents.uq_documents_id_portee` et `journal_audit.uq_journal_audit_numero` sont
volontairement globales ; `uq_pieces_jointes_chemin` l'est aussi, sur un nom aléatoire
opaque, ce qui n'ouvre qu'un oracle sans valeur.)

**Le scénario, joué.** `approbations.objet_id` n'a **aucune clé étrangère** — c'est le
report N-9, assumé. Rien n'interdit donc à la filiale A de citer un objet de la filiale B.

```
-- Filiale A, périmètre strictement FIL-A
insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre,
                          statut, date_decision, acteur_libelle)
values ('APPRO-SQUAT2','FIL-A','risque','RISK-B1','acceptation',1,
        'approuve', now(), 'alice');                                    INSERT 0 1

-- Filiale A elle-même ne peut plus la retirer : l'étape est tranchée
delete from approbations where id='APPRO-SQUAT2';
ERROR:  Étape d'approbation déjà tranchée (approuve) : la décision est irréversible.  [GRC02]

-- Filiale B ouvre le circuit d'acceptation de SON risque
select count(*) from approbations;                                      →  0
insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre)
values ('APPRO-B2','FIL-B','risque','RISK-B1','acceptation',1);
ERROR:  duplicate key value violates unique constraint "uq_approbations_etape"
```

**Ce que ça coûte.** La filiale B ne peut **plus jamais** ouvrir l'étape d'acceptation du
risque résiduel `RISK-B1` — celle que l'ISO 27001 exige explicitement, et dont l'absence
est un constat d'audit classique. Elle ne voit pas la ligne qui la bloque (RLS), ne peut
pas la supprimer (politique d'écriture : filiale active), et l'auteur non plus (GRC02,
déclencheur `enable always`). **Seul le propriétaire de la base, en désactivant un
déclencheur, peut réparer** — c'est-à-dire en supprimant une ligne du registre
d'approbations, qui est précisément ce qu'un auditeur lit. Et le message reçu par la
victime, `duplicate key value violates unique constraint`, ne porte **aucun `DETAIL`** :
PostgreSQL le supprime parce que la ligne en conflit n'est pas visible sous RLS. La
filiale B fait face à un refus sans cause visible.

**Qui peut le faire.** Il faut connaître l'identifiant d'un objet d'une autre filiale.
Deux chemins, dont un parfaitement ordinaire : un compte de **périmètre Groupe**, qui lit
légitimement les vingt filiales et écrit dans celle qu'il a sélectionnée — un RSSI groupe
positionné sur Toulouse qui crée une approbation pour un document qu'il a sous les yeux et
qui appartient à Hambourg. Aucune malveillance n'est nécessaire : c'est une faute de
manipulation dont la victime ne saura jamais d'où elle vient.

**Pourquoi majeur et non bloquant.** À la différence de B-1, **rien n'est détruit** et le
chemin n'est pas « une suppression parfaitement ordinaire » : il faut nommer un
identifiant qu'on ne possède pas. Et les lignes fautives resteront **distinguables** après
coup — leur `filiale_id` diffère de la filiale de l'objet qu'elles citent. C'est ce qui
place le constat en deçà du seuil de blocage retenu jusqu'ici.

**Le correctif.** Porter `filiale_id` en tête de `uq_approbations_etape` — la table est
vide, l'`alter table … drop constraint / add constraint` est immédiat. Et poser, à L8, le
contrôle de cohérence polymorphe que N-9 reporte : `objet_id` doit désigner un objet de la
filiale de l'approbation. La contrainte d'unicité seule évite le blocage ; elle laisse
subsister des approbations orphelines sur des objets d'autrui.

**Portée générale, à retenir pour les vagues suivantes** : **le §17.1 ne parle que des
clés étrangères. Les contraintes d'unicité franchissent la frontière de filiale de la même
façon, et pour la même raison.** Toute unicité posée sur une table cloisonnée doit
comporter `filiale_id`, ou justifier par écrit pourquoi elle est globale.

---

### Q-3 · MAJEUR — La valeur sentinelle `'systeme'` est capturable par un compte, et le journal scelle l'erreur

**Le fait.** `f_utilisateur_courant()` rend `'systeme'` en l'absence de `grc.utilisateur`,
et `src/db/pool.ts` en fait une **valeur d'identité réelle** :
`PERIMETRE_SYSTEME.utilisateurId = 'systeme'`, avec ce commentaire : « `'systeme'` n'est
personne ». Le déclencheur de chaînage résout ensuite l'acteur ainsi (§18.3) :

```sql
new.utilisateur_id := (select u.id from utilisateurs u
                        where lower(u.identifiant) = lower(f_utilisateur_courant()));
```

**Rien n'interdit qu'un compte porte l'identifiant `systeme`.** `ck_utilisateurs_ident`
n'exige que « non vide » ; le domaine `id_metier` ne porte pas sur cette colonne ; aucun
`check`, aucun déclencheur, aucune ligne d'`install.sh` ne réserve la valeur.

**Le scénario, joué.**

```
-- avant : l'événement système n'a pas d'acteur, comme documenté
insert into journal_audit (action, resume, utilisateur_libelle, filiale_id)
values ('demarrage','démarrage du service','(systeme)','FIL-A');
 numero |  action   | utilisateur_id | utilisateur_libelle
--------+-----------+----------------+---------------------
      1 | demarrage |                | (systeme)

-- un compte est provisionné avec cet identifiant (casse indifférente)
insert into utilisateurs (id, identifiant, nom_affichage)
values ('USER-SYS','Systeme','Compte piège');

-- après : le même événement système lui est attribué
 numero |  action   | utilisateur_id | utilisateur_libelle
--------+-----------+----------------+---------------------
      2 | demarrage | USER-SYS       | (systeme)

select * from f_journal_audit_verifier();
(0 rows)
```

Et sur les 42 tables métier :

```
insert into risques (id, filiale_id, nom) values ('RISK-SYS','FIL-A','créé hors session');
    id    | cree_par
----------+----------
 RISK-SYS | systeme
```

**Ce que ça coûte.** Toutes les traces produites hors session — migrations, timers
d'exploitation, démarrage et arrêt du service, échecs de connexion antérieurs à la
résolution de l'identité, soit précisément les événements que le `PLAN_SERVEUR` §1.7 tient
à voir tracés — deviennent **attribuées à une personne**. Les entrées sont numérotées,
horodatées par le serveur, chaînées et **scellées** : `f_journal_audit_verifier()` ne dit
rien, la chaîne est parfaitement intacte, et elle est parfaitement fausse sur l'acteur.
C'est la pathologie que le §17.8 nomme lui-même — « un journal inaltérable dont l'acteur
est déclaré par le client garantit l'intégrité d'une fausse preuve » — atteinte par un
autre chemin : non pas en **déclarant** l'acteur, mais en **captant la sentinelle**.
Symétriquement, un titulaire de ce compte peut faire passer ses propres actions pour des
actions système en n'ouvrant pas de session applicative.

**Qui peut le faire.** Deux chemins, et le premier n'est pas malveillant : le
provisionnement automatique. Le `PLAN_SERVEUR` §1.5 crée un compte à la première connexion
pour **tout** membre d'un groupe AD autorisé, sans administration. Un compte de service AD
nommé `systeme` ou `SYSTEME`, ajouté un jour à `GRC-GROUPE-…`, capte la sentinelle sans
que personne ne l'ait décidé. Le second chemin est délibéré : quiconque écrit dans
`utilisateurs` — l'administration Groupe, ou le rôle applicatif qui pose lui-même le
drapeau (§17.4).

**Pourquoi majeur et non bloquant.** La conséquence relève franchement du critère de
blocage : les entrées fautives sont scellées, `GRC01` interdit de les corriger, et rien ne
les distingue d'entrées authentiques. Ce qui m'arrête, c'est la **condition** : il faut un
compte portant exactement cet identifiant. Ce n'est pas une opération ordinaire, comme
l'était la suppression du constat B-1. Je le classe donc majeur — en disant nettement
qu'un relecteur peut légitimement le lire comme bloquant, et qu'il doit être fermé avant
la mise en service pilote quoi qu'il arrive.

**Le correctif.** Une contrainte sur `utilisateurs`, la table étant vide :

```sql
constraint ck_utilisateurs_identifiant_reserve check (lower(identifiant) <> 'systeme')
```

et le message d'erreur qui va avec, parce que le provisionnement AD y butera un jour et
qu'il faut qu'il sache pourquoi. La solution de fond serait une sentinelle qu'aucun login
ne peut porter — le domaine `id_metier` interdit déjà la virgule, un `'(systeme)'` ou un
`'systeme,'` seraient hors d'atteinte —, mais elle touche `cree_par` sur 42 tables et
`pool.ts` : à arbitrer, pas à improviser. La contrainte suffit à fermer le chemin.

---

### Q-4 · MAJEUR — La démonstration de recette crie au loup sur toute base portant un socle Groupe

**Le fait.** `db/verifier_cloisonnement.sql` annonce en tête qu'il « n'écrit rien de
durable, et peut donc être joué sur la base de production ». Je l'ai joué sur ma base, qui
contient — outre les données de démonstration que le script sème et annule — **une seule**
mesure de catalogue de portée Groupe, c'est-à-dire exactement ce que le socle Groupe est
censé contenir en service.

```
+-----------+---------+---------+
| contrôles | réussis | échoués |
+-----------+---------+---------+
|        86 |      85 |       1 |

ERROR:  CLOISONNEMENT EN DÉFAUT — 1 contrôle(s) en échec :
  C04 — Tables mixtes : le socle de Groupe est lisible (6 mesures, personne, document)
        (attendu 8, obtenu 9)
HINT:  Un seul de ces contrôles suffit à rendre le cloisonnement non démontrable en audit.
       Ne pas mettre en service.
```

**La cause.** C04 est le **seul** contrôle du script dont le prédicat n'est pas filtré sur
les identifiants de démonstration :

```sql
select 'C04', …, '8', v.n::text, case when v.n = 8 then 'OK' else 'ÉCHEC' end
  from (select (select count(*) from mesure_catalogue where filiale_id is null)
             + (select count(*) from personnes        where filiale_id is null)
             + (select count(*) from documents        where filiale_id is null) as n) v
```

C05, C06 et C07 comparent eux aussi à une valeur absolue, mais sur des prédicats bornés
aux lignes `FIL-DEMO-B` / `RISK-DEMO-A` : ils sont immunisés. C04 compte **toute la base**.

**Ce que ça coûte.** La première fois que ce script sera joué sur la base réelle — c'est-à-dire
devant l'auditeur ISO 27001, ce pour quoi il existe —, il rendra un code de sortie non nul
et la phrase « CLOISONNEMENT EN DÉFAUT … Ne pas mettre en service », pour une raison qui
n'a rien à voir avec le cloisonnement. Une alarme qui se déclenche à tort sur l'artefact
dont toute la valeur est d'être cru est pire qu'une alarme absente : la seconde fois, on
ne la lira plus.

Cela dit aussi quelque chose du dossier de preuve : **le script n'a jamais été joué que
sur une base vierge.** Le §5.3 de la définition de « terminé » exige la sortie collée dans
le rapport ; elle a été produite dans les conditions les plus favorables, et personne n'a
essayé les autres.

Le lien avec **Q-1** doit être mesuré sans être exagéré : le chemin de recette est
aujourd'hui le **seul** qui joue `f_verifier_schema()`, et c'est ce chemin qui échoue à
tort. J'ai vérifié que C84 (« Anomalies du point d'appel unique `f_verifier_schema()` ») est
bien calculé et rendu — l'exception est levée tout à la fin, après le tableau. Le contrôle
de traçabilité fonctionne donc encore dans ce chemin ; c'est l'exploitant qui reçoit un
verdict global faux.

**Le correctif.** Filtrer C04 sur les lignes de démonstration, comme C05 à C07 — par
exemple `where filiale_id is null and id like '%DEMO%'` sur chacune des trois collections.
Une ligne.

---

### Q-5 · MAJEUR — Le garde-fou de couverture ignore la septième table sans `filiale_id`

**Le fait.** `f_verifier_couverture_rls()` n'exige un prédicat cloisonnant que si la table
porte un `filiale_id` **ou** figure dans `v_liaisons`, un tableau qui nomme « les six
tables de liaison sans `filiale_id` ». Il y en a **sept** dont le cloisonnement ne repose
que sur leur politique. `import_erreurs` manque à l'appel.

```
       relname      | a_filiale | lecture_true
--------------------+-----------+--------------
 actif_dependances  |         0 | f      ← v_liaisons
 actif_risques      |         0 | f      ← v_liaisons
 import_erreurs     |         0 | f      ← ABSENTE de v_liaisons
 incident_actifs    |         0 | f      ← v_liaisons
 processus_actifs   |         0 | f      ← v_liaisons
 risque_exigences   |         0 | f      ← v_liaisons
 mapping_exigences  |         0 | t      ← v_liaisons, dérogée en connaissance de cause
```

**Le scénario, joué.**

```
drop policy pol_import_erreurs_lecture on import_erreurs;
create policy pol_import_erreurs_lecture on import_erreurs for select using (true);

select count(*) from f_verifier_couverture_rls();
 count
-------
     0
```

Zéro anomalie, sur une table que toutes les filiales lisent désormais. `migrate.mjs` et
`install.sh` diraient « aucune anomalie » et sortiraient à zéro. La politique a été
rétablie.

**Ce que ça coûte.** `003` dit lui-même de cette table que « une ligne d'erreur cite le
contenu du fichier importé, c'est donc de la donnée de filiale » — un import de l'annuaire
`personnes` ou du registre RGPD y dépose des noms et des valeurs verbatim. Et le
commentaire de la fonction affirme couvrir « toute table cloisonnée hors dérogation » :
c'est précisément ce que le §17.5 range parmi les garde-fous qui « endorment la vigilance
au lieu de l'entretenir ».

Le classement en majeur suit la calibration du troisième passage, qui a rangé là T-11
(tables partitionnées, dont il n'existe aucune) : ici la table existe, elle est peuplée en
service, et elle porte de la donnée de filiale.

**Le correctif.** Ajouter `'import_erreurs'` à `v_liaisons` — et, tant qu'à faire,
remplacer la liste écrite à la main par la question qu'elle veut poser : « toute table du
schéma qui ne porte pas de `filiale_id` et n'est pas déclarée de niveau Groupe ». Une
liste énumérée se désynchronise au premier ajout d'entité ; c'est le raisonnement que
`f_poser_tracabilite_insertion()` applique déjà à la traçabilité (« découvrir plutôt
qu'énumérer »), et il vaut ici.

---

### 4.2 Mineurs

**Q-6 — Trois décalages neufs entre les textes et le code, dont un dans la base
elle-même.** C'est la suite de N-13 et de T-9, non corrigés.

1. **Dans le catalogue de la base.** Le commentaire de colonne posé par
   `002_metier_noyau.sql` ligne 223 — celui qu'un auditeur lit par `\d+` et qu'un agent lit
   pour comprendre — dit encore le contraire du schéma :

   ```
   $ psql -c "select col_description('personnes'::regclass, attnum) …"
   … "on delete set null" : la fiche annuaire survit à la suppression du compte…
   $ select confdeltype …  →  fk_personnes_utilisateur : restrict
   ```

   La fiche survit parce que la suppression est **refusée**, ce qui n'est pas la même
   chose ni pour l'exploitant ni pour l'auditeur. Vingt-cinq lignes de commentaire, juste
   au-dessus, expliquent le passage en `restrict` : le commentaire de colonne est un
   survivant du copier-coller.

2. **`backend/README.md` annonce une action référentielle fausse** : « `actions` en
   `cascade` depuis exigence, risque, évaluation et incident, en `set null` depuis
   `mesure_catalogue` ». `fk_actions_mesure` est en `restrict` depuis le §17.6, et c'est
   une décision de sécurité, pas un détail.

3. **Les chiffres de preuve du README sont ceux d'un état révolu** — le constat T-9 mot
   pour mot, non corrigé et aggravé : « 28 contrôles » (deux fois) pour **86**, « 144
   tests » (deux fois) pour **290**.

Le §5.6 de la définition de « terminé » exige que le README reflète l'état réel ; ce sont
ici les chiffres et les faits qui **constituent** la preuve du lot.

**Q-7 — L'administration Groupe ne peut pas délier ce que le `restrict` du §18.2 lui
demande de délier, et le refus est muet.** Conséquence directe et non anticipée du
correctif T-2.

```
-- session d'administration Groupe, périmètre de lecture FIL-A + FIL-B, filiale active FIL-A
select id, filiale_id, utilisateur_id from personnes;
 PERS-A1 | FIL-A | USER-1
 PERS-B1 | FIL-B | USER-2

update personnes set utilisateur_id = null where id='PERS-B1';   UPDATE 0
delete from utilisateurs where id='USER-2';
ERROR:  update or delete on table "utilisateurs" violates foreign key constraint
        "fk_personnes_utilisateur" on table "personnes"
```

La ligne est **visible** (périmètre de lecture) mais non modifiable (`personnes` est
mixte : l'écriture d'une ligne locale exige `filiale_id = f_filiale_ecriture()`). Trois
conséquences, à porter au lot L13 :

- supprimer un compte exige **une transaction par filiale**, chacune avec une filiale
  active différente ; aucun code ne fait cela aujourd'hui, et le §18.2 le mentionne en une
  demi-phrase (« elle devra délier filiale par filiale ») sans en tirer le geste ;
- une filiale au statut `sortie`, qui ne figure plus dans aucun périmètre résolu,
  **épingle définitivement** les comptes que son annuaire cite ;
- surtout, pour la vague 2 : `UPDATE 0` est désormais la même réponse pour trois
  situations différentes — la ligne n'existe pas, la version est périmée, l'écriture est
  refusée par la RLS. Or `CONVENTIONS.md` §15 définit `GRC03` comme « 0 ligne sur `update
  … and version = $2` ». **La couche d'écriture de L2 annoncera « modifié entre-temps,
  rechargez » à un utilisateur qui n'avait tout simplement pas le droit d'écrire.** À
  traiter dans la conception de L2, pas après.

**Q-8 — Un compte et une filiale deviennent structurellement indestructibles dès leur
première trace au journal.** `journal_audit.utilisateur_id` et `journal_audit.filiale_id`
sont en `restrict`, et les lignes du journal ne se suppriment pas (`GRC01`).

```
delete from utilisateurs where id='USER-SYS';
ERROR:  … violates foreign key constraint "fk_journal_audit_utilisateur" on table "journal_audit"
delete from filiales where id='FIL-B';
ERROR:  … violates foreign key constraint "fk_journal_audit_filiale" on table "journal_audit"
```

C'est cohérent avec la rétention de trois ans, et ce n'est pas un défaut en soi. Mais deux
textes disent autre chose : `CONVENTIONS.md` §12 justifie le libellé texte par le fait
qu'il « reste lisible **même si le compte disparaît** » — le compte ne peut pas
disparaître ; et le `PLAN_SERVEUR` §2.7 décrit la sortie d'une filiale comme « export
complet, rétention, **puis purge explicite** », purge dont aucun chemin applicatif
n'existe. Ce sont deux procédures d'exploitation sous compte propriétaire, à écrire au lot
L13 en même temps que les purges RGPD — et à annoncer comme telles.

**Q-9 — Le balayage de la traçabilité est indexé sur `cree_par`, et trois colonnes de
traçabilité lui échappent.** Cinq tables sur 47 n'ont pas de `cree_par` :
`journal_audit` (traitée à part, à raison), `session_filiales` et `session_domaines`
(exemption écrite au §3), `migrations_schema` et `import_erreurs`. Ces deux dernières
portent pourtant des colonnes de traçabilité que l'appelant fixe librement :

```
insert into import_erreurs (import_id, ligne, message, cree_le)
values ('IMP-1',1,'antidaté','2001-01-01');
 import_id | ligne |  cree_le
-----------+-------+------------
 IMP-1     |     1 | 2001-01-01

insert into migrations_schema (version, nom, applique_par)
values ('999','faux','le directeur général');       -- sous grc_proprietaire
```

L'enjeu est faible — une date de ligne d'erreur d'import, et un registre auquel `grc_app`
n'a que `select` (vérifié : C26, et `install.sh` échoue si ce n'est plus vrai). Mais la
protection de `migrations_schema.applique_par` repose alors **uniquement** sur le
privilège, sans la seconde couche que les 42 autres tables ont reçue. À citer dans le §3
des conventions, avec les deux exemptions déjà écrites.

### 4.3 Observations (sans scénario d'exploitation)

**O-1 — `COPY … FROM` est refusé pour tous les comptes, propriétaire compris.** C'est une
conséquence directe de `force row level security`, et personne ne l'a écrite :

```
copy actifs (id, filiale_id, nom) from stdin;   -- sous grc_app comme sous grc_proprietaire
ERROR:  COPY FROM not supported with row-level security
HINT:  Use INSERT statements instead.
```

Le §6 de `004_rls.sql` prévoit le cas pour les **sauvegardes** (`pg_dump` sous
superutilisateur) ; il ne dit rien des **chargements**. Or l'import généralisé est le
« critère décisif » du client (lot L7), la reprise d'un `grc-backup` complet passera par
là, et le `PLAN_SERVEUR` §2.7 prévoit un export/réimport lors d'une sortie de filiale. Le
chemin en masse que tout le monde emploie est fermé : il faudra des `insert` ligne à
ligne, et le budget de temps d'une intégration à vingt filiales doit être mesuré avant de
le promettre. À écrire dans les conventions, à côté du §18.6 qui traite déjà de la colonne
engendrée — les deux points concernent le même lecteur.

**O-2 — L'`upsert` contourne le verrouillage optimiste.** Le schéma tient sa promesse
(« le client ne peut pas fixer `version` ») ; il ne tient pas, et n'a jamais prétendu
tenir, celle de P1 :

```
select version from risques where id='RISK-A1';                        →  1
insert into risques (id, filiale_id, nom) values ('RISK-A1','FIL-A','Écrasé…')
  on conflict (id) do update set nom = excluded.nom;                    INSERT 0 1
select version, modifie_par from risques where id='RISK-A1';           →  2 | alice
```

Une écriture qui ne connaît pas la version en cours passe. C'est bien une contrainte
d'API — `CONVENTIONS.md` §3 l'écrit — mais le risque projet n°1 mérite qu'un test de la
vague 2 interdise explicitement l'`upsert` dans la couche d'accès générique, et pas
seulement qu'un commentaire l'en dissuade.

**O-3 — `001_socle.sql` ligne 1916 : `E'\\n'` là où `002`, `003` et `004` écrivent
`E'\n'`.** Si le garde-fou de `001` venait à parler, sa liste d'anomalies s'afficherait sur
une seule ligne avec des `\n` littéraux (`select 'A' || E'\\n' || 'B'` rend `A\nB`). Sans
conséquence de sécurité ; le fait notable est que les quatre copies du « même » bloc de fin
de migration **ne sont pas identiques**, ce qui est le défaut structurel de tout bloc
recopié quatre fois — et c'est aussi la cause de Q-1.

**O-4 — L'oracle d'existence par clé primaire subsiste (T-8), affaibli.** PostgreSQL
supprime le `DETAIL` qui citerait la valeur en conflit, la ligne n'étant pas visible sous
RLS. L'oracle répond « oui / non », il ne montre rien. Conforme au report S12 / L2.

**O-5 — T-6 reproduit** : refus muet en modification et en suppression sur les tables de
configuration. Voir aussi Q-7, qui en fait un problème pour L2.

**O-6 — Le gestionnaire 404 renvoie l'URL demandée dans le corps de la réponse.**
`src/serveur.ts` : `Aucune ressource ne répond à ${requete.method} ${requete.url}`. Sans
danger ici — corps JSON, `x-content-type-options: nosniff` — mais c'est un réflexe à ne
pas emporter dans les réponses HTML de L10.

**O-7 — `session_domaines` n'est couverte par aucun garde-fou de cloisonnement**, comme
`import_erreurs` (Q-5), mais à dessein : elle est dans la liste des tables ouvertes du §6,
avec le report L3 écrit. Je le note pour que la fermeture de L3 n'oublie pas qu'elle est,
elle aussi, une table fille sans `filiale_id` dont seule la politique dirait quelque chose.

**O-8 — m-6 : les commits restent transverses.** Le dispositif de propriété exclusive des
fichiers (`PLAN_EXECUTION` §2) n'est appliqué par aucun des quatre derniers commits. Sans
conséquence tant qu'un seul agent travaille ; la vague 2 en prévoit trois en parallèle.

---

## 5. Le banc d'essai mord-il encore ?

Exigence de la porte : un test qui passe quoi qu'on fasse ne prouve rien. Plutôt que de
refaire les mutations des trois passages précédents, j'ai muté **ce qui vient d'être
ajouté** — les garde-fous neufs eux-mêmes — sur une copie du backend hors du dépôt et sur
`grc_audit4`.

| # | Propriété cassée | Ce qui a parlé |
|---|---|---|
| 1 | `drop trigger trg_risques_creation on risques` | `f_verifier_schema()` : `creation_non_tracee` ✅ · `migrate.mjs` : **rien**, code 0 ❌ (**Q-1**) |
| 2 | `alter table risques disable trigger trg_risques_creation` | `creation_desarmable` ✅ |
| 3 | Déclencheur recréé avec `when (false)` | `creation_conditionnelle` ✅ |
| 4 | Déclencheur recréé sous un autre nom | `creation_non_tracee` ✅ (conservateur, et `f_poser_tracabilite_insertion()` en repose un) |
| 5 | Fonction `set search_path = pg_temp, pg_catalog, public` | `pg_temp_mal_place` ✅ |
| 6 | Fonction `set search_path = pg_catalog, public` | `pg_temp_non_relegue` ✅ |
| 7 | Fonction sans `set search_path` | `search_path_non_fige` ✅ |
| 8 | **Procédure** sans `set search_path` | `search_path_non_fige` ✅ (T-10 fermé) |
| 9 | Fonction `… , "pg_temp"` (guillemets) | aucune anomalie ✅ — pas de faux positif |
| 10 | `pol_import_erreurs_lecture` remplacée par `using (true)` | **rien** ❌ (**Q-5**) |
| 11 | Migration `000_prealable.sql` créant une table sans politique | `migrate.mjs` code 7, quatre anomalies ✅ |
| 12 | Migration `005` créant une table avec politiques, sans traçabilité | `migrate.mjs` code 0 ❌ (**Q-1**) |

Dix mutations sur douze sont attrapées, et les deux qui ne le sont pas sont exactement les
deux majeurs Q-1 et Q-5. **La suite de 290 tests, elle, passe intégralement** (`npm test`
→ 290 pass, 0 fail) : elle couvre `f_verifier_tracabilite()` et `f_verifier_schema()` par
appel direct, y compris la mutation du déclencheur — c'est le **branchement** qui manque,
pas le contrôle. C'est mot pour mot la leçon T-4, et c'est pourquoi elle mérite d'être
répétée : *écrire le contrôle est la moitié du travail ; le brancher est l'autre moitié —
et un test qui appelle la fonction directement ne prouve pas qu'elle est branchée.*

**Suggestion pour la fermeture de Q-1** : le test qui l'éprouvera ne doit pas appeler
`f_verifier_schema()` ; il doit casser la traçabilité puis **exécuter `migrate.mjs`** et
vérifier son code de sortie. Un test analogue existe déjà dans `rls.test.mjs` (ligne 3125 :
« le fichier de migration appelle-t-il `f_verifier_schema()` ? ») — il lit le **texte** des
migrations. Il faut le même geste sur le code de sortie de l'outil.

---

## 6. Reproduire ce rapport

```bash
# base dédiée, à partir des quatre migrations
bash backend/db/dev/preparer_base_dev.sh --base grc_audit4 --recreer

# la suite complète et la vérification de types
cd backend && npm test && npm run verifier-types && npm audit --omit=dev

# la démonstration de recette (Q-4 : elle échoue dès qu'une ligne Groupe préexiste)
PGPASSWORD=dev psql -h 127.0.0.1 -U grc_app -d grc_audit4 \
    -v ON_ERROR_STOP=1 -f backend/db/verifier_cloisonnement.sql

# Q-1 : le garde-fou de traçabilité n'est pas branché
psql … -c "drop trigger trg_risques_creation on risques;"
psql … -c "select * from f_verifier_schema();"          # → creation_non_tracee
node backend/db/migrate.mjs ; echo $?                    # → « aucune anomalie », 0
psql … -c "select f_poser_tracabilite_insertion();"      # rétablir
```

Les scripts d'attaque et la copie mutée du backend sont dans le bac à sable de la session,
hors du dépôt. La base `grc_audit4` est laissée en place, garde-fous rétablis
(`select count(*) from f_verifier_schema()` → 0) et sans résidu de démonstration.

---

## 7. Ce que la grille ne couvre pas

Au-delà des limites déjà écrites au `PLAN_EXECUTION` §4 (elle ne remplace ni le test
d'intrusion de L15, ni la protection contre `root` sur la VM et le propriétaire de la
base), ce passage en a rencontré trois autres, qu'il faut nommer :

1. **La grille parle de clés étrangères, jamais de contraintes d'unicité.** S1 demande
   « zéro ligne de la filiale B » ; il ne demande rien sur ce qu'une filiale peut
   **empêcher** chez une autre. Q-2 est passé sous trois passages parce que tout le monde
   — moi compris, au départ — a balayé `contype = 'f'`. Une frontière se franchit aussi
   par une contrainte d'unicité, par un identifiant partagé, par une ressource commune.
2. **La grille ne demande nulle part qu'un correctif ne casse rien.** Le
   `PLAN_EXECUTION` §7 le dit en prose (« un correctif se juge à ce qu'il rend impossible
   autant qu'à ce qu'il ferme ») mais aucun contrôle ne le porte. Q-7 en est l'illustration :
   le `restrict` du §18.2 ferme une brèche réelle et rend impossible une suppression de
   compte que rien ne remplace. Un dix-septième contrôle — *ce que le correctif interdit
   désormais, et par quel geste on fait ce qui était légitime* — vaudrait mieux qu'une
   phrase d'introduction.
3. **La grille ne demande pas que les preuves soient produites dans les conditions
   réelles.** §5.3 exige « la sortie collée dans le rapport » ; elle ne dit pas sur quelle
   base. Q-4 n'a survécu que parce que la démonstration n'a jamais tourné ailleurs que sur
   une base vierge. « Rejouée sur une base **peuplée** » serait un ajout bon marché.

---

## 8. Ce que je n'ai pas pu vérifier

- **`deploy/install.sh` n'a pas été exécuté.** Il exige Debian, `apt`, `systemctl`,
  Apache et ClamAV, absents de cette machine. Je l'ai lu ligne à ligne et j'ai vérifié
  **par requête** ce que sa section 9 vérifie (attributs de `grc_app`, propriété des
  objets, privilèges sur `journal_audit` et `migrations_schema`, les deux garde-fous
  branchés). Le constat Q-1 le concerne au même titre que `migrate.mjs`, et je l'ai
  établi par lecture du fichier, pas par exécution.
- **PostgreSQL 16.13**, alors que la cible est **17** (dépôt PGDG). Rien de ce que j'ai
  employé n'est postérieur à 15, et les trois comportements sur lesquels reposent des
  constats — la RLS contournée par l'intégrité référentielle et par l'unicité, la
  suppression du `DETAIL` d'une violation d'unicité sur une ligne invisible, le refus de
  `COPY FROM` sous RLS — sont documentés et stables. Ils restent à reconfirmer sur 17.
- **Active Directory, ClamAV, relais SMTP** : absents. Les lots L3, L6 et L12 se
  recetteront sur des doublures, comme le `PLAN_EXECUTION` §6 le prévoit. Le scénario de
  provisionnement automatique invoqué en Q-3 s'appuie sur le `PLAN_SERVEUR` §1.5, pas sur
  un essai.
- **La montée en charge.** Aucune mesure de volume : le verrou consultatif du chaînage du
  journal sérialise strictement les insertions jusqu'au `commit`, ce que `001` justifie
  par « quelques écritures par seconde pour dix utilisateurs par filiale ». Vingt filiales
  et un import en masse — sans `COPY` (O-1) — ne relèvent plus de cette hypothèse. À
  mesurer en L7, pas à supposer.
- **La validation formelle du découpage Groupe / Filiale par le RSSI groupe** (risque P5).
  Aucune trace dans le dépôt ; le `CLAUDE.md` §8 le signale déjà. Ce n'est pas un défaut
  technique et je ne le compte pas comme tel, mais changer le niveau d'une table après la
  mise en service se paie en migration de données : cela reste une condition d'entrée de la
  mise en service pilote, pas de la porte S1.

---

## 9. Ce que ce passage apprend, pour les portes suivantes

Trois passages avaient établi que « chaque auditeur trouve ce que le précédent a manqué ».
Ce quatrième ajoute deux choses, et elles ne sont pas de même nature.

**Un correctif crée une zone aveugle à l'endroit même où il rassure.** Q-1 n'est pas un
oubli quelconque : c'est l'oubli du **branchement**, un commit après celui qui avait
branché les deux autres, dans un dépôt dont le document normatif venait d'écrire que le
branchement était la moitié du travail. Ce qui rend l'erreur possible, ce n'est pas
l'inattention, c'est la **forme** : un bloc de quinze lignes recopié en fin de quatre
migrations, dont la copie dans `001` diffère déjà des trois autres (O-3), et deux listes de
garde-fous tenues à la main dans deux fichiers de langages différents. Tant que le
branchement est une liste à maintenir, il se désynchronisera. La parade est celle que le
dépôt applique déjà ailleurs et qu'il faudrait généraliser : **découvrir plutôt
qu'énumérer** — `f_verifier_schema()` existe pour être le point d'appel unique, il suffit
que les deux chemins de déploiement n'appellent qu'elle.

**Le raisonnement d'un correctif vaut souvent plus loin que son application.** Le §17.1
énonce une vérité générale — les contrôles d'intégrité de PostgreSQL contournent la RLS —
et ne l'applique qu'aux clés étrangères. Les contraintes d'unicité la subissent à
l'identique (Q-2). Le §17.8 énonce que la valeur probante d'une trace doit venir du
serveur, et la fait venir d'une résolution qu'un compte peut capter (Q-3). À chaque fois,
la règle est juste et son domaine d'application est trop étroit. **La question à poser au
prochain correctif n'est pas « est-ce que ça ferme le cas ? » mais « où ailleurs le même
raisonnement s'applique-t-il, et est-ce que quelqu'un y est allé voir ? »**

---

*Rapport rendu en lecture seule. Aucun fichier du dépôt n'a été modifié hors celui-ci ;
aucun rapport existant n'a été touché ; aucun `git add`, aucun commit, aucune poussée.*
