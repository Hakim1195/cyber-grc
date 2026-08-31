# Porte de sécurité S1 — cinquième passage

> **Agent** : SECU-5 — revue adversariale indépendante, **lecture seule**.
> **Objet** : lot **L1** (schéma relationnel et cloisonnement), vague 1.
> **Date** : 31/08/2026 · **Dépôt** : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, commit `6fd5a5d`.
> **Grille rejouée** : `docs/PLAN_EXECUTION.md` §4, **les seize contrôles**, intégralement.
> **Passages précédents** : [`RAPPORT_S1.md`](RAPPORT_S1.md) · [`RAPPORT_S1_BIS.md`](RAPPORT_S1_BIS.md) · [`RAPPORT_S1_TER.md`](RAPPORT_S1_TER.md) · [`RAPPORT_S1_QUATER.md`](RAPPORT_S1_QUATER.md).
>
> Je n'ai écrit aucune ligne du code contrôlé ni aucun des quatre rapports précédents.
> Aucun fichier du dépôt n'a été modifié en dehors du présent rapport ; aucun `git add`,
> `commit` ni `push` n'a été fait. Tous les essais ont été joués sur une base qui m'est
> propre, **`grc_audit5`**, montée pour ce passage ; les scripts d'attaque sont restés dans
> le répertoire de travail temporaire.

---

## 1. Verdict

**Porte S1 franchie** : le cloisonnement par filiale a tenu sous cinq balayages
indépendants et sous mutation, les cinq constats des quatre passages précédents sont
clos et je les ai rejoués moi-même, et **aucun des huit constats neufs n'est une brèche
de cloisonnement** — ce qui reste porte sur des **garde-fous** et sur une **exposition de
colonne**, tous corrigeables en quelques lignes, et je les inscris en conditions d'entrée
de la vague 2 plutôt qu'en motif de refus.

| | Nombre |
|---|---|
| Bloquants | **0** |
| Majeurs | **3** (Q5-1, Q5-2, Q5-3) |
| Mineurs | **5** (Q5-4 à Q5-8) |

**Je ne demande pas de re-passage de la porte.** Les trois majeurs sont nommés,
assignés et datés au §7 ; deux d'entre eux conditionnent l'ouverture de la vague 2, le
troisième conditionne le lot L3. Le §6 dit pourquoi aucun ne justifie un cinquième refus,
et le §6 bis dit franchement ce qui, dans mon raisonnement, aurait pu en justifier un.

---

## 2. Ce que j'ai monté, et ce que j'ai joué

Base neuve, migrations appliquées depuis zéro, sans intervention manuelle :

```
$ BASE_NOM=grc_audit5 bash db/dev/preparer_base_dev.sh --recreer
  ok  aucun rôle applicatif porteur de SUPERUSER ou BYPASSRLS
  ok  base créée, propriétaire grc_proprietaire
  ok  PUBLIC privé de tout sur « grc_audit5 » ; connect accordé nommément
  ok  grc_app et grc_lecture sans TEMPORARY — pg_temp ne peut pas masquer le schéma
  001_socle.sql ............... appliquée en 157 ms
  002_metier_noyau.sql ........ appliquée en 104 ms
  003_metier_operations.sql ... appliquée en 144 ms
  004_rls.sql ................. appliquée en  82 ms
Schéma à jour : 4 migration(s) appliquée(s) sur 4.
  garde-fous du schéma (f_verifier_schema, point d'appel unique) : aucune anomalie.
```

État de l'objet contrôlé, lu dans le catalogue et non dans la documentation :

```
 tables | politiques | rls activée ET forcée | fonctions du schéma public
     47 |        188 |                    47 |                        25
 relkind : r = 47, i = 144  (aucune vue, vue matérialisée, table partitionnée ni table distante)
 objets du schéma public non possédés par grc_proprietaire : 0
```

Les quatre chemins de preuve, joués par moi :

```
$ npm run verifier-types                 -> 0 erreur
$ npm test                               -> tests 306 | pass 306 | fail 0 | skipped 0
$ psql -U grc_app -f db/verifier_cloisonnement.sql
                                         -> 93 contrôles, 93 réussis, 0 échoué, code 0
$ npm audit                              -> found 0 vulnerabilities
```

À quoi j'ajoute **mes propres balayages de catalogue**, écrits indépendamment de ceux du
dépôt (§3), et **six mutations** destinées à vérifier que les garde-fous mordent plutôt
qu'ils ne décorent (§3.6 et §5).

---

## 3. Le sort des constats des quatre passages

La règle que je me suis donnée : ne pas relire la démonstration du dépôt, mais **réécrire
le balayage** et **rejouer le scénario**. Un contrôle qui passe parce qu'il interroge la
même requête que le correctif ne prouve rien.

### 3.1 B-1 (premier passage) — sept clés étrangères traversant la frontière de filiale · **CLOS**

Balayage écrit par moi, sans regarder le C-tests du dépôt : toute clé étrangère dont
**l'enfant et le parent portent tous deux une colonne `filiale_id`** et dont les colonnes
de clé n'incluent pas `filiale_id`.

```
       enfant          |      parent      |             conname             | upd/del
-----------------------+------------------+---------------------------------+---------
 actions               | mesure_catalogue | fk_actions_mesure               | a r
 document_referentiels | documents        | fk_document_referentiels_portee | a c
 evaluation_mesures    | mesure_catalogue | fk_evaluation_mesures_mesure    | a r
 mesure_mise_en_oeuvre | mesure_catalogue | fk_mesure_mise_en_oeuvre_mesure | a r
 traitement_mesures    | mesure_catalogue | fk_traitement_mesures_mesure    | a r
(5 lignes)
```

Cinq lignes, et **aucune n'est un défaut** — je l'ai vérifié une par une plutôt que de le
supposer :

- Les **quatre vers `mesure_catalogue`** ne *peuvent pas* être composites : la table est
  mixte, son `filiale_id` est nullable, et une clé composite interdirait précisément
  l'usage voulu — qu'une filiale référence une mesure du socle Groupe. La condition
  qu'aucune clé n'exprime est portée par le déclencheur `f_coherence_mesure_catalogue()`,
  posé sur les quatre tables **en `before insert or update`** (vérifié dans
  `pg_get_triggerdef` : l'`update` n'a pas été oublié) et armé en `always`. Les quatre
  clés sont en `on delete restrict`.
- La cinquième, `fk_document_referentiels_portee`, épingle la **portée** et non la filiale
  — mais elle ne vit pas seule : `document_referentiels` porte **aussi**
  `fk_document_referentiels_coherence (document_id, filiale_id) -> documents(id, filiale_id)`.
  Le couple est exhaustif, et c'est subtil : pour une ligne **locale** la seconde clé
  s'applique pleinement ; pour une ligne de **portée Groupe** son `filiale_id` est nul,
  donc la clé composite est satisfaite trivialement (`MATCH SIMPLE`) — et c'est la
  première, sur la colonne engendrée `portee_groupe` (jamais nulle), qui prend le relais.
  J'ai cherché le trou entre les deux ; il n'y en a pas.

Balayage complémentaire, sur la règle générale du §18.2 (« une clé étrangère d'une table
cloisonnée vers une table de niveau Groupe ne porte ni `cascade` ni `set null` ») : **zéro
clé** en `cascade`, `set null` ou `set default`.

### 3.2 M-2 / m-4 / M-3 (premier passage) — la filiale d'écriture, la portée figée · **CLOS**

Rejoué à la main, sous `grc_app` :

```
-- m-4 : périmètre Groupe (FIL-A,FIL-B), filiale active FIL-A, trace attribuée à FIL-B
ERROR:  new row violates row-level security policy for table "journal_audit"

-- M-3 : appropriation d'une ligne du socle Groupe / promotion d'une ligne locale
23514 dans les deux sens (déclencheur f_interdit_changement_portee, armé « always »)
```

J'ai en outre recompté les tables mixtes **dans le catalogue** au lieu de lire la liste :
sept tables portent un `filiale_id` nullable, deux sont déclarées « nullable sans être
mixtes » (§17.7), il reste **cinq**, et ce sont exactement les cinq qui portent
`trg_*_portee_figee`. La liste est juste aujourd'hui — je dis au §5, constat Q5-4, ce qui
ne garantit pas qu'elle le reste.

### 3.3 N-1 (deuxième passage) — la filiale d'écriture non recoupée avec le périmètre de lecture · **CLOS**

Le constat bloquant du deuxième passage, rejoué mot pour mot :

```
-- lire FIL-A, déclarer FIL-B active, écrire un risque chez B
ERROR:  Filiale active FIL-B hors du périmètre lisible de la session :
        on n'écrit pas dans une filiale que l'on ne lit pas.        (GRC04)

-- la même chose, sur l'entrée de journal chaînée et scellée
ERROR:  Filiale active FIL-B hors du périmètre lisible de la session : ...   (GRC04)
```

