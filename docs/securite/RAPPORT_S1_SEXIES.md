# Porte de sécurité S1 — sixième passage

> **Agent** : SECU-6 — revue adversariale indépendante, **lecture seule**.
> **Objet** : lot **L1** (schéma relationnel et cloisonnement), vague 1.
> **Date** : 31/08/2026 · **Dépôt** : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, commit `f317266`.
> **Grille rejouée** : `docs/PLAN_EXECUTION.md` §4, **les seize contrôles**, intégralement.
> **Passages précédents** : [`RAPPORT_S1.md`](RAPPORT_S1.md) · [`RAPPORT_S1_BIS.md`](RAPPORT_S1_BIS.md) · [`RAPPORT_S1_TER.md`](RAPPORT_S1_TER.md) · [`RAPPORT_S1_QUATER.md`](RAPPORT_S1_QUATER.md) · [`RAPPORT_S1_QUINQUIES.md`](RAPPORT_S1_QUINQUIES.md).
>
> Je n'ai écrit aucune ligne du code contrôlé ni aucun des cinq rapports précédents.
> Aucun fichier du dépôt n'a été modifié en dehors du présent rapport ; aucun `git add`,
> `commit` ni `push` n'a été fait (`git status` propre, vérifié). Tous les essais ont été
> joués sur une base qui m'est propre, **`grc_audit6`**, montée pour ce passage ; les
> scripts d'attaque sont restés dans le répertoire de travail temporaire, jamais dans le dépôt.

---

## 1. Verdict

**Porte S1 confirmée franchie.** Les trois majeurs du cinquième passage — le point d'appel
unique devenu contrat d'exécution de code (Q5-1), la moitié « mise à jour » de la traçabilité
non vérifiée (Q5-2), le secret du compte de secours lisible de partout (Q5-3) — sont
**réellement fermés** : je les ai rejoués un par un, en positif et en négatif, et à chaque fois
le garde-fou correspondant **mord** et **fait échouer** le déploiement. Le cloisonnement tient,
et aucun des six constats neufs n'est une brèche de frontière : ce sont des **mineurs** —
une asymétrie de garde-fou, deux surfaces de défense en profondeur, et trois inexactitudes de
documentation.

| | Nombre |
|---|---|
| Bloquants | **0** |
| Majeurs | **0** |
| Mineurs | **6** (X6-1 à X6-6) |

**Je ne demande pas de re-passage.** Les six mineurs sont assignés au §7 : trois sont des
corrections de quelques lignes à prendre au fil de la vague 2, trois sont des mises à jour
documentaires. La vague 2 peut s'ouvrir.