Le recoupement est bien **dans la base** (`f_filiale_ecriture()`, migration 004), pas
seulement dans `src/db/pool.ts`. C'est la propriété que le `PLAN_SERVEUR` §1.9 exige, et
elle tient sans le code.

### 3.4 T (troisième passage) — l'`insert` jamais éprouvé, un garde-fou branché nulle part · **CLOS**

Traçabilité à l'insertion (§18.1), rejouée :

```sql
insert into risques (id, filiale_id, nom, version, cree_le, cree_par, modifie_par)
values ('RISK-F','FIL-A','forgé', 2147483647, '2019-01-01', 'directeur general', 'x');
--  version | cree_par | cree_le    | modifie_par nul ?
--        1 | alice    | 2026-08-31 | t
update risques set nom = 'modifié' where id = 'RISK-F';   -- version -> 2
```

Ce que le client envoie est ignoré, pas refusé ; la ligne naît en v1 et reste modifiable.

Chemin de recherche (T-10), balayé par moi sur **`prokind in ('f','p')`** et sur la
position de `pg_temp` : **25 fonctions et procédures, aucune anomalie**. Le privilège
`temporary` est bien refusé au rôle applicatif :

```
$ psql -U grc_app -c 'create temporary table t(x int);'
ERROR:  permission denied to create temporary tables in database "grc_audit5"
```

Branchement (T-4, S16) : `f_verifier_schema()` est appelée par `migrate.mjs`
(sous le compte propriétaire) **et** par `install.sh`. J'ai vérifié qu'elle **fait échouer**
ces chemins, et pas seulement qu'elle est appelée — voir §3.6.

### 3.5 Q (quatrième passage) — unicités contournant la RLS, sentinelle capturable · **CLOS**

**Q-2, balayage réécrit par moi** — unicités, exclusions et index uniques (contrainte ou
non) des tables portant `filiale_id`, sans `filiale_id` parmi leurs colonnes de clé :

```
       table      |                objet                 |  définition
------------------+--------------------------------------+--------------------------------------------
 documents        | uq_documents_id_portee               | (id, portee_groupe)
 groupes_ad       | uq_groupes_ad_nom                    | (lower(nom))
 journal_audit    | uq_journal_audit_numero              | (numero)
 mesure_catalogue | uq_mesure_catalogue_reference_groupe | (reference) WHERE filiale_id IS NULL AND ...
 pieces_jointes   | uq_pieces_jointes_chemin             | (chemin_stockage)
```

**Exactement les cinq dérogations déclarées, et aucune autre.** J'ai ensuite vérifié
chacune **contre le catalogue** et non contre son commentaire (§5, constat Q5-5, pour la
seule qui ne tienne pas debout toute seule) :

| Dérogation | Ce que le commentaire affirme | Ce que j'ai constaté |
|---|---|---|
| `uq_journal_audit_numero` | numérotation Groupe par construction | vrai — le chaînage relie toutes les filiales |
| `uq_documents_id_portee` | `id` est déjà la clé primaire, l'unicité n'interdit rien de plus | **vrai**, `pk_documents (id)` existe bien |
| `uq_mesure_catalogue_reference_groupe` | index **partiel**, borné aux lignes du socle | **vrai** : `WHERE filiale_id IS NULL AND reference IS NOT NULL`, et le pendant local porte bien `filiale_id` |
| `uq_groupes_ad_nom` | l'unicité est celle de l'annuaire, et l'écriture est réservée à l'administration Groupe | **vrai et doublement tenu** : la politique d'écriture est `f_administration_groupe()` |
| `uq_pieces_jointes_chemin` | « nom aléatoire opaque engendré par le serveur » | **repose sur du code qui n'existe pas** — constat Q5-5 |

**Q-3, sentinelle « systeme »**, rejouée sur six variantes plutôt que sur les deux du
script :

```
  identifiant « systeme    » -> refusé (23514)
  identifiant « SysTeme    » -> refusé (23514)
  identifiant « SYSTEME    » -> refusé (23514)
  identifiant «  systeme    » -> refusé (23514)      (espace de tête)
  identifiant « systeme    » -> refusé (23514)      (espaces de fin)
  identifiant « systeme.   » -> accepté  (légitime, ce n'est pas la sentinelle)
```

Et j'ai vérifié le point qui compte vraiment, que le script ne vérifie pas : qu'une
variante **acceptée** ne capture pas la sentinelle. Compte `systeme.` provisionné, puis
événement système écrit sous `grc.utilisateur = 'systeme'` :
`utilisateur_id is null` -> **`t`**. La résolution ne se rabat pas.

**Q-4, la démonstration sur base peuplée** : je l'ai jouée sur `grc_audit5` **après** y
avoir semé deux filiales, deux risques, deux entrées de journal et deux comptes. 93/93,
code de sortie 0. Le contrôle C04, qui criait au loup au quatrième passage, se tait
correctement (voir toutefois le constat Q5-7 sur la forme de son prédicat).

**Q-5, l'inversion du sens de lecture** : voir §3.6, je l'ai attaquée spécifiquement.

### 3.6 Les changements du cinquième correctif, attaqués un par un

C'est ce que le mandat demandait en priorité. Six mutations, sur ma base.

**(a) L'inversion de `f_verifier_couverture_rls()` a-t-elle ouvert un trou ?**
Non — et elle en a fermé un. J'ai comparé les deux formes ligne à ligne
(`git show 6fd5a5d`) : l'ancienne soumettait `porte_filiale OR nom = any(v_liaisons)`,
la nouvelle `porte_filiale OR NOT (nom = any(v_sans_filiale_admises))`. Le second
prédicat est un **sur-ensemble strict** du premier : toute table jadis contrôlée l'est
encore. La seule chose que l'ancienne forme faisait et que la nouvelle ne fait plus est
de réclamer l'existence des six liaisons (`liaison_absente`) — sans conséquence, puisque
la nouvelle découvre dans le catalogue et ne peut donc pas cesser de porter sur quelque
chose.

Mutation, pour ne pas m'en tenir au raisonnement — je renomme une table **nommément
exemptée** :

```
$ alter table mappings rename to mappings_v2;
$ select controle, objet, anomalie from f_verifier_schema();
 couverture_rls | mappings    | exemption_obsolete
 couverture_rls | mappings_v2 | lecture_non_cloisonnee
 couverture_rls | mappings_v2 | ecriture_non_cloisonnee
 tracabilite    | mappings_v2 | creation_non_tracee
```

Le défaut par défaut est bien **fermé** : la table renommée n'hérite de rien, et
l'exemption devenue orpheline est réclamée. C'est exactement la propriété annoncée par le
§19.5, et elle est vraie.

Seconde mutation, le cas « migration 005 oublieuse » :

```
$ create table essai_oubliee (id id_metier primary key, filiale_id id_metier not null,
        nom text, version integer not null default 1, cree_le timestamptz not null default now(),
        cree_par text not null default f_utilisateur_courant(),
        constraint uq_essai_nom unique (nom));
$ select controle, objet, anomalie from f_verifier_schema();
 couverture_rls     | essai_oubliee            | rls_desactivee
 couverture_rls     | essai_oubliee            | force_absente
 couverture_rls     | essai_oubliee            | politique_lecture_absente
 couverture_rls     | essai_oubliee            | politique_ecriture_absente
 tracabilite        | essai_oubliee            | creation_non_tracee
 unicite_cloisonnee | essai_oubliee.uq_essai_nom | unicite_transfrontaliere
```

Les trois garde-fous mordent ensemble, dont le neuf. **C'est du bon travail**, et il faut
le dire aussi clairement que les défauts.