**Franc dans les deux sens** — ce que je crédite sans réserve, parce que c'est le fait
marquant de ce passage : *le remède élégant du quatrième passage (la découverte des garde-fous)
a introduit un défaut majeur au cinquième (l'exécution de code sous le superutilisateur), et le
correctif du cinquième referme ce défaut sans en rouvrir un autre.* J'ai cherché la « sixième
chose » là où on m'a dit de chercher — la construction `security definer` fraîchement posée au
point de convergence de tout le dispositif — et je n'y ai trouvé aucune escalade. C'est la
première fois qu'un correctif de cette série ne se paie pas d'un nouveau major.

---

## 2. Ce que j'ai monté, et ce que j'ai joué

Base neuve, migrations appliquées depuis zéro, sans intervention manuelle :

```
$ BASE_NOM=grc_audit6 bash db/dev/preparer_base_dev.sh --recreer
  ok  aucun rôle applicatif porteur de SUPERUSER ou BYPASSRLS
  ok  PUBLIC privé de tout sur « grc_audit6 » ; connect accordé nommément
  ok  grc_app et grc_lecture sans TEMPORARY — pg_temp ne peut pas masquer le schéma
  001_socle.sql ............... appliquée en 170 ms
  002_metier_noyau.sql ........ appliquée en 122 ms
  003_metier_operations.sql ... appliquée en 135 ms
  004_rls.sql ................. appliquée en  85 ms
Schéma à jour : 4 migration(s) appliquée(s) sur 4.
  garde-fous du schéma (f_verifier_schema, point d'appel unique) : aucune anomalie.
```

État de l'objet contrôlé, lu dans le catalogue et non dans la documentation :

```
 tables | rls activée | rls forcée | politiques | fonctions | security definer | déclencheurs non internes | armés « always »
     47 |          47 |         47 |        188 |        31 |                1 |                        88 |               88
 relkind autre que r/i dans public : 0  (aucune vue, vue matérialisée, table partitionnée ni table distante)
```

Les quatre chemins de preuve, joués par moi :

```
$ npm run verifier-types                 -> 0 erreur
$ npm test                               -> tests 325 | pass 325 | fail 0 | cancelled 0 | skipped 0
$ psql -U grc_app -f db/verifier_cloisonnement.sql
                                         -> 101 contrôles, 101 réussis, 0 échoué, code 0
$ npm audit                              -> found 0 vulnerabilities
```

À quoi j'ajoute **mes propres greffes et mutations** (§3 et §5), écrites indépendamment du
dépôt : deux fonctions hostiles plantées dans le schéma, quatre déclencheurs retirés ou
désarmés, une colonne ajoutée, un privilège rouvert, une course de concurrence sur deux
connexions réelles, et onze exécutions du banc d'essai dont dix concurrentes.

---

## 3. Le sort des constats des cinq passages

Règle que je me suis donnée, la même que le cinquième passage : ne pas relire la démonstration
du dépôt, mais **rejouer le scénario** sur ma base. Un contrôle qui passe parce qu'il interroge
la même requête que le correctif ne prouve rien.

### 3.1 Constats des passages 1 à 4 · **CLOS, non rouverts**

Je ne les rejoue pas à l'identique — le cinquième passage les a rejoués et le §3 de
`RAPPORT_S1_QUINQUIES.md` en fait foi — mais j'ai reconstitué leur **état de catalogue**, qui
est la trace durable de leur fermeture :

- **B-1 (sept clés étrangères traversant la frontière)** : mon balayage indépendant des clés
  étrangères dont enfant et parent portent tous deux `filiale_id` sans que la clé l'inclue
  rend cinq lignes, toutes vers `mesure_catalogue` (mixte, `on delete restrict`) ou la portée
  de `document_referentiels` (doublée d'une clé composite) — aucune n'est un défaut, exactement
  la conclusion du cinquième passage.
- **M-2 / m-4 / M-3, N-1 (filiale d'écriture, portée figée)** : `f_filiale_ecriture()` recoupe
  `grc.filiale_id` avec `f_filiales_autorisees()` (rejoué au §5, finding aucun) ; le déclencheur
  de portée figée existe sur les cinq tables mixtes, découvertes par `f_tables_mixtes()`.
- **T (insert non éprouvé, garde-fou non branché)** : `f_verifier_tracabilite()` couvre
  l'insertion, et le point d'appel `f_verifier_schema()` est branché sur les quatre migrations,
  `migrate.mjs` et `install.sh` — vérifié au §5.
- **Q (unicités contournant la RLS, sentinelle capturable)** : `f_verifier_unicite_cloisonnee`
  existe et est découverte ; `utilisateurs.identifiant` refuse `systeme` (contrainte présente).

### 3.2 Q5-1 (cinquième passage) — le point d'appel unique est un contrat d'exécution de code · **CLOS**

Le correctif ajoute **trois défenses indépendantes** au point d'appel. Je les ai éprouvées
séparément, avec une greffe qui respecte **les quatre propriétés** exigées (propriété du
propriétaire de la base, non `security definer`, non volatile, chemin de recherche figé) — donc
qui est **jouée**, pas constatée :

**Défense « on ne joue que ce qui est légitime ».** Une greffe *volatile* est correctement
**constatée** au lieu d'être exécutée :

```
$ select controle, objet, anomalie from f_verifier_schema() where objet like 'f_verifier_zz6%';
 point_appel | f_verifier_zz6c_vol | controle_non_conforme       <-- signalée, pas jouée
$ select ... from migrations_schema where version like '098%';  -> (aucune)   <-- son insert n'a pas eu lieu
```

**Défense « abaissement par security definer ».** Le point d'appel est `security definer`,
propriété `grc_proprietaire`. Joué par le chemin réel de l'installation (`su postgres`,
superutilisateur du cluster), une fonction découverte s'exécute néanmoins comme le
propriétaire, pas comme le superutilisateur — `COPY … TO PROGRAM` reste refusé :

```
$ su postgres -c "psql -d grc_audit6 -f -" <<< 'begin; set transaction read only; ... select … f_verifier_schema(); rollback;'
NOTICE:  [greffe stable] current_user=grc_proprietaire session_user=postgres superuser=on
NOTICE:    [aux volatile] COPY -> REFUS : permission denied to COPY to or from an external program
$ ls /tmp/s6_escalade_prouvee -> No such file       <-- pas de sortie hors de la base
$ select rolsuper from pg_roles where rolname='grc_app'; -> f   <-- pas d'élévation
```

**Défense « transaction en lecture seule ».** J'ai vérifié le point qui rend cette défense
*nécessaire* : une fonction **stable qui appelle une auxiliaire volatile** contourne le filtre
de volatilité (PostgreSQL ne vérifie que la fonction courante, pas la pile). Sans borne, elle
écrit :

```
-- appel NON encadré (simulation d'un chemin qui aurait oublié le read only), sous le propriétaire :
NOTICE:    [aux volatile] ALTER TABLE risques no force RLS -> OK
NOTICE:    [aux volatile] INSERT registre -> OK
$ select relforcerowsecurity from pg_class where relname='risques'; -> f   <-- force RLS retiré
```

Et avec le `read only` que **les deux chemins de déploiement** posent désormais, la même greffe
est neutralisée — vérifié sur le **vrai code** `migrate.mjs --verifier`, pas sur du SQL à la main :

```
$ node db/migrate.mjs --verifier
  garde-fous du schéma (f_verifier_schema, point d'appel unique) : aucune anomalie.   code=0
$ select relforcerowsecurity from pg_class where relname='risques'; -> t     <-- force RLS intact
$ select … from migrations_schema where version like '099%';        -> (aucune)  <-- rien de forgé
$ ls /tmp/s6_escalade_prouvee                                       -> No such file
```

Le préalable de l'attaque (créer une fonction dans `public`) reste fermé et **garanti fermé** :
`has_schema_privilege('grc_app'/'grc_lecture','public','CREATE')` = `f`/`f`, aucune appartenance
de rôle (`pg_auth_members` vide pour les deux), pas de `TEMPORARY`, et `f_verifier_privileges()`
fait échouer le déploiement si l'un de ces droits revenait. **Q5-1 est clos.**

### 3.3 Q5-2 (cinquième passage) — la moitié « mise à jour » de la traçabilité · **CLOS**

`f_verifier_tracabilite()` couvre désormais **les deux moitiés**. Preuve que le garde-fou mord,
et que ce qu'il protège est réel :

```
-- (a) le garde-fou voit le retrait, et le désarmement :
$ alter table actions disable trigger trg_actions_maj;
    tracabilite | actions | modification_desarmable
$ drop trigger trg_actions_maj on actions;
    tracabilite | actions | modification_non_tracee

-- (b) sans le déclencheur, le risque P1 se rejoue (deux connexions réelles, grc_app) :
    AVANT v=3 ;  A rows=1 ;  B rows=1 ;  APRES v=3, titre="B ecrase"
    DEFAUT REPRODUIT : sans le déclencheur, B écrase A

-- (c) avec le déclencheur rétabli, le verrouillage optimiste tient :
    A rows=1 ;  B rows=0 ;  APRES v=3 ;  cree_par resté « alice » (falsification refusée par le gel)
```

Balayage indépendant : **32** tables portent `modifie_par`, **32** ont un `trg_*_maj` armé
`always` (le trente-troisième `trg_*_maj` est `trg_journal_audit_interdit_maj`, l'anti-modification
du journal, correctement hors du champ car `journal_audit` n'a pas `modifie_par`). **Q5-2 est
clos** — et c'est le risque projet n° 1 qui était en jeu.

### 3.4 Q5-3 (cinquième passage) — le secret du compte de secours · **CLOS**

`utilisateurs.mot_de_passe_hash` est en **écriture seule** pour les rôles de connexion, la liste
des colonnes rendues étant construite par le catalogue :

```
$ select has_column_privilege('grc_app','utilisateurs','mot_de_passe_hash','SELECT'),
         has_column_privilege('grc_lecture','utilisateurs','mot_de_passe_hash','SELECT');  -> f | f
$ [grc_app]     select mot_de_passe_hash from utilisateurs;  -> ERROR: permission denied for table utilisateurs
$ [grc_lecture] select mot_de_passe_hash from utilisateurs;  -> ERROR: permission denied for table utilisateurs
$ [grc_app]     select identifiant, actif from utilisateurs; -> secours|actif=true    <-- le reste reste lisible
$ [grc_app]     update utilisateurs set mot_de_passe_hash='…' where identifiant='secours'; -> UPDATE 1  <-- l'écriture reste
```

Le garde-fou `f_verifier_privileges()` **fait échouer le déploiement** si le `select` revient
(`grant select on utilisateurs to grc_app` → anomalie `secret_lisible`), et il tient l'autre sens
(une colonne future non rendue → anomalie `colonne_illisible_au_service`, vérifié). **Q5-3 est
clos** — sous la réserve X6-1 ci-dessous, qui concerne la complétude de ce second sens, pas le
secret lui-même.

### 3.5 Les changements du sixième correctif, attaqués un par un

- **`f_verifier_schema` devenue `security definer`** : attaquée sous les trois angles classiques
  d'un `security definer` (détournement du `search_path`, influence de l'appelant, portée du
  `grant`). Chemin figé `pg_catalog, public, pg_temp` ; aucun argument, donc aucune surface
  d'injection ; ne joue que des fonctions du propriétaire. Aucune escalade — voir §5, où je
  relève seulement deux surfaces de défense en profondeur (X6-2, X6-3).
- **`ck_pieces_jointes_chemin`** : le motif `^([0-9a-f]{2}/)*[0-9a-f]{64}$` rejette `../`, le
  chemin absolu, la traversée intercalée, les majuscules, et — subtilité PostgreSQL vérifiée —
  le **saut de ligne final** (`$` ne s'ancre pas avant un `\n` ici, le drapeau `n` n'étant pas
  posé). Traversée de répertoire fermée avant L6.
- **Armement `always` généralisé (88/88)** : `f_verifier_armement()` découvre son périmètre dans
  `pg_trigger` (`tgenabled <> 'A'`), ne récite aucune liste, et mord quand un déclencheur est
  désarmé (vérifié). Zéro déclencheur non interne armé autrement qu'en `always`.

---

## 4. La grille §4 — les seize contrôles

| # | Contrôle | Verdict | Ce que j'ai fait, et ce que j'ai vu |
|---|---|---|---|
| **S1** | Cloisonnement non contournable | ✅ **passé** | `enable` **et** `force row level security` sur **47/47** tables (compté dans `pg_class`). `grc_app` : `super=f`, `bypassrls=f`, `createrole=f`, `createdb=f`, propriétaire de 0 objet de `public`, aucune appartenance de rôle. Démonstration `verifier_cloisonnement.sql` jouée par `grc_app` : **101/101**, Toulouse ne voit ni n'écrit chez Hambourg. **Réserve documentée, non nouvelle** : la lecture de `journal_audit` n'est pas cloisonnée (dérogation assumée de 004 §6, resserrement ferme en L5 ; contrôle C22 la dit à voix haute). |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ **passé** (portée L1) | `f_filiales_lecture/courante/autorisees` et `f_administration_groupe` lisent uniquement `current_setting('grc.*')`, posés par `set local`. Aucune couche HTTP ne touche encore la base (L2). `f_filiale_ecriture()` recoupe les deux réglages **dans la base** (§17.9). Retrait de `cyber-context` côté frontend : L2. |
| **S3** | Journal inaltérable et complet | 🟨 **partiel — complétude sans objet (L5)** | `update`/`delete`/`truncate` refusés par trois déclencheurs `for each statement` armés `always` ; privilèges retirés à `grc_app` et `public` ; table non possédée par le rôle applicatif. `f_journal_audit_verifier()` ne renvoie rien. L'acteur vient de la session (§17.8). La **couverture des événements** est la matière de L5 : rien n'écrit encore au journal. |
| **S4** | Verrouillage optimiste effectif | ✅ **passé pour L1 — mécanisme présent ET vérifié** | Progrès net depuis le cinquième passage, qui marquait « vérification absente ». Le déclencheur de mise à jour incrémente `version` et gèle `cree_le`/`cree_par` ; `f_verifier_tracabilite()` **exige** son existence sur les 32 tables concernées et fait échouer le déploiement sinon (§3.3). Race réelle à deux connexions : A passe (`rows=1`), B reçoit `rows=0`. Le `GRC03` explicite (`where version=$2`) reste du ressort de L2. |
| **S5** | Aucune injection SQL | ✅ **passé** | Tout le SQL dynamique de L1 passe par `format('%I')`/`format('%L')` ou `to_regclass('public.'\|\|quote_ident(...))` ; la liste de colonnes de §15 ter est un `string_agg(quote_ident(...))` interpolé en `%s` (le seul motif correct pour une liste). Les identifiants viennent du catalogue, jamais d'une entrée utilisateur. `install.sh` interpole après `valider_identifiant` et fait passer le SQL par l'entrée standard. |
| **S6** | Droits vérifiés côté serveur | ⬜ **sans objet** | Pas de point d'entrée applicatif au lot L1 (modèle à trois axes = L3). `grc.administration_groupe` reste une **déclaration que la session fait sur elle-même**, pas un privilège (§17.4) — la porte S3 ne doit pas l'hériter comme acquis. |
| **S7** | Le droit d'export distinct de la lecture | ⬜ **sans objet** | Colonnes présentes (`sessions.peut_exporter`, `groupes_ad.accorde_export`) ; décision et journalisation = L3/L5. **Note** : le finding X6-1 touche la lisibilité du rôle d'export `grc_lecture` — à lire avant L7/exports. |
| **S8** | Secrets | 🟨 **partiel** | Aucun secret dans le dépôt (`.env.example` vide, `install.sh` n'engendre ni ne journalise de secret). Le seul secret stocké en base — l'empreinte du compte de secours — est passé en **écriture seule** (Q5-3, §3.4). Réserve X6-1 sur la complétude du garde-fou côté `grc_lecture`. |
| **S9** | Chaîne de contrôle des pièces jointes | ⬜ **sans objet** | Lot L6. Le schéma est prêt ; `ck_pieces_jointes_chemin` ferme déjà la traversée de répertoire (§3.5). |
| **S10** | Sortie et en-têtes | 🟨 **partiel — acquis L0** | `serveur.ts` pose `nosniff`, `no-store`, `bodyLimit` ; le vhost Apache pose HSTS, `X-Frame-Options: DENY`, CSP stricte. Attributs du cookie de session = L3. |
| **S11** | Rythme et verrouillage | ⬜ **sans objet** | Lot L3. Le schéma porte `tentatives_echouees` et `verrouille_jusqu_a`. |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ✅ **passé** (portée L1) | Les refus nomment la **règle**, pas la donnée invisible : `GRC04` cite la filiale déclarée par l'appelant ; `f_coherence_mesure_catalogue()` fond « inconnue » et « locale à une autre filiale » ; PostgreSQL supprime le `DETAIL` d'un conflit d'unicité sur une ligne invisible. Oracle d'existence sur les clés primaires reporté à L2, nommé, pas silencieux. |
| **S13** | Dénis de service applicatifs | 🟨 **partiel** | Pool borné (`poolMax`, `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`, `connectionTimeoutMillis`), `bodyLimit` posé. Le chemin de vérification du schéma est désormais **borné en temps** (`set local statement_timeout='60s'` dans `migrate.mjs` et `install.sh` — Q5-6 fermé). Pagination des listes = L2. |
| **S14** | Intégrité des opérations composites | ✅ **passé** (portée L1) | Migrations en transaction, `ON_ERROR_STOP=1`, empreinte du fichier appliqué enregistrée. Cascades du §8 déclaratives donc atomiques. La démonstration prouve le composite « délier puis supprimer une mesure dans la même transaction ». API et import = L2/L7. |
| **S15** | Dépendances | ✅ **passé** | `npm audit` : **0 vulnérabilité**. Quatre dépendances (`fastify`, `pg`, TypeScript, types), toutes justifiées ; `install.sh` installe par `npm ci` (verrouillage figé). |
| **S16** | **Les garde-fous sont branchés** | ✅ **passé — et le contrat d'exécution est fermé** | Branchés et vérifiés : `f_verifier_schema()` appelée en fin des quatre migrations, par `migrate.mjs` et `install.sh`, fait échouer ces chemins, un contrôle en erreur est traité comme un échec, le zéro absolu est épinglé. Les sept contrôles sont **découverts** dans le catalogue, non récités ; un huitième greffé qui respecte la convention est joué sans qu'aucun fichier change. Le contrat d'exécution de code que cette découverte ouvrait (Q5-1) est fermé par les trois défenses de §3.2. Résiduels de défense en profondeur : X6-2, X6-3. |

**Récapitulatif** : **7 passés, 5 partiels (portée L1), 4 sans objet, 0 en échec.** Deux
contrôles gagnent un cran depuis le cinquième passage — S4 (le verrouillage optimiste est
désormais vérifié par un garde-fou, plus seulement présent) et S16 (le contrat d'exécution est
fermé).

---

## 5. Constats neufs

Aucun n'est bloquant, aucun n'est majeur, aucun n'est une brèche de cloisonnement. Je les
classe honnêtement pour ce qu'ils sont.

### 🟡 X6-1 — MINEUR · Le second sens du garde-fou de privilèges ne couvre que `grc_app`, pas le rôle d'export `grc_lecture`

Le commentaire de §15 ter affirme que le garde-fou « vérifie **les deux sens** — le secret reste
illisible, et **tout le reste reste lisible** ». Le premier sens (secret illisible) est
effectivement vérifié pour **tous** les rôles de connexion (`f_verifier_privileges()` boucle sur
tout `rolcanlogin` non superutilisateur). Le second (« tout le reste reste lisible ») n'est
vérifié que pour **`grc_app`** :

```
$ alter table utilisateurs add column zz_export_utile text;
$ grant select (zz_export_utile) on utilisateurs to grc_app;      -- UNIQUEMENT grc_app, comme le conseille le message du garde-fou
$ select has_column_privilege('grc_app','utilisateurs','zz_export_utile','SELECT'),
         has_column_privilege('grc_lecture','utilisateurs','zz_export_utile','SELECT');  -> t | f
$ select … from f_verifier_schema();  -> (RIEN)         <-- aucune anomalie, alors que grc_lecture est aveugle
```

**Scénario.** `utilisateurs` est la seule table à privilèges de colonne. Le jour où L3 lui ajoute
une colonne d'exploitation (par exemple un indicateur de synchro AD) et où l'auteur suit **le
message du garde-fou lui-même**, qui ne parle que de « le compte du service » (`grc_app`), il
regrantera `grc_app` seul. `grc_lecture` — le **rôle d'export et de supervision**, celui du
contrôle S7 — reste aveugle à cette colonne, et **rien ne le signale**. Un export ou une requête
de supervision `select *` échouera alors en `permission denied` (bruyant), mais une requête à
colonnes nommées l'omettra en silence. Ce n'est pas une fuite ni une brèche : c'est une
**incomplétude d'exploitation** sur le rôle d'export, sous un garde-fou dont le commentaire
promet la symétrie.

**Correction** (quelques lignes, à prendre avant L7/exports) : le balayage
`colonne_illisible_au_service` boucle sur `['grc_app', 'grc_lecture']` au lieu de `grc_app` seul ;
et le message d'anomalie nomme les deux rôles. C'est exactement le motif du §19.5 (« un correctif
qui ferme un sens doit vérifier l'autre pour les deux rôles, faute de quoi il crée un défaut
invisible sur une colonne future »), appliqué à un rôle de plus.

### 🟡 X6-2 — MINEUR (défense en profondeur) · `f_verifier_schema()` est exécutable par `grc_lecture`, rôle de lecture seule, sur une fonction `security definer` du propriétaire

Le droit d'exécution du point d'appel est retiré à `PUBLIC` puis accordé nommément à `grc_app`
**et** `grc_lecture`. Pour `grc_app`, l'usage est réel (il joue la démonstration de recette,
contrôle C84). Pour `grc_lecture`, le commentaire invoque « le compte de supervision peut vouloir
la rejouer » — un confort, pas une nécessité.

Or accorder à un rôle de **lecture seule** l'exécution d'une fonction `security definer` du
propriétaire, dont le corps **découvre et exécute** d'autres fonctions, lui ouvre un canal — même
étroitement borné — vers une exécution en contexte propriétaire. Sur un schéma sain, l'ensemble
exécuté est figé (les sept garde-fous, tous en lecture de catalogue), donc rien de sensible ne
fuit et rien ne s'écrit. L'exploitation resterait subordonnée à la plantation d'une fonction, qui
exige `grc_proprietaire` — `grc_lecture` n'est donc jamais le maillon faible. **C'est pourquoi
c'est un mineur de défense en profondeur, pas un défaut** : le moindre privilège voudrait qu'un
rôle de lecture n'obtienne pas ce `grant` sans besoin démontré.

**Correction possible** : ne pas accorder l'exécution à `grc_lecture` (la supervision peut lire le
verdict par `verifier_cloisonnement.sql`, jouée sous `grc_app`), ou documenter précisément
pourquoi ce rôle en a besoin.

### 🟡 X6-3 — MINEUR (défense en profondeur) · Le point d'appel de recette n'est pas encadré par la transaction en lecture seule qui protège les chemins de déploiement

Les deux chemins de **déploiement** (`migrate.mjs`, `install.sh`) encadrent leur appel à
`f_verifier_schema()` d'une transaction `read only` avec délai de garde — c'est le correctif de
Q5-1, et il tient (§3.2). Le contrôle C84 de `verifier_cloisonnement.sql`, joué sous `grc_app`,
appelle le même point d'appel **sans** cet encadrement :

```
-- db/verifier_cloisonnement.sql, contrôle C84 :
select … from f_verifier_schema() v;      -- pas de « begin; set transaction read only »
```

Une greffe stable-appelant-volatile présente au moment de la recette écrirait donc **en contexte
propriétaire** (la fonction est `security definer`) lorsque `grc_app` joue la démonstration —
`COPY … TO PROGRAM` resterait refusé (`grc_app` n'est pas superutilisateur), mais un `alter table`
ou un `insert` réussirait. La plantation exigeant `grc_proprietaire`, **aucune frontière de
privilège n'est franchie** : celui qui peut planter peut déjà tout écrire. Le constat porte sur la
**cohérence de la défense en profondeur** : la même précaution qui protège le déploiement gagnerait
à protéger la recette, qui est le geste montré à l'auditeur.

**Correction** : encadrer l'appel C84 d'un `begin; set transaction read only; … ; rollback;`,
comme les deux chemins de déploiement.

### 🟡 X6-4 — MINEUR (documentation) · `CONVENTIONS §17.7` dit que `sessions` « porte un `filiale_id` nullable » — la table n'a pas de colonne `filiale_id`

Le §17.7 range trois tables sous l'en-tête « Trois tables portent un `filiale_id` nullable **sans**
être des tables métier mixtes » : `journal_audit`, `groupes_ad`, `sessions`. Les deux premières
portent bien un `filiale_id` nullable. `sessions`, elle, **n'a pas de colonne `filiale_id`** : sa
colonne de portée est `filiale_active_id` (nullable). Vérifié dans `information_schema.columns`.

Conséquence : nulle sur le code. Le garde-fou `f_verifier_portee_figee()` découvre les tables
mixtes par `f_tables_mixtes()`, qui balaie la colonne **`filiale_id`** ; `sessions` n'y apparaît
donc jamais et n'a pas besoin d'être dans la liste d'exemptions (`journal_audit`, `groupes_ad`),
qui est **juste**. C'est la lettre du §17.7 qui est inexacte, pas le schéma. Mais la porte a pour
consigne (§4, retour d'expérience) de vérifier que « ce que les normes disent est vrai » : le
document normatif désigne une colonne qui n'existe pas.

**Correction** : dans le §17.7, décrire `sessions` par sa vraie colonne (`filiale_active_id`), ou
la sortir de ce tableau qui parle littéralement de `filiale_id`.

### 🟡 X6-5 — MINEUR (documentation) · Les décisions du cinquième passage ne sont fixées nulle part dans le corpus normatif

`CONVENTIONS.md` s'arrête au **§19** (« décisions issues du quatrième passage »). Les trois
arbitrages structurants du cinquième correctif — la découverte des garde-fous restreinte à quatre
propriétés et jouée en `security definer`/`read only`, la traçabilité vérifiée **à la modification
comme à l'insertion**, le secret d'authentification en **écriture seule par privilège de colonne**
— ne vivent que dans les **commentaires du code** (abondants et justes, en particulier §15 ter et
§15 quater de `001_socle.sql`). Aucun **§20** ne les porte.

La définition de « terminé » (`PLAN_EXECUTION` §5.4) exige « `CONVENTIONS.md` respecté sans
exception » ; et la leçon inscrite au §7 du plan est que « le document normatif s'est trompé quatre
fois ». Laisser les décisions du cinquième passage hors du corpus normatif, c'est risquer qu'un
agent de la vague 2 réintroduise une liste écrite à la main, ou rende un secret lisible, sans lire
un `CONVENTIONS.md` qui n'en parle pas. Ce n'est pas un défaut de sécurité — les propriétés sont
tenues par le code et ses garde-fous — mais une dette de traçabilité normative.

**Correction** (rôle DOC, à la fermeture de la porte) : ajouter un §20 « Décisions issues des
cinquième et sixième passages », résumant les règles que le code applique déjà.

### 🟡 X6-6 — MINEUR (documentation) · `backend/README.md` annonce « 306 tests », le banc en compte 325

Le sixième correctif a ajouté des tests (notamment ~630 lignes à `rls.test.mjs` pour Q5-1/2/3)
sans mettre à jour `README.md`, qui dit encore « **306 tests** » (ligne 337) et « **229 sur la
base** » (§8). Le décompte réel, mesuré par moi : **325** au total, **248 sur la base**, **77** en
reprise. La méthode du chantier veut que la documentation soit remise en phase **à la fermeture de
la porte** (§6), ce qui n'est pas encore fait : la péremption est donc *attendue* à ce stade, mais
je la signale pour qu'elle soit reprise au commit de clôture, avec le décompte exact ci-dessus.

---

## 6. L'état du banc d'essai — mord-il, est-il stable ?

**Il mord.** J'ai retiré, désarmé et greffé, et chaque fois le dispositif l'a vu : un déclencheur
de mise à jour retiré → `modification_non_tracee` ; un déclencheur désarmé → `modification_desarmable`
ou `declencheur_desarmable` ; un `select` de secret rouvert → `secret_lisible` ; une greffe
volatile → `controle_non_conforme` non jouée ; une colonne aveugle au service → `colonne_illisible_au_service`.
Le point d'appel `f_verifier_schema()` fait sortir `migrate.mjs` et `install.sh` en code non nul
sur la moindre anomalie.

**Il est stable, et il échoue *fermé*.** J'ai instruit l'observation transmise (`tests 325 · pass
318 · fail 0`, sept tests ni passés ni échoués, vu une fois sur une dizaine).

- **La course sur les noms de bases est bien fermée.** Le jeton de nommage combine
  `process.pid` (base 36), un compteur par processus, et **4 octets aléatoires**
  (`jetonUnique()`, `test/aide/base.mjs`) : deux exécutions concurrentes visent des bases
  distinctes par construction. Aucun test ne mute les rôles partagés (`grc_proprietaire`/`grc_app`/
  `grc_lecture`) — aucun `alter role`/`create role` dans `test/**` —, et chaque fichier ne
  supprime que **sa** base par `drop database … with (force)`.
- **Onze exécutions, aucune instabilité.** Une exécution en série (325/325), **trois rondes de
  deux suites concurrentes** (6 exécutions) et **une ronde de quatre suites concurrentes** : les
  onze rendent `tests 325 · pass 325 · fail 0 · cancelled 0 · skipped 0`, code 0. Je n'ai pas
  reproduit la signature observée.
- **Surtout : aucune voie de défaillance ne peut la masquer.** J'ai vérifié empiriquement le
  comportement de `node --test` :
  - un `before` qui échoue (le scénario « too many clients » sous forte parallélisation) →
    ses sous-tests sont comptés **`fail`**, code de sortie **1** ;
  - des sous-tests **annulés** (parent qui n'attend pas ses enfants) → le parent est **`fail`**,
    code de sortie **1** ;
  - et le banc **ne contient aucun `skip`/`todo`** (grep exhaustif sur `test/**`), le seul état
    « ni passé ni échoué » qui laisse un code 0.

  Toute défaillance réelle rend donc `npm test` non nul. La signature `pass 318 · fail 0`
  observée une fois s'explique le plus vraisemblablement par un **résumé partiel** imprimé lors
  d'une exécution interrompue ou étranglée par une pression transitoire (CPU/connexions à
  `nproc=4`, `max_connections=100`), et non par un échec avalé. Je ne peux pas l'exclure
  totalement — l'unicité de l'observation l'interdit — mais le banc **fait échouer** partout où
  j'ai su le mettre en défaut. Recommandation prudente, sans caractère bloquant : fixer
  `--test-concurrency` sous le nombre de fichiers, ou borner explicitement les connexions par
  fichier, si l'on veut ôter jusqu'à la pression transitoire.

---

## 7. Ce qui est reporté, à qui, et pour quand

| Constat | Nature | Rôle | Échéance |
|---|---|---|---|
| **X6-1** | Garde-fou de privilèges à étendre à `grc_lecture` | SCHEMA (004/001) | Avant **L7** (import/exports), au fil de la vague 2 |
| **X6-2** | `grant execute` de `grc_lecture` à retirer ou justifier | SCHEMA (001) | Au fil de la vague 2 |
| **X6-3** | Encadrer l'appel C84 de la recette en `read only` | OUTILLAGE (`verifier_cloisonnement.sql`) | Au fil de la vague 2 |
| **X6-4** | `§17.7` : `sessions` porte `filiale_active_id`, pas `filiale_id` | orchestrateur (`CONVENTIONS.md`) | À la clôture de la porte |
| **X6-5** | Ajouter un `§20` normatif (5ᵉ/6ᵉ passages) | orchestrateur (`CONVENTIONS.md`) | À la clôture de la porte |
| **X6-6** | `README.md` : 325 tests (248 base, 77 reprise) | DOC | À la clôture de la porte |

Ces six mineurs **ne conditionnent pas** l'ouverture de la vague 2 : aucun n'est une brèche,
aucun ne demande de réparer une ligne de donnée existante, et le seul qui touche un chemin
sensible (X6-1, le rôle d'export) ne pèse qu'à partir de L7. Les trois majeurs du cinquième
passage, eux, **sont fermés** et n'ont plus à conditionner quoi que ce soit.

---

## 8. Ce que la grille ne couvre pas

- **Le test d'intrusion de L15.** La grille éprouve le cloisonnement et les garde-fous ; elle ne
  remplace pas une revue offensive de bout en bout sur la VM cible.
- **Le propriétaire de la base et `root` sur la VM.** Assumés hors modèle de menace
  (`CONVENTIONS` §12). Q5-1 était l'exception : il faisait *franchir* au propriétaire une
  frontière que le modèle ne lui accorde pas (superutilisateur du cluster, shell `postgres`) —
  cette frontière est refermée (§3.2). Ce qui reste admis, c'est que le propriétaire écrive dans
  **sa** base : c'est le périmètre exact du §12.
- **Le sens des politiques par lecture de texte.** `f_verifier_couverture_rls()` détecte une
  politique littéralement `true` (§17.5) ; une politique non cloisonnante mais non triviale lui
  échappe. Ce sont les **tests de comportement** et `verifier_cloisonnement.sql` qui mordent sur
  le sens — l'un ne remplace pas l'autre.
- **La complétude probante des colonnes de secret.** « Cette colonne est-elle un secret ? » reste
  un jugement humain : le garde-fou vérifie une liste écrite (`utilisateurs.mot_de_passe_hash`),
  et qu'elle reste juste, mais il ne devinera pas qu'une colonne future en est un.

---

## 9. Ce que je n'ai pas pu vérifier

- **L'installation Debian 13 complète**, Apache, ClamAV, l'Active Directory et le relais SMTP :
  aucune de ces briques n'existe sur la machine de développement. La chaîne d'escalade de Q5-1
  passe par `su postgres` dans `install.sh` ; je l'ai reproduite en **local** avec un
  superutilisateur PostgreSQL réel (le compte `postgres` du cluster), ce qui éprouve le mécanisme
  de base, mais pas l'environnement de production durci.
- **PostgreSQL 17** (cible) : tous mes essais sont sur **16.13**. Les propriétés que j'ai
  éprouvées (refus d'écriture en fonction non volatile `SQLSTATE 0A000`, ancrage `$` non sensible
  au saut de ligne par défaut, refus de `COPY … TO PROGRAM` hors du rôle
  `pg_execute_server_program`, `has_schema_privilege`) sont stables de longue date, mais un
  passage sur 17 reste dû avant la mise en service.
- **La signature `pass 318` du banc**, vue une seule fois et non reproduite en onze exécutions :
  je conclus qu'elle ne masque pas d'échec (le banc échoue fermé, §6), sans pouvoir en désigner
  la cause exacte avec certitude.
- **La validation formelle du découpage Groupe/Filiale par le RSSI groupe** (risque P5) : hors du
  champ de la porte S1, mais toujours absente du dépôt, et à confirmer avant la mise en service
  pilote (rappel du `CLAUDE.md` §8).

---

## 10. Ce qui mérite d'être retenu de ce passage

Cinq passages ont vérifié une règle du plan : *chaque passage trouve ce que le précédent a
manqué, sur un chemin que personne ne regardait.* Le sixième la nuance : **quand un correctif est
écrit en pesant ce qu'il rend impossible autant que ce qu'il ferme, la série de défauts en
cascade s'arrête.** Le cinquième correctif referme Q5-1 par *trois défenses indépendantes* — parce
qu'aucune ne suffit seule, et qu'il l'a dit —, couvre *les deux moitiés* de la traçabilité, et
regarde enfin *les colonnes* et non plus seulement les lignes. Je n'ai trouvé, au bout, qu'une
asymétrie de garde-fou et des inexactitudes de plume.

Le seul enseignement que j'ajoute : **un commentaire de code qui promet plus que le code ne tient
est un futur constat.** X6-1 (« les deux sens » qui n'en couvre qu'un et demi) et X6-4 (« un
`filiale_id` » qui n'existe pas) sont, à petite échelle, le même motif que « le document normatif
s'est trompé quatre fois ». Ce que le code affirme de lui-même doit être vrai, au mot près — c'est
le prix d'un dispositif dont la vertu est d'être cru sur parole en audit.

**Porte S1 : franchie.** La vague 2 (lot L2, API et bascule de la persistance, risque projet P1)
peut s'ouvrir.