**(b) Les neuf exemptions de couverture sont-elles justes ?**
J'ai vérifié chacune sur la base : `filiales`, `utilisateurs`, `profils`,
`profil_domaines`, `migrations_schema`, `sessions`, `session_domaines`, `mappings`,
`mapping_exigences` — aucune ne porte de `filiale_id`, toutes sont de niveau Groupe ou
lues avant que le périmètre existe, et le raisonnement écrit pour `mapping_exigences`
(« aucune de ses deux extrémités n'appartient à une filiale ») est exact : son parent
`mappings` est Groupe et son autre extrémité est le couple `(ref_id, code)` d'un
catalogue statique hors base. **Les trois dérogations** (`groupes_ad`, `journal_audit`,
`session_filiales`) sont motivées, et les deux dernières sont déjà des dettes écrites
(§17.4 pour la troisième, 004 §6 pour le journal). Rien à redire sur le fond — mais voir
Q5-3 : `utilisateurs` est légitimement de niveau Groupe **en lignes**, et c'est en
**colonnes** que le problème se trouve, là où aucun garde-fou ne regarde.

**(c) Que fait la découverte face à une fonction qui échoue ?**
Elle échoue avec elle, bruyamment, et les deux chemins de déploiement le traitent
correctement — c'est le point que je m'attendais à trouver mal fait, et il est bien fait :

```
$ create function f_verifier_zz_casse() ... begin raise exception 'je tombe en marche'; end;
$ node db/migrate.mjs --verifier
 ERR Le garde-fou f_verifier_schema() n'a pas pu être joué : je tombe en marche
     Le schéma n'est donc pas déclaré conforme : une question sans réponse n'est pas
     une réponse rassurante.
code de sortie = 7
```

`install.sh` fait de même, et — détail qui compte — il teste le code de sortie **à part**
de la substitution de commande, faute de quoi une fonction en échec aurait rendu une
chaîne vide et serait passée pour verte. C'est écrit et commenté. Correct.

**(d) Face à une fonction très lente ?**
Aucune borne. `migrate.mjs` ouvre sa connexion avec `statement_timeout=0` et
`idle_in_transaction_session_timeout=0` (ligne 690), légitime pour de longues migrations,
et `install.sh` n'en pose aucun. Un contrôle qui boucle ou qui attend suspend
indéfiniment le déploiement, sans message. Voir Q5-6 : mineur, une ligne.

**(e) Face à une fonction qui écrit ?**
**Elle écrit.** C'est le constat Q5-1 du §5, et le plus important de ce passage.

**(f) Le préfixe de démonstration peut-il entrer en collision ?**
Analysé au constat Q5-7. Réponse courte : la collision est devenue improbable mais reste
possible par la reprise d'un export, et **le sens de l'échec est le mauvais** — fausse
alarme sur la pièce qu'on montre à l'auditeur, exactement le défaut Q-4 en plus étroit.

---

## 4. La grille §4 — les seize contrôles

| # | Contrôle | Verdict | Ce que j'ai fait, et ce que j'ai vu |
|---|---|---|---|
| **S1** | Cloisonnement non contournable | ✅ **passé** | Session `FIL-A` : `select id, nom from risques` -> une seule ligne, celle de Toulouse ; la ligne de Hambourg est invisible. `enable` **et** `force row level security` sur **47 tables sur 47** (compté dans `pg_class`, pas dans la doc). `grc_app` : `rolsuper=f`, `rolbypassrls=f`, `rolcreaterole=f`, `rolcreatedb=f`, propriétaire de **0** objet du schéma public. Aucune vue, vue matérialisée, table partitionnée ni table distante n'existe pour échapper au balayage. Balayages B-1 et Q-2 réécrits (§3.1, §3.5) : rien. **Réserve documentée, non nouvelle** : la lecture de `journal_audit` n'est pas cloisonnée (dérogation assumée de 004 §6, resserrement ferme en L5) — je l'ai reproduite : une session de Toulouse lit `valeurs_apres` d'une entrée de Hambourg. Le contrôle C22 de la démonstration la dit à voix haute avant tout le reste, ce qui est la bonne façon de la porter. |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ **passé** (portée L1) | `f_filiales_lecture()`, `f_filiale_courante()`, `f_filiales_autorisees()` et `f_administration_groupe()` lisent uniquement `current_setting('grc.*')`, posés par `set local`. Aucun chemin de code n'alimente ces réglages depuis un corps, une entête ou un cookie : il n'y a pas encore de couche HTTP qui touche à la base (L2). `f_filiale_ecriture()` recoupe les deux réglages **dans la base** (§17.9), rejoué au §3.3. Le retrait de `cyber-context` côté frontend reste à faire en L2 : hors périmètre de L1, et écrit comme tel. |
| **S3** | Journal inaltérable et complet | 🟨 **partiel — sans objet pour la complétude** | Inaltérabilité : `update`/`delete`/`truncate` refusés en `GRC01` par trois déclencheurs `for each statement` armés **`always`**, privilèges retirés à `grc_app` et à `public`, table non possédée par le rôle applicatif — quatre couches, toutes présentes. `f_journal_audit_verifier()` ne renvoie rien sur ma base peuplée. L'acteur vient de la session (§17.8), rejoué. **Complétude** — « chaque événement de la liste §1.7 tracé, exports compris » — est **sans objet** : rien n'écrit encore au journal, c'est la matière du lot L5. |
| **S4** | Verrouillage optimiste effectif | 🟨 **partiel — mécanisme présent, vérification absente** | Le mécanisme est correct : `f_maj_tracabilite()` incrémente `version`, gèle `cree_le`/`cree_par` ; `f_init_tracabilite()` impose `version = 1` et ignore ce que le client envoie (rejoué au §3.4). Le client ne peut donc pas fixer `version`. Le `GRC03` lui-même appartient à L2 (zéro ligne sur `where version = $2`) : sans objet ici. **Mais** aucun garde-fou, aucun test et aucun contrôle de démonstration n'exige l'existence du déclencheur de **mise à jour** — constat **Q5-2**, et j'ai montré que son retrait défait le verrouillage sous quatre chemins verts. |
| **S5** | Aucune injection SQL | ✅ **passé** | Tout le SQL dynamique de L1 est en PL/pgSQL avec `format('%I')` / `format('%L')` (`f_verifier_schema`, `f_poser_tracabilite_insertion`, les boucles de politiques de 004) — j'ai relu chaque `execute format`. `to_regclass('public.' \|\| quote_ident(v_nom))` dans les deux garde-fous. `migrate.mjs` passe par des requêtes paramétrées. `install.sh` interpole `$BASE_NOM` et les noms de rôle **après** `valider_identifiant` (`^[a-z_][a-z0-9_]*$`), et fait passer tout le SQL par l'entrée standard, jamais par la ligne de commande. |
| **S6** | Droits vérifiés côté serveur | ⬜ **sans objet** | Il n'y a pas de point d'entrée applicatif au lot L1. Le modèle à trois axes est le lot L3. Ce que L1 pose et que la porte S3 devra ne pas croire acquis : `grc.administration_groupe` est une **déclaration que la session fait sur elle-même**, pas un privilège — le §17.4 le dit sans détour, et c'est la bonne façon de le dire. |
| **S7** | Le droit d'export distinct de la lecture | ⬜ **sans objet** | Les colonnes existent (`sessions.peut_exporter`, `groupes_ad.accorde_export`) ; la décision et sa journalisation sont L3/L5. |
| **S8** | Secrets | 🟨 **partiel** | Aucun secret dans le dépôt : `.env.example` ne porte que des valeurs vides, `install.sh` n'engendre ni ne journalise de secret et écrit `/etc/cyber-grc/env` en `root:cyber-grc 0640`, `preparer_base_dev.sh` porte un mot de passe `dev` documenté comme tel et refuse `NODE_ENV=production`. L'unité systemd documente elle-même sa limite (`/proc/<pid>/environ`). **Ce qui manque à ce tableau** : ce fichier contient aussi `BASE_MOT_DE_PASSE_PROPRIETAIRE`, et le §5 (Q5-1) dit ce que ce compte permet désormais de faire. Et un secret d'authentification est exposé en base : constat **Q5-3**. |
| **S9** | Chaîne de contrôle des pièces jointes | ⬜ **sans objet** | Lot L6. Le schéma est prêt (`etat_analyse`, `quarantaine`, `sha256`, contraintes de cohérence, `ck_pieces_jointes_quarantaine`) ; ni ClamAV ni magasin de fichiers n'existent. Une hypothèse de ce schéma sur du code non écrit est relevée en **Q5-5**. |
| **S10** | Sortie et en-têtes | 🟨 **partiel — acquis L0** | `serveur.ts` pose `x-content-type-options: nosniff`, `cache-control: no-store` et un `bodyLimit`. Le vhost Apache pose HSTS, `nosniff`, `X-Frame-Options: DENY` et une **CSP stricte** (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, pas de `unsafe-eval`). Les attributs du cookie de session sont L3. |
| **S11** | Rythme et verrouillage | ⬜ **sans objet** | Lot L3. Le schéma porte déjà `utilisateurs.tentatives_echouees` et `verrouille_jusqu_a`. |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ✅ **passé** (portée L1) | Les refus de la base nomment la **règle** et jamais la donnée invisible : `GRC04` cite la filiale que l'appelant a lui-même déclarée ; `f_coherence_mesure_catalogue()` fond délibérément « inconnue » et « locale à une autre filiale » dans un seul message, ce qui ferme l'oracle de catalogue ; PostgreSQL supprime le `DETAIL` d'un conflit d'unicité quand la ligne n'est pas visible — je l'ai constaté. L'**oracle d'existence** sur les clés primaires subsiste, il est nommé (T-8, O-4) et reporté au lot L2 : c'est un report explicite, pas un silence. |
| **S13** | Dénis de service applicatifs | 🟨 **partiel** | Côté pool : `poolMax`, `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`, `connectionTimeoutMillis`, tous bornés et configurables ; `bodyLimit` posé. La pagination des listes est L2. **Un manque relevé** : le chemin de migration/installation, lui, tourne sans borne de temps — constat **Q5-6**. |
| **S14** | Intégrité des opérations composites | ✅ **passé** (portée L1) | Les migrations s'appliquent en transaction, avec `ON_ERROR_STOP=1`, et `migrate.mjs` enregistre l'empreinte du fichier appliqué. Les cascades du §8 sont déclaratives donc atomiques. La démonstration prouve le cas composite qui compte (délier puis supprimer une mesure dans la **même** transaction : C55 refuse le raccourci, C56 accepte la séquence, C57 vérifie que l'action déliée survit). Les opérations composites de l'API et de l'import sont L2/L7. |
| **S15** | Dépendances | ✅ **passé, avec une remarque** | `npm audit` : **0 vulnérabilité**, avec et sans les dépendances de développement. Quatre dépendances seulement (`fastify`, `pg`, plus TypeScript et les types), toutes justifiées. `package.json` emploie des plages `^`, mais `install.sh` installe par `npm ci` (et `npm ci --include=dev` puis `npm prune`) : c'est le fichier de verrouillage qui fait foi, la version est donc bien figée à l'installation. |
| **S16** | **Les garde-fous sont branchés** | 🟨 **partiel — branchés, et trop grands ouverts** | Branchés : oui, et vérifiés par moi. `f_verifier_schema()` est appelée en fin des quatre migrations, par `migrate.mjs` et par `install.sh` ; elle **fait échouer** ces chemins (code 7 constaté) ; un contrôle en erreur est traité comme un échec et non comme un silence ; un point d'appel qui ne découvre plus rien le dit (`aucun_controle_decouvert`, épinglé par le banc d'essai). Les quatre contrôles sont découverts et non récités, et j'ai vérifié qu'un cinquième est joué sans toucher un seul fichier. **Mais** ce même mécanisme fait de la convention de nommage un **contrat d'exécution de code**, et le seul appelant qui soit superutilisateur est justement lui : constat **Q5-1**. Et deux listes écrites à la main subsistent, non vérifiées : constat **Q5-4**. |

**Récapitulatif** : 5 passés, 7 partiels, 4 sans objet, **0 en échec**.

---

## 5. Constats neufs

### 🟠 Q5-1 — MAJEUR · La convention de nommage `f_verifier_<x>()` est un contrat d'exécution de code, et le seul appelant superutilisateur est le point d'appel unique

**Ce qui est vrai, et qu'il faut créditer d'abord** : la découverte est la bonne réponse
au constat Q-1. Elle supprime l'occasion de l'oubli, elle est correctement écrite
(`format('%I')`, exclusion de soi par la forme du résultat, alerte sur le zéro absolu), et
elle fonctionne — je l'ai vérifiée en positif comme en négatif.

**Ce que personne n'a pesé** : `f_verifier_schema()` ne se contente pas de *lire* les
fonctions découvertes, elle les **exécute**, par `return query execute format(...)`, avec
les privilèges de l'appelant. Or `install.sh` l'appelle par `sql_admin_base()`, c'est-à-dire :

```bash
sql_admin_base() {
  ( cd /tmp && su "$SUPERUTILISATEUR" -s /bin/sh \
      -c "psql -X -q -A -t -v ON_ERROR_STOP=1 -d $BASE_NOM -f -" )
}
```

`su postgres`. C'est **le seul endroit de tout le dispositif où une fonction du schéma
`public` est exécutée par le superutilisateur du cluster** — je l'ai vérifié en relisant
les treize blocs `sql_admin*` de `install.sh` : tous les autres n'interrogent que
`pg_roles`, `pg_class` et le registre.

Deux propriétés aggravent la portée, et je les ai mesurées plutôt que supposées :

**1. `stable` n'empêche rien.** Le commentaire de `migrate.mjs` affirme : « La fonction est
`stable` et ne lit que des catalogues : l'appel n'écrit rien, et reste donc légitime sous
`--verifier`, qui promet "aucune écriture" ». **C'est faux.** PostgreSQL n'impose pas la
volatilité au SQL dynamique d'un `execute`. Démonstration, sous le compte propriétaire :

```sql
create or replace function public.f_verifier_zz_temoin()
returns table (objet text, anomalie text, detail text)
language plpgsql volatile set search_path = pg_catalog, public, pg_temp as $$
begin
  execute 'alter table public.risques no force row level security';
  execute 'insert into public.migrations_schema(version, nom)
           values (''005_jamais_ecrite'', ''migration qui n''''existe pas'')';
  return;   -- « aucune anomalie »
end; $$;
```

```
$ node db/migrate.mjs --verifier
Schéma à jour : 4 migration(s), rien à appliquer.
  garde-fous du schéma (f_verifier_schema, point d'appel unique) : aucune anomalie.
code de sortie = 0

$ select relname, relforcerowsecurity from pg_class where relname='risques';
 risques | f                     <-- « force row level security » retiré
$ select version from migrations_schema;
 001 / 002 / 003 / 004 / 005_jamais_ecrite   <-- entrée forgée dans le registre
```

Le chemin qui promet « aucune écriture » a retiré le `force` d'une table cloisonnée et
inscrit une migration qui n'a jamais existé, en annonçant « aucune anomalie ». L'ordre
alphabétique fait le reste : un contrôle nommé `zz…` s'exécute **après**
`f_verifier_couverture_rls`, donc son sabotage n'est pas vu du passage qui le commet.

**2. Sous `install.sh`, c'est une élévation hors de la base.** Même fonction, appelée par
le chemin réel du déploiement :

```
$ su postgres -s /bin/sh -c "psql -d grc_audit5 -c 'select count(*) from f_verifier_schema();'"
NOTICE:  ESCALADE : grc_app est devenu SUPERUSER
NOTICE:  ESCALADE : COPY TO PROGRAM exécuté
0                                    <-- « aucune anomalie »

$ select rolname, rolsuper from pg_roles where rolname='grc_app';
 grc_app | t
$ ls -la /tmp/escalade_prouvee
 -rw------- 1 postgres postgres 0 ...        <-- exécution de commande hors de la base
```

`alter role grc_app superuser` et `COPY … TO PROGRAM` sont refusés au propriétaire quand
il s'appelle lui-même (je l'ai vérifié : `permission denied to alter role`), et accordés
quand `install.sh` l'appelle. La RLS posée par 004 devient décorative, et l'attaquant sort
de PostgreSQL avec les droits du compte UNIX `postgres`.

**Pourquoi ce n'est pas couvert par « le propriétaire de la base est hors modèle de
menace » (§12).** Le §12 dit exactement ceci : « `root` sur la VM et le propriétaire de la
base peuvent désactiver un déclencheur. Le journal protège contre l'application et contre
l'administrateur *applicatif* — pas contre le DBA système. » L'exclusion porte sur la
**donnée de cette base**. Ici, le propriétaire **franchit une frontière que le modèle ne
lui accorde pas** : il devient superutilisateur du cluster (donc de toute autre base) et
obtient l'exécution de commandes sur la VM. Un modèle de menace qui accepte « le
propriétaire voit tout dans sa base » n'accepte pas « le propriétaire devient root de la
machine à la prochaine mise à jour ».

**Et le préalable est plus proche qu'il n'y paraît.** `grc_proprietaire` n'est pas le DBA
système : son mot de passe vit dans `/etc/cyber-grc/env`, en `root:cyber-grc 0640`, lu par
`EnvironmentFile=` de l'unité systemd — donc **présent dans l'environnement du processus
Node**, et `src/config` le charge même dans son objet de configuration
(`base.proprietaire`). Une lecture de fichier arbitraire ou une exécution de code dans le
service (L2 et suivants) livre donc ce compte. La chaîne complète est : défaut applicatif
-> compte propriétaire -> pose d'une fonction `f_verifier_x()` -> **prochaine exécution de
`install.sh`** (mise à jour, ou `--reprendre-propriete`) -> superutilisateur du cluster et
shell `postgres`. Chacun de ces maillons existe aujourd'hui.

**Correction, et elle est petite** :

1. **Ne pas appeler ce point d'appel sous le superutilisateur.** Dans `install.sh`, jouer
   `f_verifier_schema()` par une connexion `$ROLE_PROPRIETAIRE` (le mécanisme existe déjà,
   `install.sh` s'y connecte ligne 795 pour éprouver les mots de passe), ou, à défaut,
   faire précéder l'appel d'un `set role $ROLE_PROPRIETAIRE;` dans le même bloc SQL.
   L'élévation disparaît : le propriétaire exécute son propre code.
2. **Restreindre la découverte au propriétaire du schéma** : ajouter
   `and p.proowner = (select nspowner from pg_namespace where nspname = 'public')` à la
   requête de découverte, et signaler comme anomalie toute `f_verifier_*` qui ne satisfait
   pas ce critère plutôt que de la jouer. Une fonction posée par quelqu'un d'autre devient
   alors un constat, pas un exécutant.
3. **Corriger l'affirmation fausse** de `migrate.mjs` (« `stable` … l'appel n'écrit
   rien ») : `--verifier` ne peut pas promettre l'absence d'écriture tant qu'il exécute du
   code découvert. Soit la promesse est retirée, soit l'appel se fait dans une transaction
   `read only`, ce qui la rend vraie — `begin; set transaction read only; select …
   f_verifier_schema(); rollback;` bloque l'`insert` comme le `alter table`, je l'ai
   vérifié.

**Pourquoi majeur et non bloquant** : le préalable reste une compromission déjà grave, le
schéma livré ne contient aucune telle fonction, et la correction est mécanique et
localisée — elle ne demande de réparer aucune ligne de donnée. Elle doit néanmoins être
faite **avant l'ouverture de la vague 2**, parce que L2 est précisément le lot qui crée la
surface applicative par laquelle le premier maillon se ferme.

---

### 🟠 Q5-2 — MAJEUR · La moitié « mise à jour » de la traçabilité n'est vérifiée par rien, et son absence défait le verrouillage optimiste sous quatre chemins verts

Le §18.1 raconte le défaut du troisième passage ainsi : « `f_maj_tracabilite()` protégeait
l'`update` — et l'`insert` n'était protégé par rien. » Le correctif a écrit
`f_poser_tracabilite_insertion()` (qui **découvre** les tables) et
`f_verifier_tracabilite()` (qui **découvre** les tables et exige, pour chacune, le bon
déclencheur `before insert`, armé `always`, sans clause `when`). C'est bien fait, et j'ai
vérifié que ça mord.

**Le miroir n'existe pas.** `f_verifier_tracabilite()` ne dit pas un mot du déclencheur
`before update`. Ni le banc d'essai (`grep` sur `rls.test.mjs` : aucune assertion sur
`trg_*_maj`), ni la démonstration, sauf **un** contrôle, C78, qui l'exerce sur **une seule
table**, `risques`.

Or ce déclencheur porte deux garanties, et pas les moindres :

```sql
create or replace function f_maj_tracabilite() returns trigger ... as $$
begin
    new.version     := old.version + 1;   -- LE VERROUILLAGE OPTIMISTE (risque P1)
    new.modifie_le  := now();
    new.modifie_par := f_utilisateur_courant();
    new.cree_le     := old.cree_le;       -- non réinscriptible
    new.cree_par    := old.cree_par;      -- non réinscriptible
    return new;
end; $$;
```

**Démonstration.** Sur ma base saine, je retire trois déclencheurs de mise à jour, sur des
tables que C78 ne touche pas :

```
$ drop trigger trg_actions_maj   on actions;
$ drop trigger trg_incidents_maj on incidents;
$ drop trigger trg_documents_maj on documents;
```

Les quatre chemins de contrôle :

```
$ select count(*) from f_verifier_schema();                       ->  0
$ node db/migrate.mjs --verifier
    garde-fous du schéma (f_verifier_schema, point d'appel unique) : aucune anomalie.
$ psql -U grc_app -f db/verifier_cloisonnement.sql
    | contrôles | réussis | échoués |
    |        93 |      93 |       0 |
    NOTICE: CLOISONNEMENT DÉMONTRÉ — ... ne peut pas antidater ni signer du nom d'un
            autre les lignes qu'elle crée.
```

Et ce que la base fait pendant ce temps, sur `actions` :

```sql
insert into actions (id, filiale_id, titre) values ('ACT-P1','FIL-A','Chiffrer les postes');
-- (session de Mallory)
update actions set titre = 'écriture de Mallory',
                   cree_par = 'directeur general', cree_le = '2019-01-01'
 where id = 'ACT-P1' and version = 1;                      -- UPDATE 1
update actions set titre = 'écriture concurrente d''Alice, qui écrase'
 where id = 'ACT-P1' and version = 1;                      -- UPDATE 1  <-- devait échouer

 id     | version | titre                                    | cree_par          | cree_le    | modifie_par
 ACT-P1 |       1 | écriture concurrente d'Alice, qui écrase  | directeur general | 2019-01-01 | (vide)
```

Trois choses, dans l'ordre de gravité :

1. **Le verrouillage optimiste n'existe plus.** `version` reste à 1 ; les deux écritures
   concurrentes portant `where version = 1` réussissent toutes les deux, et la seconde
   écrase silencieusement la première. C'est **le risque P1 du `PLAN_SERVEUR`**, celui que
   le lot L2 est chargé de fermer et sur lequel il va construire son `GRC03` : L2 va poser
   `where id = $1 and version = $2` au-dessus d'un déclencheur que rien n'oblige à exister.
2. **`cree_par` et `cree_le` d'une ligne existante redeviennent réinscriptibles.** C'est le
   §18.1 atteint par l'autre bout : l'insertion est protégée, la modification ne l'est
   plus, et l'antidatage au nom d'un directeur général redevient possible — sur une ligne
   déjà en base, ce qui est pire, puisqu'elle a une histoire.
3. **La démonstration continue d'affirmer le contraire.** Son verdict final dit « ne peut
   pas antidater ni signer du nom d'un autre les lignes qu'elle **crée** » : la phrase
   reste littéralement vraie et pratiquement trompeuse.

C'est le motif que le §19.5 énonce et que le dépôt a déjà corrigé trois fois : *un
garde-fou couvre la moitié où le défaut a été trouvé.* Ici la moitié non couverte est
celle qui porte le risque numéro un du projet.

**Correction** : ajouter au balayage de `f_verifier_tracabilite()` — ou, mieux, dans une
`f_verifier_tracabilite_maj()` que le nouveau mécanisme branchera **sans toucher un seul
fichier de déploiement**, ce qui est exactement ce pour quoi il a été écrit — les mêmes
quatre exigences côté modification :

- toute table portant `cree_par` **et** `modifie_par` a un déclencheur `before update` ;
- c'est `f_maj_tracabilite` si la table porte `version`, `f_maj_horodatage` sinon
  (`migrations_schema`, dont la colonne `version` est un numéro de migration et non un
  compteur, est la seule exception à nommer — je l'ai vérifiée) ;
- sans clause `when` ;
- et, tant qu'on y est, armé comme son miroir (voir Q5-4).

Une vingtaine de lignes, calquées sur celles qui existent déjà juste au-dessus.

**Pourquoi majeur et non bloquant** : les 31 déclencheurs sont **tous présents
aujourd'hui** — je l'ai vérifié dans le catalogue —, donc aucune ligne n'est fausse et il
n'y a rien à réparer. Le défaut est l'absence de filet, pas un trou. **Mais il doit être
comblé avant la vague 2** : le jour où une table est ajoutée sans son déclencheur, les
lignes écrites entre ce jour et sa découverte seront indiscernables des légitimes — c'est
mot pour mot le critère de blocage, décalé d'un lot.

---

### 🟠 Q5-3 — MAJEUR · Le secret du compte d'administration de secours est lisible par toute session et par le compte de supervision, sans périmètre

Quatre passages ont raisonné en **lignes**. La RLS est un mécanisme de lignes, les
garde-fous lisent des politiques de lignes, la démonstration compte des lignes. Personne
n'a regardé les **colonnes**.

`utilisateurs` est légitimement de niveau Groupe : sa politique de lecture est
`using (true)`, exemptée nommément dans `v_sans_filiale_admises` avec le motif « identités ;
lues pour RÉSOUDRE le périmètre ». Le motif est juste. Mais cette table porte aussi :

```
 compte_secours          : boolean
 mot_de_passe_hash       : text
 mot_de_passe_modifie_le : timestamptz
 tentatives_echouees     : integer
 verrouille_jusqu_a      : timestamptz
```

et `mot_de_passe_hash` est, de l'aveu du schéma lui-même, « le **seul cas** où
l'application détient un secret d'authentification » : c'est le compte administrateur de
**secours**, hors AD, périmètre Groupe, profil d'administration — celui qui sert
précisément quand l'Active Directory ne répond plus.

Constaté sur ma base, où j'ai provisionné un tel compte :

```
-- session ORDINAIRE d'une filiale (Toulouse), périmètre FIL-A
$ select identifiant, compte_secours, mot_de_passe_hash from utilisateurs;
 secours | t | $argon2id$v=19$m=65536,t=3,p=4$SECRETSALT$SECRETHASHDUCOMPTEDESECOURS
 alice   | f |

-- grc_lecture, SANS AUCUN réglage de périmètre
$ select identifiant, mot_de_passe_hash from utilisateurs;
 secours | $argon2id$v=19$...
$ select count(*) from risques;
 ERROR: Périmètre non positionné ...   (GRC04)     <-- le cloisonnement, lui, tient

$ select has_column_privilege('grc_app','utilisateurs','mot_de_passe_hash','SELECT'),
         has_column_privilege('grc_lecture','utilisateurs','mot_de_passe_hash','SELECT');
 t | t
```

Autrement dit : le compte de supervision, qui ne peut lire **aucun** risque faute de
périmètre, lit l'empreinte du mot de passe de l'administrateur Groupe. Et toute session
applicative de n'importe quelle filiale aussi.

**Ce qui rend ce constat significatif plutôt que théorique** : le paramétrage, lui, a été
traité correctement, et le contraste est parlant. `parametres` porte un booléen `secret`
et une contrainte qui **interdit** de ranger la valeur en base :

```sql
constraint ck_parametres_secret check
  ((not secret) or (valeur is null and reference_secret is not null))
```

Le schéma sait donc épingler ce genre de promesse. Il ne l'a pas fait pour le seul secret
qu'il stocke réellement.

**Pourquoi cela n'est ni S1 ni S8, et tombe entre les deux** : S1 parle de cloisonnement
par filiale, et `utilisateurs` est Groupe à dessein ; S8 parle du dépôt, des réponses
d'API, des journaux techniques et des messages d'erreur. Une colonne lisible en base
n'est dans aucune des deux listes. C'est une lacune de la grille autant qu'un défaut du
schéma (voir §6).

**Correction, et elle est gratuite aujourd'hui** — la table est vide, le compte de secours
sera créé en L3 :

- retirer le privilège de colonne : `revoke select (mot_de_passe_hash) on utilisateurs
  from grc_app, grc_lecture` (et de même pour `mot_de_passe_modifie_le` si l'on veut être
  complet) ;
- exposer la seule opération dont L3 a besoin par une fonction `security definer`
  appartenant à `grc_proprietaire` — `f_verifier_secret(p_identifiant, p_empreinte)` —
  qui compare sans jamais rendre l'empreinte ;
- ou, plus propre et à peine plus cher, déplacer le secret dans une table dédiée
  (`utilisateur_secrets`), sans privilège pour `grc_lecture`.

**Après la mise en service, la correction reste possible mais s'accompagne d'une rotation
du mot de passe de secours** : il faut alors supposer l'empreinte compromise, ce qui est
exactement le genre de dette qu'on ne veut pas contracter sur le compte de dernier
recours. C'est pourquoi je l'inscris en **condition d'entrée du lot L3**, pas plus tard.

---

### 🟡 Q5-4 — MINEUR · Deux listes écrites à la main subsistent, et l'une d'elles cache une asymétrie non expliquée

Le §19.5 pose la règle : « un garde-fou **découvre** son périmètre dans le catalogue ; il
ne le récite pas. Une liste écrite à la main n'est admise que si le garde-fou vérifie
qu'elle est complète. » Trois listes ont été supprimées ou instrumentées par le cinquième
correctif. Deux restent, dans `004_rls.sql` §7, et rien ne vérifie leur complétude.

**(a) Les cinq déclencheurs de portée figée.** Ils sont posés par cinq `create trigger`
recopiés. J'ai recompté dans le catalogue : sept tables portent un `filiale_id` nullable,
deux sont déclarées non mixtes (§17.7), il en reste cinq, et ce sont exactement celles qui
portent le déclencheur. **La liste est juste aujourd'hui.** Mais une sixième table mixte
ajoutée en L4 ou L7 recevrait ses politiques (faute de quoi `f_verifier_couverture_rls()`
la réclamerait) **sans** son déclencheur de portée, et **aucun contrôle ne le dirait** —
rouvrant le constat M-3, dont le rayon est une cascade dans les données des dix-neuf
autres filiales.

**(b) Les neuf déclencheurs armés en `always`,** énumérés en `v_declencheurs`. Même
remarque, et un second point qui m'a arrêté. Répartition réelle de l'armement, comptée
dans `pg_trigger` :

```
 armés « always » (A)                    armés « origin » (O)
 f_init_tracabilite            31        f_maj_tracabilite            31
 f_init_creation               10        f_maj_horodatage              1
 f_init_horodatage              1
 f_interdit_changement_portee   5
 f_coherence_mesure_catalogue   4
 f_interdit_modification        3
 f_journal_audit_chainage       1
 f_approbations_verrou_decision 1
```

**Chaque déclencheur d'insertion est armé `always` ; son miroir de mise à jour ne l'est
pas.** Le motif invoqué par le constat N-11 pour armer les neuf est : « ces déclencheurs
portent des garanties de cloisonnement **opposables** ; ce qui porte une garantie
opposable s'arme comme tel, et l'écart avec le journal n'a pas de raison d'être ». Le
raisonnement vaut au moins autant pour `f_maj_tracabilite`, qui porte le verrouillage
optimiste et le gel de `cree_par`. L'écart n'est ni expliqué ni documenté.

Sa portée est faible aujourd'hui, et je le dis pour ne pas le surestimer :
`session_replication_role` est un paramètre `SUSET`, refusé au rôle applicatif comme au
propriétaire. Mais N-11 justifie lui-même l'armement par un scénario non hostile — « le
jour où une réplication logique, un outil de migration de données ou une **reprise en
masse** basculerait la session en mode `replica` » — et le lot **L7** est exactement une
reprise en masse, sur un chantier dont l'import généralisé est un « critère décisif
client ».

**Correction** : armer les 32 déclencheurs de mise à jour comme leurs miroirs, et
remplacer les deux listes par une **découverte** — l'armement se déduit du catalogue
(`tgname like 'trg\_%\_maj'`, fonction dans un ensemble fermé), et la complétude de la
liste des tables mixtes se déduit de `attnotnull = false` sur `filiale_id` moins les
exemptions du §17.7, qui, elles, sont nommables. Le contrôle correspondant s'écrit
naturellement comme une `f_verifier_portee_figee()`, donc branchée d'office.

---

### 🟡 Q5-5 — MINEUR · La dérogation `uq_pieces_jointes_chemin` repose sur du code qui n'existe pas encore

Des cinq dérogations d'unicité, quatre sont vraies par construction et je les ai vérifiées
dans le catalogue (§3.5). La cinquième est vraie **par promesse** :

```
-- Chemin de stockage d'une pièce jointe : c'est un chemin de SYSTÈME DE FICHIERS,
-- unique sur le disque par nature. Le nom est engendré par le serveur et opaque :
-- une filiale ne peut pas le deviner pour occuper celui d'une autre.
'uq_pieces_jointes_chemin'
```

Or dans le schéma livré, `chemin_stockage` est un `text not null` sans aucune contrainte
de forme, et il est écrit par le rôle applicatif comme n'importe quelle autre colonne. Le
caractère « aléatoire opaque » n'est affirmé que par un `comment on column`, et le code qui
l'engendrerait appartient au lot **L6**, qui n'est pas écrit. La démonstration elle-même
insère `'/magasin/demo/pj-demo-a'`, un chemin parfaitement devinable.

**Le scénario, si L6 choisit la voie naturelle.** Un générateur de chemin qui incorpore
l'identifiant de l'entité ou le nom du fichier d'origine — c'est l'implémentation
spontanée, et elle a de bonnes raisons (retrouver un fichier orphelin sur le disque) —
rend le chemin **prédictible**. La filiale A insère alors une ligne de pièce jointe chez
elle, avec le chemin que la filiale B obtiendra pour son prochain envoi ; B reçoit un
« doublon » sans détail, sur une ligne qu'elle ne peut pas lire. C'est **littéralement le
constat Q-2**, un lot plus loin, sur la seule unicité dont la dérogation ne soit pas
auto-portante.

**Correction, en une ligne, et elle vaut mieux qu'une note** : poser dès maintenant la
contrainte qui rend la dérogation vraie, sur le modèle de `ck_parametres_secret` — par
exemple `check (chemin_stockage ~ '^[0-9a-f]{2}/[0-9a-f]{64}$')`, ou la forme que L6
retiendra. La table est vide : le coût est nul aujourd'hui, et non nul après la mise en
service, puisqu'il faudrait alors **déplacer des fichiers sur le disque** pour rendre le
stock conforme. À défaut, écrire la condition dans `CONVENTIONS.md` §19.1 comme condition
d'entrée du lot L6, nommément.

---

### 🟡 Q5-6 — MINEUR · Le point d'appel unique n'a aucune borne de temps

`migrate.mjs` ouvre sa connexion avec :

```js
options: '-c statement_timeout=0 -c idle_in_transaction_session_timeout=0 -c search_path=public'
```

Choix défendable pour de longues migrations. Mais `f_verifier_schema()` emprunte la même
connexion, et `install.sh` n'en pose aucune de son côté. Un contrôle découvert qui boucle,
attend un verrou ou dort suspend indéfiniment le déploiement, sans message et sans
diagnostic — le pire moment pour un blocage muet étant l'installation d'une mise à jour.

**Correction** : encadrer le seul appel au point d'appel unique d'un
`set local statement_timeout = '60s'` (et le rendre à `0` ensuite, ce que `set local`
fait de lui-même). Deux lignes, dans les deux chemins.

---

### 🟡 Q5-7 — MINEUR · Le prédicat de démonstration `like '%-DEMO-%'` peut encore rendre une fausse alarme

Le constat Q-4 est bien corrigé : le contrôle C04 ne compte plus toutes les lignes de
portée Groupe de la base, il borne son comptage à `id like '%-DEMO-%'`. Je l'ai joué sur
une base peuplée, il se tait correctement.

Reste que la borne est une **recherche de sous-chaîne sur une donnée dont le schéma dit
lui-même qu'elle est volontairement permissive**. Les identifiants engendrés — par
`f_generer_id()` côté serveur comme par `UI.genId()` côté frontend — ont la forme
`<PRÉFIXE>-<millisecondes>-<aléa>` et ne peuvent pas contenir `-DEMO-`. Mais le
`CONVENTIONS.md` §2 et le principe « identifiants texte conservés » du chantier imposent
que la **reprise d'un export `grc-backup` garde les identifiants verbatim** : un export
fabriqué, ou simplement une base historique où quelqu'un a saisi un identifiant à la main,
peut donc déposer une ligne de portée Groupe portant `-DEMO-`.

Et **le sens de l'échec est le mauvais** : la ligne intruse fait rendre « attendu 8,
obtenu 9 », donc `ÉCHEC`, donc « CLOISONNEMENT EN DÉFAUT — ne pas mettre en service ». Une
fausse alarme sur la pièce dont toute la valeur est d'être crue, c'est exactement le
raisonnement écrit dans l'en-tête du script à propos de Q-4, et il s'applique encore, en
plus étroit.

**Correction** : borner le comptage sur ce que le script **sait** avoir semé — la liste
littérale des huit identifiants, ou `cree_par = 'zzdemo-demonstration'`, qui est vrai par
construction pour toute ligne née dans la transaction et faux pour tout le reste. La même
remarque vaut pour les quelques autres prédicats en `like`.

*Remarque de même famille, sans gravité mais qu'un exploitant doit savoir* : le script
écrit au journal d'audit, et `f_journal_audit_chainage()` prend
`pg_advisory_xact_lock(4718271936042001)`, qui vit jusqu'au `rollback` final. Joué « sur la
base de production » comme l'en-tête y invite, il **sérialise toutes les écritures au
journal du groupe** pendant sa durée (une à deux secondes ici). Ce n'est pas un défaut,
c'est une phrase à ajouter à côté de « peut donc être joué sur la base de production ».

---

### 🟡 Q5-8 — MINEUR · Deux affirmations du corpus normatif ne correspondent pas au catalogue, et un rôle échappe à un contrôle

**(a) `sessions` n'a pas de `filiale_id`.** Le §17.7 range trois tables sous le titre
« Trois tables portent un `filiale_id` nullable **sans** être des tables métier mixtes », et
donne pour `sessions` le motif « la session existe avant que son périmètre soit résolu ».
Dans le catalogue, `sessions` ne porte **aucune** colonne `filiale_id` : elle a
`filiale_active_id`, ce qui est d'ailleurs pourquoi elle figure dans
`v_sans_filiale_admises` (les tables *sans* `filiale_id`) et non parmi les dérogations. Le
tableau du §17.7 compte donc trois tables là où il y en a deux, et donne à la troisième un
motif qui n'est pas le sien. Sans conséquence sur le code — les deux listes du garde-fou
sont, elles, exactes — mais c'est une cinquième inexactitude d'un document dont le §7 du
`PLAN_EXECUTION` note déjà qu'il « s'est trompé quatre fois ».

**(b) La migration et la démonstration ne contrôlent qu'un rôle sur deux.** Le bloc
d'attributs de `004_rls.sql` (« c'est le contrôle S1 de la grille, et il doit ARRÊTER la
migration ») interroge `pg_roles` pour `grc_app` **seulement**. La démonstration fait de
même (« `grc_app` n'a ni SUPERUSER, ni BYPASSRLS, ni CREATEROLE, ni CREATEDB »). Or
`grc_lecture` est un rôle de connexion qui détient `select` sur les 47 tables, et un
`bypassrls` posé sur lui — le geste le plus tentant qui soit, « c'est un compte de
lecture, quel risque ? » — lui donnerait les vingt filiales. À la décharge du dispositif,
`install.sh` **le contrôle bien**, pour les deux rôles (lignes 870-885) : le trou n'est
donc pas dans le déploiement, il est dans les deux contrôles qui sont censés le doubler.
Deux mots à ajouter dans un `in (...)`.

---

## 6. Pourquoi je ne refuse pas, et ce qui aurait pu m'y conduire

Le critère employé depuis le premier passage est celui-ci : *un défaut est bloquant quand
le corriger maintenant coûte peu et le corriger après la mise en service exige de réparer
des lignes qu'on ne pourra plus distinguer des légitimes.* Je l'ai appliqué constat par
constat.

- **Aucun des huit constats n'est une brèche de cloisonnement.** La frontière entre
  filiales a tenu sous mes balayages réécrits (clés étrangères, unicités, politiques,
  actions référentielles), sous mes rejeux des cinq scénarios précédents, et sous six
  mutations. Le seul chemin par lequel une filiale voit une autre est la lecture du
  journal d'audit, qui est une dérogation **écrite, motivée, datée** (L5) et **annoncée à
  voix haute par la démonstration elle-même**, avant tout le reste. C'est la bonne façon
  de porter une dette.
- **Q5-1** exige au préalable la compromission du compte propriétaire, et le schéma livré
  ne contient aucune fonction hostile. Sa correction est mécanique et ne touche aucune
  donnée. Ce qui m'a fait hésiter : la conséquence dépasse le modèle de menace écrit, et
  une élévation qui a eu lieu ne se distingue pas après coup. Ce qui a emporté ma
  décision : le premier maillon de la chaîne (un défaut applicatif) n'existe pas encore,
  puisque la couche applicative n'est pas écrite — il naîtra en vague 2, et c'est
  précisément là que je place la correction.
- **Q5-2** décrit un filet manquant, pas un trou : les 31 déclencheurs sont tous présents,
  aucune ligne n'est fausse, rien n'est à réparer. Ce qui m'a fait hésiter : c'est le
  risque P1, et le lot suivant va construire dessus. Ce qui a emporté ma décision : la
  correction est une vingtaine de lignes dans une fonction existante, et le mécanisme de
  découverte que ce même correctif vient de livrer la branchera **sans qu'aucun fichier de
  déploiement change** — c'est la meilleure démonstration possible que ce mécanisme valait
  la peine.
- **Q5-3** est le seul défaut **vivant** du lot, et j'ai sérieusement envisagé de refuser
  dessus. Ce qui m'en a dissuadé : la table est vide et le restera jusqu'au lot L3, qui
  crée le compte de secours. La correction faite avant L3 ne coûte rien du tout. Faite
  après, elle coûte une rotation de mot de passe — désagréable, pas irréparable.
- Les cinq mineurs sont des durcissements et des exactitudes de rédaction.

**Ce que je refuse en revanche de faire, c'est appeler cela « franchie sous réserve ».** Le
quatrième passage a employé cette formule et sa réserve s'est révélée bloquante : la
formule endort. Je dis donc : **franchie**, et je nomme au §7 trois corrections, avec pour
chacune un lot d'échéance et la raison précise pour laquelle elle ne peut pas glisser
au-delà.

---

## 7. Ce qui est reporté, à qui, et pour quand

| # | Constat | Rôle propriétaire | Échéance | Pourquoi pas plus tard |
|---|---|---|---|---|
| **Q5-1** | Découverte exécutante appelée sous le superutilisateur ; `--verifier` promet à tort « aucune écriture » | **DÉPLOIEMENT** (`install.sh`) + **OUTILLAGE** (`migrate.mjs`) + **SCHEMA** (filtre `proowner`) | **avant l'ouverture de la vague 2** | La vague 2 crée la surface applicative qui ferme le premier maillon de la chaîne. Trois lignes maintenant, un incident de sécurité ensuite. |
| **Q5-2** | Le déclencheur de traçabilité en **mise à jour** n'est exigé par aucun garde-fou | **SCHEMA** (le contrôle) + **OUTILLAGE** (le test qui le mord) | **avant l'ouverture de la vague 2** | L2 bâtit `GRC03` sur `version`. Une table ajoutée sans son déclencheur produit des écrasements silencieux et des `cree_par` forgés que rien ne distinguera ensuite. |
| **Q5-3** | `mot_de_passe_hash` du compte de secours lisible de toute session et de `grc_lecture` | **SCHEMA** (privilèges de colonne) + **AUTH** (fonction de vérification) | **avant le lot L3** | L3 crée le compte de secours. Tant qu'il n'existe pas, la correction est gratuite ; après, elle emporte une rotation du mot de passe de dernier recours. |
| Q5-4 | Deux listes écrites à la main ; armement `origin` des 32 déclencheurs de mise à jour | SCHEMA | **avant le lot L7** (import en masse) | L7 est le scénario `replica` que N-11 nomme lui-même. |
| Q5-5 | `uq_pieces_jointes_chemin` : dérogation adossée à du code non écrit | SCHEMA (contrainte) ou DOC (condition d'entrée) | **avant le lot L6** | La table est vide ; après, il faudrait déplacer des fichiers sur le disque. |
| Q5-6 | Aucune borne de temps sur le point d'appel unique | OUTILLAGE + DÉPLOIEMENT | vague 2 | Confort d'exploitation ; deux lignes. |
| Q5-7 | Prédicat de démonstration en `like '%-DEMO-%'` | OUTILLAGE | vague 2 | Le sens de l'échec est la fausse alarme, sur la pièce d'audit. |
| Q5-8 | §17.7 inexact sur `sessions` ; `grc_lecture` hors du contrôle d'attributs de 004 et de la démonstration | DOC + SCHEMA + OUTILLAGE | vague 2 | Coût nul. |

---

## 8. Ce que la grille ne couvre pas

Au-delà des limites déjà écrites au §4 du `PLAN_EXECUTION` (elle ne remplace pas le test
d'intrusion de L15, elle ne protège ni contre `root` sur la VM ni contre le propriétaire
de la base), ce passage en a rencontré quatre autres, et je les signale parce que ce sont
elles qui ont produit mes constats :

1. **La grille raisonne en lignes, jamais en colonnes.** S1 dit « zéro ligne de la filiale
   B » ; aucun contrôle ne demande *quelles colonnes* une session peut lire d'une table
   qu'elle a le droit de lire. C'est par ce trou que Q5-3 est passé : `utilisateurs` est
   correctement de niveau Groupe, et ce niveau expose un secret. **Proposition** : ajouter
   à S8 la phrase « ni dans une colonne lisible par un rôle qui n'en a pas l'usage », et
   un balayage des privilèges de colonne au garde-fou de couverture.
2. **La grille demande qu'un garde-fou soit branché (S16), jamais que le branchement soit
   sûr.** S16 est né d'un garde-fou que rien n'appelait ; il ne dit rien du cas inverse, un
   point d'appel si accueillant qu'il devient une surface d'exécution. C'est Q5-1.
   **Proposition** : compléter S16 par « et le chemin qui l'appelle n'accorde pas plus de
   privilèges que le contrôle n'en a besoin ».
3. **La grille ne demande nulle part que le garde-fou couvre le miroir de ce qu'il
   garde.** Insertion sans modification (Q5-2), lecture sans écriture, création sans
   suppression : c'est le motif qui a produit trois des cinq constats bloquants de cette
   porte. **Proposition** : en faire une question explicite de la définition de
   « terminé » — *« et l'opération symétrique ? »*.
4. **Les canaux d'agrégation du catalogue restent ouverts et le resteront.** `pg_stats`
   masque correctement les tables sous RLS (vérifié : une session de Toulouse n'obtient
   aucune statistique sur `risques`), mais `pg_class.reltuples` donne un ordre de grandeur
   du nombre de lignes de chaque table **pour tout le groupe**. C'est inhérent à
   PostgreSQL et sans remède raisonnable ; cela mérite d'être écrit une fois plutôt que
   redécouvert à chaque porte.

---

## 9. Ce que je n'ai pas pu vérifier

- **PostgreSQL 17.** Tout ce qui précède a été mesuré sur **16.13**. La cible est 17.
  Deux points de ce lot dépendent de comportements que je n'ai pas pu éprouver sur 17 :
  la non-application de la volatilité `stable` au SQL dynamique (Q5-1) et la sémantique
  `MATCH SIMPLE` d'une clé composite dont un membre est nul (§3.1). Aucun des deux n'a
  changé à ma connaissance, mais la vérification appartient à la recette sur la VM cible.
- **`deploy/install.sh` de bout en bout.** Je l'ai lu intégralement et j'ai reproduit à la
  main le chemin qui m'intéressait — l'appel de `f_verifier_schema()` par
  `su postgres -c psql`, en rejouant exactement la commande de `sql_admin_base()`. Je n'ai
  pas exécuté le script complet : il installe des paquets, crée des comptes système et
  configure Apache, ce qui n'est ni possible ni souhaitable ici.
- **Debian 13, Apache, ClamAV, Active Directory, relais SMTP** : absents de la machine de
  développement, comme le `PLAN_EXECUTION` §6 l'annonce. Les contrôles S6, S7, S9 et S11
  sont donc « sans objet », jamais « passés ».
- **Le comportement sous concurrence réelle.** J'ai démontré la défaite du verrouillage
  optimiste par deux écritures séquentielles dans une même transaction, ce qui suffit à
  établir que `version` ne bouge plus. Je n'ai pas monté de banc multi-connexions ; le
  vrai test appartient à L2, avec `GRC03`.
- **La question ouverte du §18.3**, distinguer « pas d'acteur » de « acteur non résolu »
  dans le journal, reste une décision du lot L3. Je confirme seulement que le schéma ne
  peut pas la trancher, et qu'elle est correctement signalée comme telle.
- **Le découpage Groupe/Filiale n'est toujours pas validé par le RSSI groupe** (risque P5).
  Aucune trace n'en subsiste dans le dépôt, et `CLAUDE.md` §8 le note déjà. Ce n'est pas un
  constat de sécurité, mais c'est la seule chose de ce lot qui, si elle bascule, se paiera
  en migration de données plutôt qu'en correctif — et elle est attendue avant la mise en
  service pilote, pas après.

---

## 10. Ce qui mérite d'être retenu de ce passage

Le mécanisme de découverte livré par le cinquième correctif est **la bonne réponse** au
défaut qu'il visait : je l'ai attaqué en positif et en négatif, il découvre, il réclame le
zéro absolu, il fait échouer les deux chemins de déploiement, et l'inversion du sens de
lecture du garde-fou de couverture ferme le défaut par défaut au lieu de l'ouvrir. Quatre
passages avaient trouvé des trous dans le cloisonnement ou dans la traçabilité ; celui-ci
n'en a trouvé aucun, et c'est un résultat en soi.

Ce qu'il a trouvé, en revanche, tient en une phrase, et elle vaut pour les portes à venir :
**un mécanisme qui supprime l'occasion de l'oubli crée, du même geste, un point unique où
tout converge — et ce point mérite qu'on lui applique la même défiance qu'aux listes qu'il
remplace.** Le contrat « écris une fonction nommée ainsi et elle sera jouée partout » est
excellent contre l'oubli et permissif par nature. Il valait la peine d'être écrit ; il vaut
la peine d'être borné.

Et une seconde, plus ancienne, que ce passage confirme pour la quatrième fois : **le
garde-fou couvre la moitié où le défaut a été trouvé.** Les clés étrangères et pas les
unicités ; les six liaisons et pas la septième ; l'insertion et pas la modification. La
question à poser en fin de chaque correctif est toujours la même — *et l'opération
symétrique ?*

---

*Rapport rendu en lecture seule. Aucun fichier du dépôt modifié hors celui-ci ; aucun*
*`git add`, `commit` ni `push`. Base d'essai : `grc_audit5`, laissée saine*
*(`select count(*) from f_verifier_schema()` -> 0 ; démonstration 93/93). Les bases*
*`grc_audit`, `grc_audit2`, `grc_audit3`, `grc_audit4`, `grc_correctif`,*
*`grc_correctif_peuple` et `grc_install` n'ont pas été touchées.*
