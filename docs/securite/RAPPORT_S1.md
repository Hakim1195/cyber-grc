# Rapport de la porte de sécurité S1 — clôture de la vague 1 (lot L1)

> Revue adversariale indépendante, en lecture seule, de tout ce qui a été livré pendant la
> vague 1 (schéma métier, cloisonnement, outillage, reprise, déploiement), plus le socle L0
> déjà en place. Grille appliquée : [`docs/PLAN_EXECUTION.md`](../PLAN_EXECUTION.md) §4, les
> quinze contrôles, plus la définition de « terminé » du §5.
>
> **L'auteur de ce rapport n'a écrit aucune ligne du code examiné** et n'en a corrigé aucune.
> Tous les essais ont été rejoués sur une base dédiée (`grc_audit`, PostgreSQL 16.13), montée
> depuis zéro à partir des quatre migrations. Les scripts d'attaque vivent hors du dépôt.
>
> Date : 31 août 2026 · Périmètre : `backend/db/**`, `backend/src/**`, `backend/test/**`,
> `backend/deploy/**`.

---

## 1. Verdict

> ## Porte REFUSÉE
>
> Un constat bloquant : **sept clés étrangères directes traversent la frontière de filiale**,
> ce qui permet à la filiale A d'écrire une référence vers une ligne de la filiale B, puis à une
> suppression ordinaire faite par B de **détruire et de modifier des lignes de A** — cascade
> d'intégrité référentielle qui contourne la Row Level Security par construction. Le motif de
> correction (clé étrangère composite `(id, filiale_id)`) est **déjà employé trois fois dans les
> mêmes migrations** : c'est une omission, pas une impasse. Ni le banc d'essai ni
> `verifier_cloisonnement.sql` ne couvrent ce chemin.

Ce verdict ne doit pas masquer le reste. Sur les quelque 3 000 lignes de SQL et 2 000 lignes de
TypeScript examinées, le niveau est élevé et inhabituellement honnête : les dérogations sont
écrites à l'endroit où elles sont prises, les garde-fous mordent réellement, le journal d'audit
résiste à toutes les attaques que j'ai pu lui porter par le rôle applicatif, et le durcissement
de déploiement est de bonne facture. Le correctif attendu est **étroit et mécanique** : cinq
contraintes d'unicité et sept clés étrangères à recomposer, plus les cas d'essai
correspondants. La grille sera rejouée intégralement après correction, conformément au §1 du
plan d'exécution.

**Décompte des constats** : 1 bloquant · 3 majeurs · 6 mineurs · 6 observations.

---

## 2. La grille §4 — les quinze contrôles

| # | Contrôle | Statut |
|---|---|---|
| S1 | Cloisonnement par filiale non contournable | **échec** |
| S2 | Le périmètre ne vient jamais du navigateur | passé |
| S3 | Journal d'audit inaltérable et complet | réserve |
| S4 | Verrouillage optimiste effectif | partiel (moitié base : passé ; moitié API : sans objet) |
| S5 | Aucune injection SQL | passé |
| S6 | Droits vérifiés côté serveur à chaque requête | sans objet (L3) — mais voir constat M-2 |
| S7 | Le droit d'export est distinct de la lecture | sans objet (L3) |
| S8 | Secrets | passé |
| S9 | Chaîne de contrôle des pièces jointes | sans objet (L6) |
| S10 | Sortie et en-têtes | partiel (frontal posé ; pas de session à contrôler) |
| S11 | Limitation du rythme et verrouillage | sans objet (L3) |
| S12 | Les erreurs ne renseignent pas l'attaquant | réserve |
| S13 | Dénis de service applicatifs | réserve |
| S14 | Intégrité des opérations composites | passé |
| S15 | Dépendances | passé |

---

### S1 — Cloisonnement par filiale non contournable · ÉCHEC

**Mise en place.** Base neuve `grc_audit`, les quatre migrations appliquées d'affilée avec
`ON_ERROR_STOP=1` :

```
=== 001_socle ===              exit=0
=== 002_metier_noyau ===       exit=0
=== 003_metier_operations ===  exit=0
=== 004_rls ===
NOTICE:  grc_app : ni SUPERUSER, ni BYPASSRLS, propriétaire d'aucun objet — conforme.
NOTICE:  Famille 1 (niveau filiale) : 24 tables, 96 politiques.
NOTICE:  Famille 2 (mixte) : 5 tables, 20 politiques.
NOTICE:  Famille 4 (Groupe et socle) : 11 tables + journal_audit.
NOTICE:  Couverture RLS vérifiée : aucune anomalie, 188 politiques sur 47 tables.
exit=0
```

Deux filiales semées (`FIL-A` Toulouse, `FIL-B` Allemagne) avec risques, exigences, actifs,
clients, incidents, évaluations et scénarios PRA de chaque côté.

#### Ce qui tient

**Lecture directe** — session `grc_app` sur `FIL-A`, périmètre `FIL-A` :

```
        t         | count            select * from risques where id='RISK-B1';
------------------+-------           (0 rows)
 risques          |     1
 exigences        |     1
 actifs           |     1
 clients          |     1
 risque_exigences |     1
```

**Jointure depuis une table non cloisonnée vers une table cloisonnée** — `filiales` est de
niveau Groupe et sa politique vaut `true` ; une jointure vers `risques` ne fait pas fuiter :

```
  id   |  raison_sociale   |          nom
-------+-------------------+------------------------
 FIL-A | Filiale Toulouse  | Risque secret Toulouse
 FIL-B | Filiale Allemagne |                          <-- RLS appliquée du côté joint
```

**Détournement des politiques par masquage de table (`pg_temp`)** — je peux masquer `risques`
et `exigences` par des tables temporaires (voir M-1), et les politiques n'en sont pas affectées :
les expressions de politique sont stockées avec des OID résolus, et `pg_temp` n'est jamais
consulté pour les *fonctions*. Une `pg_temp.f_filiales_lecture()` fabriquée est ignorée :

```
### R1 — masquer risques/exigences : les POLITIQUES RLS sont-elles detournables ?
ERROR:  new row violates row-level security policy for table "risque_exigences"
### R2 — masquer les fonctions de contexte ?
   id    |          nom              <-- toujours la seule ligne de FIL-A
 RISK-A1 | Risque secret Toulouse
```

**Rôles** — `grc_app` : ni `SUPERUSER`, ni `BYPASSRLS`, ni `CREATEDB`, ni `CREATEROLE`,
propriétaire d'aucun objet, sans droit `CREATE` sur `public`. Les 47 tables portent `enable`
**et** `force row level security` ; `f_verifier_couverture_rls()` ne renvoie aucune ligne.
La suppression d'une filiale est bien bloquée en `restrict`.

**Liaisons sans `filiale_id`** — les six sont défendues à l'insertion, pas seulement à la
lecture, comme annoncé :

```
insert into risque_exigences (risque_id, exigence_id) values ('RISK-A1','EX-B1');
ERROR:  new row violates row-level security policy for table "risque_exigences"
```

Le script `verifier_cloisonnement.sql`, joué sous `grc_app` sur une base neuve, passe ses
28 contrôles : `28 réussis / 0 échoué`.

#### Ce qui ne tient pas — voir B-1

Sept clés étrangères directes acceptent une cible d'une autre filiale (`INSERT 0 1` sept fois),
puis la suppression faite par B détruit et modifie les lignes de A. Détail, preuve et correction
en §3.

---

### S2 — Le périmètre ne vient jamais du navigateur · passé

**Chemins de code.** Un seul endroit du serveur alimente les réglages de session, et il le fait
par le protocole étendu :

```
$ grep -rn "set_config" backend/src backend/db/migrate.mjs --include=*.ts --include=*.mjs
backend/src/db/pool.ts:232:    `select set_config('grc.utilisateur', $1, true),
backend/src/db/pool.ts:233:            set_config('grc.filiale_id',  $2, true),
backend/src/db/pool.ts:234:            set_config('grc.filiales',    $3, true)`,
```

Aucun autre fichier ne mentionne `grc.utilisateur`, `grc.filiale_id`, `grc.filiales` ni
`grc.administration_groupe`. `avecTransaction` exige un `PerimetreSession` en paramètre
obligatoire, refuse un périmètre vide, et refuse une filiale active hors du périmètre lisible
(`pool.ts:247-269`). Les réglages sont locaux à la transaction et meurent au `commit` — vérifié
en base.

**Le drapeau `grc.administration_groupe`, passé au crible.** C'est le seul réglage neuf, et
c'est celui qui pouvait tout casser. Trois vérifications :

1. **Il n'est alimenté par aucun chemin de code** — `appliquerPerimetre` ne le pose pas.
   Conséquence fonctionnelle relevée en O-3 : aucune ligne de portée Groupe des cinq tables
   mixtes n'est aujourd'hui écrivable par l'application.
2. **Il n'élargit jamais la lecture** — vérifié en base, et pas seulement en lisant le code :

```
### G3 — le drapeau elargit-il la LECTURE ?
select set_config('grc.filiales','FIL-A',true), set_config('grc.administration_groupe','oui',true);
   id    |          nom             <-- toujours la seule ligne de FIL-A
 RISK-A1 | Risque secret Toulouse
```

3. **Le garde-fou qui l'interdit en lecture est réel** : `f_verifier_couverture_rls()`
   (`004_rls.sql:414`) refuse la migration si une politique de lecture mentionne
   `f_administration_groupe`. Vérifié : aucune ne le fait.

En revanche le drapeau ouvre plus d'écriture que son commentaire ne l'annonce — voir M-3.

**Adresse du client.** `deploy/apache/cyber-grc.conf:111-116` efface `X-Forwarded-For`,
`X-Forwarded-Host`, `X-Forwarded-Server`, `X-Real-IP` et `Forwarded` **avant** que mod_proxy
n'ajoute la vraie adresse du pair. Une adresse forgée par le navigateur ne peut donc pas
atteindre le journal d'audit ni un futur compteur de rythme. C'est le bon motif.

**Réserve de conception** relevée en m-2 : le périmètre transite en chaîne jointe par virgules
alors que le domaine `id_metier` admet la virgule.

---

### S3 — Journal d'audit inaltérable et complet · réserve

**Les quatre couches, éprouvées une par une.**

Couche 1 — privilèges, sous `grc_app` :

```
update journal_audit set resume='efface' where numero=1;       ERROR: permission denied
update journal_audit set resume='efface' where numero=999999;  ERROR: permission denied   <-- même sans ligne
delete from journal_audit where numero=1;                      ERROR: permission denied
truncate journal_audit;                                        ERROR: permission denied
set local session_replication_role = replica;                  ERROR: permission denied to set parameter
```

Couche 2 — déclencheurs, sous `grc_proprietaire` (qui, lui, a le verbe SQL) :

```
ERROR:  Table journal_audit en ajout seul : opération UPDATE refusée.     (SQLSTATE GRC01)
ERROR:  Table journal_audit en ajout seul : opération DELETE refusée.
ERROR:  Table journal_audit en ajout seul : opération TRUNCATE refusée.
```

Couche 3 — `enable always` : `session_replication_role` est refusé aux deux rôles non
superutilisateurs, donc le contournement classique est fermé en amont.

Couche 4 — `grc_app` ne possède aucun objet, vérifié par requête sur `pg_class` : il ne peut
pas exécuter `alter table … disable trigger`. Le propriétaire, lui, le peut — limite assumée,
que j'ai reproduite pour la constater (`alter table journal_audit disable trigger … ; DELETE 1`).

**Forge d'entrée.** Le client fournit `numero=1`, `horodatage='1999-01-01'`, `empreinte` et
`empreinte_precedente` : tout est écrasé par le déclencheur. Entrée réellement écrite :
`numero=5`, horodatage courant, empreinte précédente réelle. **Passé.**

**Cloisonnement de l'écriture.** Une session `FIL-A` ne peut pas fabriquer de preuve chez B :

```
insert into journal_audit (filiale_id, …) values ('FIL-B','alice','creation','FAUSSE PREUVE chez B');
ERROR:  new row violates row-level security policy for table "journal_audit"
```

**Chaînage.** `f_journal_audit_verifier()` détecte les trois falsifications annoncées — vérifié
par mutation (§4) : retirer le déclencheur anti-modification fait tomber sept tests, dont
« falsification naïve → `empreinte_invalide` » et « falsification soignée → `chainage_rompu`
sur la suivante ».

**Ce qui vaut la réserve.**

**1. La lecture n'est pas cloisonnée, et l'exposition est totale pour cette table.** La
dérogation est documentée (`004_rls.sql:1026-1125`) et son argument technique est **exact** :
`f_journal_audit_chainage()` numérote à partir de `max(numero)` lu sous RLS, et
`f_journal_audit_verifier()` parcourt la chaîne entière ; cloisonner la lecture ferait échouer
toute écriture au journal et rendrait la vérification ininterprétable. Je confirme l'argument.
Mais l'exposition réelle mérite d'être chiffrée, parce qu'elle n'est pas « quelques
métadonnées » :

```
### J1 — lecture du journal de B depuis une session A
 numero | filiale_id |  action  |          resume           |           valeurs_apres
--------+------------+----------+---------------------------+-----------------------------------
      1 | FIL-A      | creation | Creation risque Toulouse  | {"secret": "A"}
      3 | FIL-B      | creation | Creation risque Allemagne | {"secret": "tres confidentiel B"}
```

`valeurs_avant` / `valeurs_apres` contiennent, par conception (`PLAN_SERVEUR` §1.7), l'état
complet de l'entité modifiée. **Le journal est donc une copie intégrale, non cloisonnée, de
toutes les données de toutes les filiales.** Le seul rempart est le contrôle applicatif du
domaine « journal » — qui n'existe pas encore. La correction proposée par l'auteur lui-même
(rendre les deux fonctions de chaînage `security definer` appartenant à `grc_proprietaire`, puis
resserrer la politique) est la bonne ; elle doit être **inscrite comme livrable ferme de L5**,
pas comme piste.

**2. L'écriture du journal suit le périmètre de LECTURE, pas la filiale active** — seule
politique d'écriture du schéma dans ce cas :

```
 journal_audit | pol_journal_audit_ajout | ((filiale_id IS NULL) OR (filiale_id = ANY (f_filiales_autorisees())))
```

Un RSSI Groupe lisant vingt filiales peut donc écrire une entrée attribuée à n'importe laquelle
des vingt, et non à la seule filiale sélectionnée — écart au `CONVENTIONS` §11. Voir m-4.

**3. Le chaînage est sabotable par le rôle applicatif sur toute base où `TEMP` est accordé** —
voir M-1. C'est ce qui empêche de marquer S3 « passé ».

**Complétude (couverture des événements du §1.7)** : la contrainte `ck_journal_audit_action`
liste les 20 actions attendues, `export` et `import` compris. Rien ne les émet encore (L5) : la
complétude est donc **sans objet à ce stade**, et devra être établie à la porte S3.

---

### S4 — Verrouillage optimiste effectif · partiel

La moitié « base » du contrôle est livrée et **passe**. La moitié « API » (traduction du
0 ligne en `GRC03`) est le lot L2 : **sans objet**.

```
### V1 — le client peut-il fixer version lui-meme ?
select id, version from risques where id='RISK-A1';           -->  version 1
update risques set nom='v2', version=999 where id='RISK-A1';  -->  UPDATE 1
select id, version, modifie_par …                             -->  version 2, modifie_par alice
                                                                   (999 ignoré, pas 999)
-- cree_le / cree_par reinscriptibles ?
update risques set cree_par='usurpateur', cree_le='1999-01-01' …
select id, cree_par, cree_le::date, version …                 -->  alice | 2026-08-31 | 3  (gelés)

### V2 — deux ecritures concurrentes sur la MEME version
update risques set nom='ecriture 1' where id='RISK-A1' and version = 3;  -->  UPDATE 1
update risques set nom='ecriture 2' where id='RISK-A1' and version = 3;  -->  UPDATE 0   <-- conflit
```

**À signaler pour la porte S2** : `f_maj_tracabilite()` incrémente `version` quelle que soit
l'origine de l'`update`, y compris une action d'intégrité référentielle. J'ai vérifié qu'une
suppression faite par la filiale B incrémente la `version` d'une ligne de la filiale A et y
inscrit `modifie_par = 'bruno'` (voir B-1) : un utilisateur de A recevrait donc un `GRC03`
« modifié entre-temps » sans que personne de A n'ait rien modifié.

---

### S5 — Aucune injection SQL · passé

**`src/`** — aucune requête construite par concaténation :

```
$ grep -rn "query(\`\|query('.*\${\|query(\".*\${" backend/src --include=*.ts
(aucun résultat)
```

**Migrations** — 40 sites de SQL dynamique (7 dans `001`, 33 dans `004`). Tous interpolent par
`%I` (identifiant échappé) et `%L` (littéral échappé), et **toutes les valeurs viennent de
tableaux constants écrits en dur dans le même bloc `do $$`** (`004_rls.sql:423`, `431`, `579`,
`650`, `1052`) ou de `current_user`. Les prédicats injectés en `%s` sont eux-mêmes des
constantes `v_lecture` / `v_ecriture` déclarées cinq lignes plus haut. Aucune entrée utilisateur
n'atteint un `execute`.

**`migrate.mjs`** — les deux seules requêtes portant des données sont paramétrées
(`migrate.mjs:432`, `450`) ; le contenu de la migration est envoyé tel quel, ce qui est le
propos de l'outil. `BASE_NOM` est validé par liste blanche (`/^[A-Za-z_][A-Za-z0-9_$]*$/`,
ligne 213) avant tout usage.

**`preparer_base_dev.sh`** — les identifiants interpolés (`$BASE`, les trois noms de rôle) sont
soit constants, soit validés par la même expression. Le mot de passe est échappé par doublement
du guillemet simple (`${MOT_DE_PASSE//\'/\'\'}`) et passe par l'entrée standard, jamais par
`argv`. `$PGSUPERUTILISATEUR` est un **argument** de `su`, pas un morceau de la chaîne shell :
pas d'injection de commande.

**`install.sh`** — même discipline, avec une fonction dédiée `litteral()` (ligne 224) et
`valider_identifiant()` (ligne 228) ; le commit `95e358a` a par ailleurs supprimé
l'interprétation du fichier de configuration par le shell, où un `$(commande)` s'exécutait en
root. C'est un correctif de sécurité réel, apporté pendant la vague.

---

### S6 — Droits vérifiés côté serveur · sans objet (L3)

Aucun point d'entrée métier n'existe : le serveur n'expose que `/api/sante`. Le contrôle sera
jouable à la porte S3.

**Mais la vague 1 fige déjà le substrat de l'autorisation**, et il est le moins protégé du
schéma — voir M-2. Le signaler ici plutôt qu'à la porte S3 est le sens même d'une porte par
vague.

---

### S7 — Le droit d'export est distinct de la lecture · sans objet (L3)

Le schéma le prévoit (`sessions.peut_exporter`, `groupes_ad.accorde_export`, action `export`
dans `ck_journal_audit_action`). Rien ne l'applique ni ne le journalise encore.

---

### S8 — Secrets · passé

- **Dépôt** : aucun secret. Le seul mot de passe en dur est `MOT_DE_PASSE="dev"`
  (`preparer_base_dev.sh:40`), assumé, encadré par un avertissement en tête de fichier et par un
  garde-fou `NODE_ENV=production` (lignes 92-97) qui refuse l'exécution.
- **Historique git** : aucun `.env`, `.pem`, `.key`, `id_rsa` n'a jamais été suivi.
  `.gitignore` couvre `backend/.env*` avec exception explicite pour `.env.example`, lequel ne
  porte que des clés vides.
- **`ps`** : `preparer_base_dev.sh` envoie le SQL par `-f -` et `install.sh` passe `PGPASSWORD`
  par l'environnement du seul processus fils — commentés comme tels aux lignes 88-91 et 673.
- **Sorties de commande** : la bannière de `migrate.mjs` (ligne 502) n'affiche ni chaîne de
  connexion ni mot de passe ; `lecteur.secret()` (`config/index.ts:242`) n'inclut jamais la
  valeur dans un message d'erreur ; `resumerConfiguration()` (ligne 773) est une liste blanche
  de champs, sans secret — c'est le seul objet journalisé au démarrage.
- **Journaux** : `redact` sur `authorization`, `cookie`, `set-cookie` (`serveur.ts:53-60`).
- **Vidage de cœur** : `LimitCORE=0` et `CoredumpFilter=0x00` dans l'unité systemd — le secret
  de session ne peut pas fuir par un core.

---

### S9 — Chaîne de contrôle des pièces jointes · sans objet (L6)

Seules les **métadonnées** existent (`pieces_jointes`, `001_socle.sql:946`). Aucun des huit
contrôles du `PLAN_SERVEUR` §1.6 n'est implémenté, et ClamAV n'est pas disponible sur cette
machine (`PLAN_EXECUTION` §6). À établir intégralement à la porte S4.

Deux préparatifs corrects sont déjà là : `NoExecPaths=/var/lib/cyber-grc` dans l'unité systemd,
et `Require all denied` sur le magasin dans le vhost Apache.

---

### S10 — Sortie et en-têtes · partiel

**Ce qui est vérifiable maintenant — posé et correct.** `deploy/apache/cyber-grc.conf` :

- CSP stricte (ligne 64) : `default-src 'self'; script-src 'self'; object-src 'none';
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'` — pas de `unsafe-eval`, pas de
  `unsafe-inline` sur les scripts (seulement sur `style-src`, ce que l'application actuelle
  impose ; à réduire quand elle le permettra).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, HSTS un an avec
  `includeSubDomains`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy`.
- `ServerTokens Prod` + `ServerSignature Off` (le premier n'est acceptable qu'en portée serveur,
  d'où `durcissement-global.conf` — le détail est juste).
- TLS 1.2/1.3 seulement.
- L'API pose elle-même `nosniff` et `cache-control: no-store` (`serveur.ts:74-79`), en défense
  en profondeur.

**Ce qui ne l'est pas.** Il n'existe pas encore de cookie de session : `HttpOnly` / `SameSite` /
`Secure` sont **sans objet** et seront à établir à la porte S3. L'échappement en sortie reste un
acquis du frontend, non touché par cette vague.

---

### S11 — Limitation du rythme et verrouillage · sans objet (L3)

Aucun point d'authentification. Le schéma prévoit `connexion_echouee` et `session_revoquee` dans
`ck_journal_audit_action` ; rien ne les émet.

Deux garde-fous de plateforme existent déjà et compteront : `StartLimitIntervalSec=300` /
`StartLimitBurst=5` sur l'unité (voir toutefois m-5), et `TasksMax=256` / `LimitNOFILE=8192`.

---

### S12 — Les erreurs ne renseignent pas l'attaquant · réserve

**Ce qui est bon.** `serveur.ts:118-139` : au-delà de 500, la réponse est
`{erreur:'erreur_interne', message:"…", reference:<uuid>}` — aucune pile, aucun nom d'objet de
base ; le détail et la pile partent au journal technique. `/api/sante` est délibérément avare.

**Les réserves.**

1. **Les messages d'erreur de la base sont un oracle d'existence inter-filiales** — voir m-1.
   La contre-mesure est entièrement du ressort de S12 en L2 : aucun message PostgreSQL brut ne
   doit atteindre le client.
2. **Le chemin < 500 renvoie `erreur.message` tel quel** (ligne 136). Aujourd'hui il ne porte
   que des messages de validation Fastify. Dès L2, une erreur de base présentée en 4xx —
   typiquement le `GRC04` ou le `23514` de `f_coherence_mesure_catalogue`, dont le texte cite
   l'identifiant de la mesure et la filiale — sortirait telle quelle. À traiter par une table de
   traduction SQLSTATE vers message générique, pas par un passe-plat.

À noter au crédit des auteurs : le message de `f_coherence_mesure_catalogue()`
(`004_rls.sql:373`) a été délibérément écrit pour **ne pas** distinguer « mesure inconnue » de
« mesure locale d'une autre filiale » — c'est exactement le bon réflexe, et il ferme un oracle.

---

### S13 — Dénis de service applicatifs · réserve

**Ce qui est posé.**

| Borne | Où | Valeur |
|---|---|---|
| Taille de corps HTTP | `serveur.ts:66` via `SERVEUR_TAILLE_MAX_CORPS` | 26 Mio |
| Délai de requête SQL | `pool.ts:135` (`options` libpq, donc sur **toute** requête) | 15 s |
| Transaction inactive | `pool.ts:136` | borné |
| Attente de verrou | `pool.ts:137` | 5 s |
| Pool | `pool.ts:128`, config min 1 / max 200 | 10 |
| Mémoire du service | unité systemd | `MemoryHigh=1G`, `MemoryMax=2G` |
| Processus / descripteurs | unité systemd | `TasksMax=256`, `LimitNOFILE=8192` |

Poser les délais de garde **à la connexion** plutôt qu'à chaque requête est le bon choix : ils
s'appliquent aussi au code qui oubliera de les poser.

**La réserve — les bornes de la reprise s'appliquent après `JSON.parse`.** Les bornes annoncées
(64 Mio, 2 000 000 nœuds, profondeur 16, 500 anomalies) sont **réellement appliquées** ; je les
ai toutes éprouvées, et les défenses contre les entrées hostiles sont excellentes (voir S14).
Mais le contrôle de taille (`src/reprise/index.ts:737`) porte sur la longueur de la chaîne, et
le budget de nœuds n'est consulté qu'**après** l'analyse JSON complète. Un fichier *admis* par
le plafond coûte donc :

```
fichier : 59 Mio de caracteres (plafond : 64)
resultat : statut=invalide code=entree-trop-complexe
temps de blocage de la boucle d evenements : 4642 ms
heap : 8 -> 373 Mio | rss : 75 -> 611 Mio
```

Quatre secondes et demie de **blocage de la boucle d'événements** — donc de tout le service, qui
est mono-processus — et 611 Mio de mémoire résidente, pour un fichier finalement refusé. Voir
m-5.

**Pagination et bornes de liste** : sans objet, aucune requête de liste n'existe.

---

### S14 — Intégrité des opérations composites · passé

**Migrations** — chaque fichier porte son `begin` / `commit`. Vérifié par mutation : une
migration `004` volontairement fautive laisse la base **intacte** (aucune politique posée,
aucune fonction créée), et `migrate.mjs` distingue explicitement le cas où le fichier s'est
validé par son propre `commit` (`migrationValidee`) — la distinction est juste et évite
d'envoyer l'exploitant rejouer un fichier déjà appliqué.

**`migrate.mjs`** — les quatre propriétés exigées par le §3 du plan d'exécution sont tenues :

```
$ node db/migrate.mjs                      # deuxième passage, base déjà migrée
  001_socle.sql ............... déjà appliquée      … Schéma à jour, rien à appliquer.   <-- idempotent

$ sed -i '1s/$/ --/' db/migrations/002_metier_noyau.sql && node db/migrate.mjs
  002_metier_noyau.sql ........ DIVERGENCE
 ERR Une migration déjà appliquée a été modifiée depuis : 002_metier_noyau.sql
code de sortie : 4                                                                        <-- anti-réécriture
```

L'ordre est déterministe (tri par numéro, doublons et trous refusés), et le repli quand
l'empreinte est absente en base est **annoncé bruyamment** plutôt que silencieux.

**Cascades** — les huit cascades du `CONVENTIONS` §8 sont toutes implémentées fidèlement, et
j'ai vérifié la distinction « supprime » (`cascade`) et « délie » (`set null`) une par une :
`actions.mesure_id -> SET NULL`, `incidents.risque_id -> SET NULL`, tout le reste en `CASCADE`,
`filiales` en `RESTRICT`. Une neuvième cascade a été **ajoutée** sans figurer au §8, et son
rayon traverse les filiales — voir M-3.

**Reprise** — le fichier n'est jamais appliqué partiellement : `lireEnveloppe` rend un statut,
jamais une exception, et n'écrit rien en base (le chargement est L7).

---

### S15 — Dépendances · passé

```
$ npm audit
found 0 vulnerabilities
```

Cinq dépendances, toutes justifiées en tête de `serveur.ts`, aucune ajoutée pendant la vague :
`fastify@5.12.1`, `pg@8.23.0`, `typescript@5.9.3`, `@types/node`, `@types/pg`. Les intervalles
sont en `^` mais `package-lock.json` est versionné : l'épinglage réel est assuré. Le moteur est
borné (`node >=22.11.0 <25`).

---

## 3. Les constats

### B-1 · BLOQUANT — Sept clés étrangères directes traversent la frontière de filiale

**Où.**

| Contrainte | Fichier:ligne | Enfant vers parent | Suppression |
|---|---|---|---|
| `fk_actions_exigence` | `003_metier_operations.sql:234` | `actions.exigence_id` vers `exigences` | CASCADE |
| `fk_actions_risque` | `003_metier_operations.sql:236` | `actions.risque_id` vers `risques` | CASCADE |
| `fk_actions_evaluation` | `003_metier_operations.sql:238` | `actions.evaluation_id` vers `evaluations` | CASCADE |
| `fk_actions_incident` | `003_metier_operations.sql:240` | `actions.incident_id` vers `incidents` | CASCADE |
| `fk_incidents_risque` | `003_metier_operations.sql:136` | `incidents.risque_id` vers `risques` | SET NULL |
| `fk_tests_pra_scenario` | `003_metier_operations.sql:395` | `tests_pra.scenario_id` vers `scenarios_pra` | CASCADE |
| `fk_exigences_client` | `002_metier_noyau.sql:189` | `exigences.client_id` vers `clients` | CASCADE |

Dans les sept cas, l'enfant **et** le parent portent un `filiale_id` non nul, et la clé
étrangère ne porte que la colonne de référence.

**Pourquoi c'est un défaut.** Les contrôles d'intégrité référentielle de PostgreSQL contournent
délibérément la Row Level Security — le fichier `004_rls.sql:701-726` le dit lui-même, mot pour
mot : « les contrôles d'intégrité référentielle de PostgreSQL contournent délibérément la RLS …
la clé étrangère vers l'exigence allemande SERA satisfaite, même si cette exigence est
invisible ». Cette analyse, parfaitement juste, a été appliquée **aux six tables de liaison** et
à trois clés composites (`fk_evaluation_mesures_evaluation`, `fk_traitement_mesures_traitement`,
`fk_document_referentiels_coherence`), mais **pas aux sept clés étrangères directes ci-dessus**,
qui ont pourtant exactement la même forme.

Le motif de correction est présent, correctement raisonné, à trente lignes de là
(`002_metier_noyau.sql:696-701`) :

```sql
-- Clé étrangère COMPOSITE : le couple (évaluation, filiale) doit exister tel quel dans
-- evaluations. C'est ce qui interdit à une ligne de liaison d'annoncer une filiale
-- autre que celle de son évaluation — un tel écart serait une brèche de cloisonnement,
-- la RLS de cette table filtrant sur filiale_id.
constraint fk_evaluation_mesures_evaluation foreign key (evaluation_id, filiale_id)
    references evaluations (id, filiale_id) on delete cascade,
```

**Scénario d'exploitation, rejoué de bout en bout.**

*Étape 1 — la filiale A écrit sept références vers la filiale B.* Session `grc_app`,
`grc.filiale_id = 'FIL-A'`, `grc.filiales = 'FIL-A'` — périmètre strictement mono-filiale :

```
-- actions.risque_id      -> risques(B)        INSERT 0 1
-- actions.exigence_id    -> exigences(B)      INSERT 0 1
-- actions.incident_id    -> incidents(B)      INSERT 0 1
-- actions.evaluation_id  -> evaluations(B)    INSERT 0 1
-- exigences.client_id    -> clients(B)        INSERT 0 1
-- incidents.risque_id    -> risques(B)        INSERT 0 1
-- tests_pra.scenario_id  -> scenarios_pra(B)  INSERT 0 1
-- CONTRE-EXEMPLE, FK composite : evaluation_mesures  -->  ERROR (refusé, comme il se doit)
```

État obtenu, toujours vu depuis la filiale A :

```
   id   |          titre           | pointe_vers          id   | risque_id        id    | scenario_id
--------+--------------------------+-------------      --------+-----------    ---------+-------------
 ACT-X1 | action A -> risque B     | RISK-B1            INC-X6 | RISK-B1        TEST-X7 | SCEN-B1
 ACT-X2 | action A -> exigence B   | EX-B1
 ACT-X3 | action A -> incident B   | INC-B1               id   | client_id
 ACT-X4 | action A -> evaluation B | EVAL-B1             EX-X5 | CLI-B1
```

*Étape 2 — la filiale B fait une suppression parfaitement ordinaire dans ses propres données.*
Session `FIL-B` : `delete from risques where id='RISK-B1';` donne `DELETE 1`.

*Étape 3 — les données de la filiale A ont été détruites et modifiées, sans que personne de A
n'agisse.* Session `FIL-A` :

```
-- ACT-X1 de la filiale A a-t-elle survecu ?
 id | titre
----+-------
(0 rows)                                       <-- détruite par la cascade de B

-- INC-X6 de la filiale A : risque_id remis a null ?
   id   |         titre          | risque_id
--------+------------------------+-----------
 INC-X6 | incident A -> risque B |                <-- modifiée par le SET NULL de B
```

Et la trace laissée dans la ligne de la filiale A :

```
   id   | version | cree_par | modifie_par |          modifie_le
--------+---------+----------+-------------+-------------------------------
 INC-X6 |       2 | alice    | bruno       | 2026-08-31 10:40:30.826189+00
```

**L'identité d'un utilisateur de la filiale allemande est inscrite dans une ligne de la filiale
de Toulouse, et le compteur de verrouillage optimiste de cette ligne a été incrémenté par lui.**
Même effet démontré sur `tests_pra` : `delete from scenarios_pra where id='SCEN-B1'` chez B
supprime `TEST-X7` chez A.

**Ce que ça vaut, honnêtement.** Ce n'est **pas** une fuite de confidentialité : la filiale A ne
peut pas lire le contenu de `RISK-B1` (la RLS de `risques` tient, vérifié). C'est une **brèche
d'intégrité et de disponibilité inter-filiales**, plus un oracle d'existence (m-1). Elle exige
qu'un point d'entrée accepte un identifiant arbitraire dans un champ de rattachement —
c'est-à-dire exactement le contrat des écritures ciblées du lot L2, où la RLS est censée servir
de filet quand le filtrage applicatif est oublié (`PLAN_SERVEUR` §1.9 : « un oubli de filtre
dans le code ne peut pas provoquer de fuite inter-filiales »). Ici, l'oubli passe.

**Pourquoi bloquant plutôt que majeur.** Trois raisons, et non la gravité intrinsèque :

1. La vague 1 a pour objet de **figer le schéma relationnel**. Corriger maintenant coûte sept
   `alter table` dans les migrations non déployées ; corriger après la mise en service pilote
   exige un `alter` sur une base vivante **plus** la réparation des lignes déjà polluées, que
   plus rien ne permettra de distinguer des lignes légitimes.
2. Le défaut n'est couvert **ni par le banc d'essai ni par la démonstration d'audit** : les deux
   ne testent que les tables de liaison. Il serait donc parti en production en étant réputé
   couvert par les 28 contrôles verts de `verifier_cloisonnement.sql`.
3. La démonstration faite à l'auditeur affirme aujourd'hui que la filiale de Toulouse « ne peut
   pas créer de lien vers » l'Allemagne. C'est faux pour sept liens sur treize.

**Correction suggérée.**

```sql
-- 1. Rendre les cinq parents référençables en composite (ils ne le sont pas encore) :
alter table clients       add constraint uq_clients_id_filiale       unique (id, filiale_id);
alter table exigences     add constraint uq_exigences_id_filiale     unique (id, filiale_id);
alter table risques       add constraint uq_risques_id_filiale       unique (id, filiale_id);
alter table incidents     add constraint uq_incidents_id_filiale     unique (id, filiale_id);
alter table scenarios_pra add constraint uq_scenarios_pra_id_filiale unique (id, filiale_id);
-- (evaluations, documents, traitements les portent déjà.)

-- 2. Recomposer les sept clés étrangères, en conservant leur action de suppression :
--    actions.(exigence_id|risque_id|evaluation_id|incident_id) -> …(id, filiale_id)
--    incidents.risque_id, exigences.client_id, tests_pra.scenario_id -> idem
```

Puis **ajouter les cas d'essai manquants** : un test par clé dans `test/base/rls.test.mjs`
(insertion transfrontière refusée) et un contrôle correspondant dans
`verifier_cloisonnement.sql`, sans quoi la même omission se reproduira au prochain ajout
d'entité. Ces deux ajouts font partie du correctif, pas d'un lot ultérieur.

---

### M-1 · MAJEUR — Aucune fonction du schéma ne fige son `search_path` : masquage par `pg_temp`

**Où.** Les seize fonctions de `001_socle.sql` et `004_rls.sql`. Aucune n'a de `proconfig` :

```
            proname             | prosecdef | proconfig |       prop
--------------------------------+-----------+-----------+------------------
 f_journal_audit_chainage       | f         |           | grc_proprietaire
 f_coherence_mesure_catalogue   | f         |           | grc_proprietaire
 f_verifier_couverture_rls      | f         |           | grc_proprietaire
 …  (16 lignes, toutes prosecdef=f, toutes proconfig vide)
```

Aucune n'est `security definer` — c'est bien, et conforme au `CONVENTIONS` §10, qui affirme
« aucune n'est un contournement de droits ». Vrai. Mais le §10 ne dit rien du `search_path`, et
c'est là que se trouve le défaut : **PostgreSQL consulte implicitement `pg_temp` en premier pour
les relations**, y compris quand `search_path` est explicitement fixé à `public` — ce que fait
pourtant le pool (`pool.ts:133`, `-c search_path=public`).

**Scénario d'exploitation, rejoué.** Session `grc_app`, avec le `search_path` du pool en
vigueur, sur une base montée par `preparer_base_dev.sh` :

```
set search_path = public;                                     SET
create temp table journal_audit (numero bigint, empreinte text);
insert into journal_audit values (999999, repeat('a',64));

-- le declencheur de chainage lit-il la table temporaire ?
insert into public.journal_audit (filiale_id, utilisateur_libelle, action, resume)
  values ('FIL-A','alice','creation','entree posee apres masquage');            INSERT 0 1

 numero  |                       empreinte_precedente                       |           resume
---------+------------------------------------------------------------------+-----------------------------
 1000000 | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | entree posee apres masquage
       4 | 734ea2ade5179af2e4216380eb813dc88706061403fba5cb473dd84e9f02b891 | entree transversale forgee
```

`numero` et `empreinte_precedente` viennent de la table de l'attaquant. Le dommage est
**irréversible** — l'ajout seul empêche l'attaquant de corriger, mais aussi le défenseur :

```
$ select * from f_journal_audit_verifier();
 numero_entree |    anomalie     |                        detail
---------------+-----------------+-----------------------------------------------------
       1000000 | numero_manquant | numéro attendu 5, trouvé 1000000
       1000000 | chainage_rompu  | empreinte précédente déclarée aaaa… / réelle cf608c…
```

Le journal porte désormais, à demeure, les deux anomalies que le `CONVENTIONS` §12 apprend à
l'auditeur à lire comme « **entrée supprimée** » et « **entrée insérée ou substituée** ».

Trois amplifications :

1. **Déni de journalisation** — poser `numero = 9223372036854775807` fait déborder l'entier au
   `+1` suivant : plus aucune écriture au journal n'est possible.
2. **Le vérificateur lui-même est neutralisé** — masqué à son tour, il ne rend plus d'anomalies,
   il **lève** : `ERROR: record "r" has no field "id"`. Un vérificateur qui plante est un
   vérificateur qu'on finit par ne plus lancer.
3. **Le déclencheur de cohérence des mesures est entièrement désarmé** — même recette sur
   `mesure_catalogue`, et la filiale A met en œuvre une mesure **locale** de la filiale B, ce
   que `004_rls.sql:373` existe précisément pour interdire :

```
create temp table mesure_catalogue (id text, filiale_id text);
insert into mesure_catalogue values ('MESURE-LOCALE-B', null);
insert into public.mesure_mise_en_oeuvre (id, filiale_id, mesure_id)
  values ('MMO-VOL','FIL-A','MESURE-LOCALE-B');                                 INSERT 0 1
   id    | filiale_id |    mesure_id
 MMO-VOL | FIL-A      | MESURE-LOCALE-B
```

4. **Même `pg_catalog` est masquable**, ce qui fait mentir le garde-fou de couverture :

```
create temp table pg_class (oid oid, relname name, relrowsecurity boolean, …);
select count(*) from f_verifier_couverture_rls();     -->  0   <-- « aucune anomalie », sur un faux catalogue
```

**Ce qui limite la portée, et qu'il faut dire.** Sur une installation de **production**,
l'attaque est **fermée** — mais par accident. `install.sh:659` fait
`revoke all on database $BASE_NOM from public`, ce qui retire au passage le privilège
`TEMPORARY` accordé par défaut à `PUBLIC`, et n'accorde ensuite que `connect` à `grc_app`.
Vérifié en reproduisant exactement ce jeu de privilèges :

```
 temp | connexion            create temp table journal_audit(…);
------+-----------           ERROR:  permission denied to create temporary tables in database "grc_audit"
 f    | t
```

Mais : (a) `preparer_base_dev.sh` **ne fait pas** ce `revoke`, donc toute base de développement,
de recette et **la totalité du banc d'essai** tournent dans la configuration vulnérable ;
(b) aucun commentaire, dans les migrations ni dans `CONVENTIONS.md`, n'indique que l'intégrité
du journal dépend d'une ligne de `install.sh` ; (c) aucun test ne vérifie ce privilège — un
futur `grant temporary` rouvrirait la porte en silence ; (d) l'environnement de recette est
alimenté par « une copie réaliste de la production » (`PLAN_SERVEUR` §1.10), donc avec de vraies
données.

**Correction suggérée.** Deux mesures, indépendantes, à prendre toutes les deux :

1. **Dans les migrations** — figer le chemin de recherche de chaque fonction, là où vit la
   dépendance : `alter function f_journal_audit_chainage() set search_path = pg_catalog, public;`
   (et de même pour les quinze autres). C'est une ligne par fonction, sans effet de bord.
2. **Dans `preparer_base_dev.sh`** — aligner le jeu de privilèges sur celui de la production
   (`revoke all on database … from public`), et **ajouter un test** qui constate que `grc_app`
   n'a pas `TEMP`. Le banc d'essai doit éprouver la configuration déployée, pas une autre.

---

### M-2 · MAJEUR — Les tables qui portent l'autorisation sont les moins protégées du schéma

**Où.** `004_rls.sql:1052-1090`, famille 4. Sept tables du substrat d'authentification reçoivent
une politique `using (true)` et `with check (true)` **en lecture comme en écriture**, et
`grc_app` conserve `select, insert, update, delete` dessus :

`sessions` · `session_filiales` · `session_domaines` · `utilisateurs` · `groupes_ad` ·
`profils` · `profil_domaines`

**Pourquoi c'est un défaut.** Le commentaire du §6 est explicite et assumé : « Ce qui les
protège n'est PAS la RLS … [mais] le modèle de droits à trois axes, vérifié côté serveur ». Pour
`mappings` ou `filiales`, cet arbitrage se défend. Pour les tables qui **produisent** la décision
d'autorisation, il est circulaire : le contrôle applicatif décide des droits en lisant `sessions`
et `session_filiales`, et ces mêmes tables sont intégralement réinscriptibles par le rôle qui
exécute ce contrôle. Il n'y a plus de défense en profondeur, seulement une couche.

Extrait de `sessions`, tel que la migration le laisse :

```
 POLICY "pol_sessions_lecture" FOR SELECT USING (true)
 POLICY "pol_sessions_maj"     FOR UPDATE USING (true) WITH CHECK (true)
```

alors que la table porte `administrateur boolean`, `peut_exporter boolean`, `perimetre text`,
`expire_le`, `revoquee_le`.

**Scénario concret (à partir de L3).** Une injection SQL résiduelle, une confusion de paramètre
ou un point d'entrée d'administration mal gardé qui atteint `update sessions set …` permet à
n'importe quelle session de se poser `administrateur = true`, `peut_exporter = true`, de
repousser `expire_le`, ou d'annuler une révocation — et, en insérant dans `session_filiales`,
d'élargir son propre périmètre à la vingtaine de filiales dès que L3 recalculera le périmètre
depuis cette table. Aucune couche base ne s'y oppose. Le drapeau `peut_exporter` est précisément
celui que le `PLAN_SERVEUR` §3.3 érige en permission distincte.

Accessoirement, la lecture ouverte expose à toute session l'annuaire complet des utilisateurs du
groupe, les empreintes de jeton, les adresses IP, les agents utilisateurs et le périmètre de
chacun. Point positif : `sessions.jeton_empreinte` est bien une **empreinte** SHA-256 et non le
jeton — aucun secret réutilisable n'est stocké.

**Correction suggérée.** Non pas de la RLS (elle serait circulaire), mais des **privilèges SQL**,
exactement comme le §1 de `004_rls.sql` l'a déjà fait pour `migrations_schema` :

- `revoke insert, update, delete on groupes_ad, profils, profil_domaines from grc_app`
  (données d'administration, écrites par une procédure d'exploitation ou par un chemin dédié) ;
- restreindre l'écriture de `sessions` aux colonnes qui bougent en fonctionnement
  (`derniere_activite`, `revoquee_le`, `motif_revocation`) par `grant update (…)` colonne à
  colonne, `administrateur` / `peut_exporter` / `perimetre` n'étant fixés qu'à la création ;
- à défaut, poser un déclencheur `before update` qui refuse toute modification de ces trois
  colonnes — le motif de `f_coherence_mesure_catalogue()` s'applique tel quel.

À arbitrer avec l'agent AUTH avant L3, pas après.

---

### M-3 · MAJEUR — Le drapeau d'administration Groupe permet d'accaparer et de détruire le socle commun

**Où.** `004_rls.sql:337` (`f_administration_groupe()`), politiques de la famille 2
(`004_rls.sql:650-700`), et le commentaire de `pol_<table>_maj` aux lignes 688-689.

**Pourquoi c'est un défaut.** Le prédicat d'écriture des cinq tables mixtes est

```sql
case when filiale_id is null then f_administration_groupe()
     else filiale_id = f_filiale_ecriture() end
```

Il est évalué **séparément** sur l'ancienne et la nouvelle ligne. Rien n'interdit donc de
franchir la frontière entre les deux portées : `using` est satisfait par la moitié gauche (ligne
Groupe plus drapeau), `with check` par la moitié droite (ligne de la filiale active). Le
commentaire posé sur la politique affirme pourtant le contraire :

```
'Modification : mêmes conditions que l''ajout, des deux côtés — une filiale ne
 peut ni s''approprier une ligne Groupe, ni pousser une ligne chez une autre.'
```

**Scénario, rejoué.** Session `FIL-A` posant elle-même le drapeau (rien ne l'en empêche : c'est
un réglage de session ordinaire) :

```
-- (a) modifier le socle Groupe, visible des 20 filiales
update mesure_catalogue set nom='socle detourne par la filiale A' where id='MESURE-SOCLE';   UPDATE 1
-- (b) APPROPRIATION : basculer la ligne Groupe dans la seule filiale A
update mesure_catalogue set filiale_id='FIL-A' where id='MESURE-SOCLE';                      UPDATE 1
      id      | filiale_id |               nom
 MESURE-SOCLE | FIL-A      | socle detourne par la filiale A     <-- disparue des 19 autres filiales
-- (c) supprimer purement le socle Groupe
delete from mesure_catalogue where id='MESURE-SOCLE';                                        DELETE 1
```

**Et la suppression emporte les données invisibles des autres filiales.** `mesure_catalogue` vers
`mesure_mise_en_oeuvre` est en `on delete cascade` — cascade qui ne figure pas au `CONVENTIONS`
§8 (écrit avant la scission des mesures) et dont le rayon inter-filiales n'a donc jamais été
arbitré :

```
### K1 — chaque filiale met en oeuvre la mesure du socle Groupe    (MMO-A chez A, MMO-B chez B)
### K2 — la filiale A, avec le drapeau, supprime le socle Groupe   DELETE 1
### K3 — que reste-t-il de la mise en oeuvre de la filiale B ?
 id | filiale_id | mesure_id
----+------------+-----------
(0 rows)                                       <-- la ligne de B a été détruite, invisible de A
```

Un acteur détruit ainsi, en une commande, une donnée qu'il ne peut pas voir, dans une filiale
qui n'est pas la sienne, sans aucune trace en base.

**Ce qui atténue.** Le drapeau n'est posé par **aucun chemin de code** aujourd'hui
(`appliquerPerimetre` ne l'écrit pas), et l'opération est par nature réservée à une
administration Groupe. Le contrôle vérifié en S2 tient : le drapeau n'élargit **jamais** la
lecture. Ce n'est donc pas une élévation de privilège exploitable en l'état, mais un
comportement de schéma qui contredit sa propre documentation et qui sera figé.

**Correction suggérée.**

1. Un déclencheur `before update` sur les cinq tables mixtes refusant
   `new.filiale_id is distinct from old.filiale_id` (une ligne ne change pas de portée ; on en
   crée une nouvelle) — motif identique à `f_coherence_mesure_catalogue()`, avec un SQLSTATE
   traduisible.
2. Aligner le commentaire de `pol_<table>_maj` sur le comportement réel.
3. Arbitrer explicitement la cascade `mesure_catalogue` vers `mesure_mise_en_oeuvre` : soit
   `on delete restrict` avec une procédure de retrait d'une mesure du socle, soit conservation
   de la cascade **documentée au `CONVENTIONS` §8** avec la mention de son rayon inter-filiales.

---

### m-1 · MINEUR — Oracle d'existence inter-filiales par les messages de contrainte

**Où.** Comportement de PostgreSQL, non spécifique au code — mais non traité.

```
### A3 — deviner l existence de RISK-B1 depuis la filiale A
insert into risques (id, filiale_id, nom) values ('RISK-B1','FIL-A','sonde');
ERROR:  duplicate key value violates unique constraint "pk_risques"

### A4 — meme sonde sur un identifiant inexistant
insert into risques (id, filiale_id, nom) values ('RISK-INEXISTANT','FIL-A','sonde');
INSERT 0 1
```

**Scénario.** Une filiale énumère les identifiants d'une autre. Les identifiants suivent
`<PREFIXE>-<millisecondes>-<alea 0..999>` (`f_generer_id`, `001_socle.sql:191`, avec `random()`
non cryptographique ; idem `Math.random` dans `src/reprise/index.ts:1290` et `1696`) : mille
essais par milliseconde ciblée suffisent. L'oracle ne révèle pas le contenu, mais il fournit les
identifiants dont B-1 a besoin.

**Correction.** Elle relève de S12 en L2 : aucun message d'erreur PostgreSQL brut ne doit
atteindre le client ; une violation de contrainte se traduit en message générique. Le format des
identifiants, lui, est un arbitrage figé et justifié (`CONVENTIONS` §2, exactitude du
round-trip) : ne pas le rouvrir, mais le prendre en compte dans le modèle de menace.

---

### m-2 · MINEUR — Le périmètre transite en chaîne jointe par virgules, sur un domaine qui admet la virgule

**Où.** `pool.ts:235` (`perimetre.filiales.join(',')`), `001_socle.sql:177`
(`string_to_array(…, ',')`), domaine `id_metier` :
`CHECK ((VALUE <> '') AND (length(VALUE) <= 64))`.

**Pourquoi.** Un identifiant de filiale contenant une virgule est accepté par le domaine et
scinde le périmètre en deux entrées. Un `id` valant `FIL-A,FIL-B` accorderait la lecture des deux
filiales.

**Scénario.** Aucun chemin ne permet aujourd'hui à un utilisateur de choisir un identifiant de
filiale (la création de filiale est L4, la reprise `grc-backup` ne porte pas de filiale). C'est
donc **un constat de défense en profondeur, pas une vulnérabilité exploitable en l'état** — je le
dis franchement. Il mérite d'être fermé maintenant parce que le domaine est en train d'être figé
et que L4 introduira la création de filiale.

**Correction.** Ajouter `and value !~ ','` au domaine `id_metier`, ou — plus propre — transporter
le périmètre en `jsonb` ou en tableau plutôt qu'en chaîne jointe.

---

### m-3 · MINEUR — `f_verifier_couverture_rls()` ne détecte que le prédicat littéral `true`

**Où.** `004_rls.sql:508-520` — la détection compare
`pg_get_expr(p.polqual, p.polrelid) = 'true'`.

**Pourquoi.** Une politique non cloisonnante mais non triviale passe le garde-fou. Éprouvé par
mutation : en remplaçant le prédicat de lecture de la famille 1 par
`filiale_id is not null and f_filiales_lecture() is not null`, la migration **s'applique sans
anomalie** et le garde-fou reste vert.

**Ce qui rattrape.** Les tests de comportement, eux, mordent — cinq échecs immédiats, dont
« Toulouse ne voit AUCUNE ligne des autres filiales ». Le filet existe donc, il est simplement
ailleurs que là où on le croit. C'est **une observation sur la portée annoncée du garde-fou**,
pas un trou : le commentaire lui prête plus qu'il ne fait.

**Correction.** Documenter la limite dans le commentaire de la fonction, ou exiger que le
prédicat mentionne `f_filiales_lecture` / `f_filiale_ecriture` pour toute table portant un
`filiale_id` hors dérogation.

---

### m-4 · MINEUR — L'écriture du journal suit le périmètre de lecture, pas la filiale active

**Où.** `004_rls.sql:1132` — `pol_journal_audit_ajout` :
`filiale_id is null or filiale_id = any (f_filiales_autorisees())`. Seule politique d'écriture du
schéma dans ce cas (vérifié par balayage de `pg_policy`).

**Pourquoi.** Le `CONVENTIONS` §11 pose : lecture sur le périmètre, **écriture sur la filiale
active**. Ici, une session de périmètre Groupe peut attribuer une entrée de journal à n'importe
laquelle des vingt filiales, et non à celle qu'elle a sélectionnée.

**Scénario.** Un administrateur Groupe malveillant fabrique une trace dans le registre d'une
filiale où il n'opère pas. C'est un affaiblissement de la valeur probante du journal pour cette
filiale, mais dans un périmètre déjà très privilégié : je le classe mineur.

**Correction.** `filiale_id is null or filiale_id = f_filiale_ecriture()`, sauf si un cas d'usage
identifié l'exige — auquel cas le justifier en commentaire, comme le fichier le fait partout
ailleurs.

---

### m-5 · MINEUR — Les bornes de la reprise se paient après `JSON.parse`

**Où.** `src/reprise/index.ts:737` (plafond en longueur de chaîne) et `:730-780` (budget de
nœuds appliqué après l'analyse).

**Preuve.** Voir S13 : 59 Mio admis, 4 642 ms de blocage de la boucle d'événements, 611 Mio de
RSS, avant refus.

**Scénario.** Dès que L7 exposera l'import : quelques envois concurrents d'un fichier de 60 Mio
saturent le service. Avec `MemoryMax=2G`, le cgroup tue le processus ; `Restart=on-failure` le
relance ; `StartLimitBurst=5` sur `StartLimitIntervalSec=300` **arrête définitivement l'unité**
après cinq occurrences, jusqu'à un `systemctl reset-failed` manuel. Le déni de service devient
donc durable, ce qui est plus grave que le pic mémoire lui-même.

**Correction.** Analyser en flux (analyseur incrémental) avec arrêt au budget, ou abaisser
nettement le plafond de taille pour un fichier de reprise, ou traiter la reprise dans un
processus fils jetable avec `--max-old-space-size` borné. Le troisième est le plus simple et
protège aussi la boucle d'événements.

---

### m-6 · MINEUR — Écarts au périmètre d'écriture des agents (§2 et §5.7 du plan d'exécution)

Cinq écarts constatés, tous **bénins dans leur contenu** — je les signale pour la discipline, pas
pour leur effet :

| Commit | Fichier écrit | Propriétaire selon §2 |
|---|---|---|
| `7ae6c93` | `backend/package.json` | orchestrateur (réservé) |
| `95e358a` | `backend/.env.example` | orchestrateur (réservé) |
| `7ae6c93`, `0090cd8` | `backend/db/CONVENTIONS.md` | non attribué (ni OUTILLAGE, ni SCHEMA) |
| `0090cd8` | `backend/db/migrations/003_metier_operations.sql` (11 l.) | SCHEMA |
| `0090cd8`, `6576729`, `7ae6c93` | `backend/src/reprise/**` | non attribué |

Contenu vérifié : la modification de `package.json` est une correction de motif de test
(`test/` devenu `"test/**/*.test.mjs"`, sans laquelle les fichiers de test n'étaient pas tous
collectés) ; celle de `.env.example` ajoute des clés documentées, aucune valeur. **Aucune
dépendance n'a été ajoutée sans arbitrage.**

Deux remarques de conduite : `backend/src/reprise/**` et `backend/db/CONVENTIONS.md` ne figurent
dans le périmètre d'aucun rôle du §2 — c'est une lacune du plan à combler avant la vague 2, pas
une faute des agents. Et le commit `95e358a`, hors périmètre, corrige une **régression de
sécurité réelle** (base et 47 tables possédées par `grc_app`, ce qui annulait la couche 4 de
l'inaltérabilité du journal) : signaler l'écart de forme ne doit pas faire manquer que le fond
était juste et important.

---

### Observations (sans scénario d'exploitation)

**O-1 — `f_journal_audit_verifier()` lève au lieu de signaler.** Sur une chaîne corrompue par
M-1, la fonction s'arrête sur `ERROR: record "r" has no field "id"` au lieu de rendre ses
anomalies. Un vérificateur qui plante finit par être désactivé du timer systemd. Enrober la
boucle et rendre une anomalie `verification_impossible` serait plus robuste.

**O-2 — Refus silencieux en `update` et `delete` sous RLS.** Le fichier `004` argumente très
bien contre les refus silencieux (c'est ce qui a fait écarter les `rule … do instead nothing`),
mais un `update` dont le `using` échoue rend `UPDATE 0` sans un mot :

```
### G1 — ligne Groupe, session de filiale sans le drapeau
update mesure_catalogue set nom='detourne' where id='MESURE-SOCLE';   UPDATE 0
delete from mesure_catalogue where id='MESURE-SOCLE';                 DELETE 0
```

Avec le verrouillage optimiste, l'API traduira ce 0 ligne en `GRC03` « modifié entre-temps » —
un message faux, qui enverra l'utilisateur recharger une page qu'il n'a pas le droit d'écrire.
À traiter en L2 : distinguer « conflit de version » de « refusé par la politique » (par exemple
en relisant la ligne par `id` seul avant de conclure).

**O-3 — Aucune ligne de portée Groupe n'est écrivable par l'application.** `pool.ts` ne pose
jamais `grc.administration_groupe`. Les lignes Groupe des cinq tables mixtes (socle de mesures,
politique Groupe, annuaire Groupe, paramètre Groupe) sont donc en lecture seule pour le service.
C'est **fail-closed**, donc sain, mais c'est un manque fonctionnel connu à ouvrir en L3/L4 — et
le moment où il s'ouvrira est le moment où M-3 devra être corrigé.

**O-4 — L'unité systemd interdit toute sortie réseau hors boucle locale.** `IPAddressDeny=any`
et `IPAddressAllow=localhost` bloqueront LDAPS (L3) et Microsoft 365 (L12). Fail-closed, donc à
signaler et non à reprocher ; à prévoir dans les lots concernés.

**O-5 — `src/reprise/index.ts` contient deux octets NUL littéraux** (offsets 50961 et 51238,
lignes 1353 et 1359), utilisés comme séparateur canonique de clé métier. L'usage est délibéré et
correct, mais `file(1)` classe le fichier « data » et `grep` le traite en binaire, ce qui gêne la
revue et le diagnostic. Un échappement `''` rendrait le même service en restant du texte.

**O-6 — Ni vue, ni vue matérialisée, ni séquence dans le schéma** (vérifié :
`vues 0 | vues_mat 0 | sequences 0`). Les vecteurs « vue sans `security_invoker` » et « séquence
lisible hors périmètre » sont donc **sans objet** — c'est une conséquence heureuse du choix
d'identifiants texte du `CONVENTIONS` §2.

---

## 4. La définition de « terminé » (§5)

| # | Point | Constat |
|---|---|---|
| 1 | **Ça compile** | OK — `npm run verifier-types`, exit 0, mode `strict` |
| 2 | **Ça s'applique depuis zéro** | OK — quatre migrations rejouées sur base neuve, `ON_ERROR_STOP=1`, exit 0, sans intervention |
| 3 | **C'est prouvé** | OK — `npm test` : **144 tests, 0 échec**, dont 50 tests de base sur PostgreSQL réel |
| 4 | **C'est conforme** | Réserve — balayage du catalogue : aucune contrainte, aucun index, aucun déclencheur de traçabilité hors convention ; toutes les tables commentées. Un seul écart, `migrations_schema` (`_pkey` généré), explicitement prévu au §13. **Mais** B-1 et M-3 sont des écarts de fond au `CONVENTIONS` §4/§7/§8, et le `CONVENTIONS` §4 affirme que `sessions` porte un `filiale_id` alors qu'elle n'en porte pas (c'est `session_filiales`) : à corriger dans un document normatif |
| 5 | **C'est en français** | OK — sans exception, y compris les messages d'erreur et les `comment on` |
| 6 | **C'est documenté** | Non évalué — hors de mon périmètre : l'agent DOC travaille en parallèle sur `README.md` §8, `CHANGELOG.md`, `DATA_MODEL.md` |
| 7 | **C'est dans le périmètre** | Réserve — cinq écarts, bénins : voir m-6 |
| 8 | **Les manques sont dits** | OK, et remarquable. Les dérogations sont écrites à l'endroit exact où elles sont prises, la lecture non cloisonnée du journal est annoncée **et** sa correction esquissée, `verifier_cloisonnement.sql` la porte comme un contrôle « OK (constaté) » plutôt que de la taire |

### Les tests mordent-ils ? — cinq mutations

Exigence de la porte : un test qui passe quoi qu'on fasse ne prouve rien. J'ai copié le backend
hors du dépôt, cassé cinq propriétés, et vérifié que les tests tombent.

| # | Propriété cassée | Résultat |
|---|---|---|
| 1 | `force row level security` devenu `no force` sur les 24 tables de niveau filiale | **La migration refuse de s'appliquer** : `Couverture RLS incomplète — 24 anomalie(s) : actifs : force_absente …`. Le garde-fou §8 est porteur, pas décoratif |
| 2 | Prédicat de lecture non cloisonnant mais non littéral `true` | Garde-fou aveugle (voir m-3), mais **5 tests de comportement tombent**, dont « Toulouse ne voit AUCUNE ligne des autres filiales » |
| 3 | Déclencheur `trg_journal_audit_interdit_maj` retiré | **7 échecs** : couche 2, couche 3, `empreinte_invalide`, `chainage_rompu`, « un update sans ligne est refusé lui aussi » |
| 4 | `trg_actions_coherence_mesure` retiré | 1 échec, précisément ciblé |
| 5 | `CLES_DANGEREUSES` vidé dans `src/reprise` | 3 échecs (pollution de prototype) |

**Conclusion : le banc d'essai mord.** Sa faiblesse n'est pas sa sensibilité, c'est sa
**couverture** : il n'atteint pas les sept clés étrangères de B-1, ni le privilège `TEMP` de M-1,
ni la transition de portée de M-3.

### Entrées hostiles — ce que j'ai tenté en plus des auteurs

Le fichier `test/reprise/entrees-hostiles.test.mjs` couvre déjà 22 cas sérieux. J'ai rejoué huit
attaques de mon côté, dont plusieurs qu'il ne couvrait pas :

| Attaque | Résultat |
|---|---|
| `__proto__` imbriqué, `constructor.prototype` | Retirés, `Object.prototype` intact |
| Clé `__proto__` écrite en échappement Unicode | Neutralisée (`JSON.parse` normalise avant le filtre) |
| Imbrication à 100 000 niveaux | Refusée en 20 ms, aucun débordement de pile, 14 Mio |
| Cycle dans un objet fourni directement | Cassé par la borne de profondeur |
| Accesseur piégé (`get` qui lève) sur un objet fourni | **Jamais invoqué** — le code lit le descripteur, pas la valeur |
| 5 M puis 8 M de nœuds | Refusés (`entree-trop-complexe`) |
| 64 Mio plus un caractère | Refusé sans analyse |
| **59 Mio admis par le plafond** | Refusé, mais **4,6 s de blocage et 611 Mio de RSS** : voir m-5 |

---

## 5. Ce que la grille ne couvre pas à ce stade

**Six des quinze contrôles sont sans objet ou partiels**, parce que le code qu'ils visent
n'existe pas : S6 (droits par requête), S7 (droit d'export), S9 (pièces jointes), S11 (rythme et
verrouillage), la moitié API de S4, et la moitié « session » de S10. Cela signifie qu'**une porte
S1 franchie ne dit rien de la sécurité du produit** — elle dit seulement que le schéma et le
cloisonnement sont sains. Trois angles morts méritent d'être nommés dès maintenant :

1. **Le cloisonnement n'est prouvé qu'au niveau SQL.** Aucun cloisonnement de bout en bout —
   navigateur, Apache, Fastify, PostgreSQL — n'a pu être éprouvé : la chaîne s'arrête à
   `/api/sante`. C'est l'objet de la porte S4.
2. **L'autorisation n'existe pas.** La RLS répond à « quelles lignes », jamais à « qui a le droit
   de faire quoi ». Les tables de la famille 4 sont explicitement laissées à un contrôle
   applicatif encore à écrire (M-2). Tant que L3 n'est pas livré, **toute personne disposant des
   identifiants `grc_app` a un accès complet** au socle d'authentification et au journal.
3. **La complétude du journal est invérifiable.** La table sait accueillir les 20 événements du
   §1.7, `export` compris ; rien n'en émet. La couverture réelle est à établir à la porte S3.

**Ce qui reste explicitement pour le test d'intrusion de L15**, et que la grille ne remplacera
pas : l'enchaînement de faiblesses mineures en chemin d'attaque complet (typiquement m-1 puis
B-1), la sécurité de la couche Apache en conditions réelles (renégociation TLS, désynchronisation
de requêtes, contrebande d'en-têtes vers le mandataire), la robustesse du VPN comme chemin
d'accès unique, la résistance des exports et des pièces jointes à un contenu piégé, et
l'ingénierie sociale sur le compte de secours.

**Limites assumées, reconduites telles quelles** : ni `root` sur la VM, ni le propriétaire de la
base ne sont dans le modèle de menace (`CONVENTIONS` §12, `004_rls.sql:66-80`). J'ai reproduit la
limite pour la constater — le propriétaire désarme un déclencheur et vide le journal — et c'est
bien le chaînage qui rend l'opération **détectable**, comme annoncé.

---

## 6. Ce que je n'ai pas pu vérifier sur cette machine

| Sujet | Pourquoi |
|---|---|
| **PostgreSQL 17** | La machine porte **16.13**, la cible est **17** (dépôt PGDG, `install.sh`). Aucune fonctionnalité postérieure à 15 n'est employée — vérifié — mais le comportement de la RLS, des cascades d'intégrité référentielle et de `pg_temp` n'a été observé qu'en 16. Le garde de version en tête de `004` exige 15 minimum, ce qui est cohérent. **À rejouer sur 17 avant la mise en service.** |
| **`install.sh` de bout en bout** | Ni Debian 13, ni Apache, ni systemd, ni `apt` ici. Le script a été **lu**, et ses effets sur les privilèges de base ont été **reproduits à la main** (le point décisif pour M-1) ; le reste — unité systemd, vhost, création d'utilisateur système, droits de fichiers — n'a pas été exécuté. Les contrôles S10 et une partie de S8 reposent donc sur la lecture. |
| **ClamAV** | Absent (`PLAN_EXECUTION` §6). S9 restera sans objet jusqu'à la porte S4. |
| **Active Directory / LDAPS** | Absent. S6, S7, S11 attendent une doublure d'annuaire (livrable OUTILLAGE de la vague 3). |
| **Relais SMTP** | Absent. La non-fuite par courriel (porte S6) n'est pas éprouvable. |
| **Volumétrie réelle** | Les essais portent sur quelques dizaines de lignes. Le comportement de la RLS sur les liaisons — dont les politiques font deux `exists` corrélés par ligne — n'a pas été mesuré à l'échelle de vingt filiales sur trois ans. À surveiller en L2 : ce sont des politiques coûteuses, et un plan qui dégénère en boucle imbriquée se paierait sur le chemin le plus chaud. **Non testé, donc non affirmé.** |
| **Documentation d'exploitation** | `README.md` §8, `CHANGELOG.md`, `DATA_MODEL.md` appartiennent à l'agent DOC, qui travaillait en parallèle. Le point 6 de la définition de « terminé » n'est pas évalué par ce rapport. |
| **Synchronisation NTP** | Le `PLAN_SERVEUR` §1.7 en fait un point d'audit systématique. L'horodatage du journal est bien positionné côté serveur (`clock_timestamp()`, jamais par le client — vérifié), mais la synchronisation de la source de temps est une propriété de la VM, à vérifier au déploiement. |

---

## 7. Conditions de re-passage

La porte sera rejouée **intégralement**, pas seulement sur le correctif (§1 du plan d'exécution).
Pour qu'elle soit franchissable :

1. **B-1 corrigé** — cinq contraintes d'unicité `(id, filiale_id)`, sept clés étrangères
   recomposées, **plus** un cas d'essai par clé dans `test/base/rls.test.mjs` et un contrôle dans
   `verifier_cloisonnement.sql`. Sans les tests, le correctif ne compte pas : c'est leur absence
   qui a laissé passer le défaut.
2. **M-1 corrigé** — `set search_path` sur les seize fonctions, `revoke` de `TEMPORARY` dans
   `preparer_base_dev.sh`, et un test qui constate que `grc_app` n'a pas ce privilège.
3. **M-2 et M-3 arbitrés** — corrigés, ou explicitement reportés à L3/L4 avec la décision écrite
   dans `CONVENTIONS.md`. Un report assumé et daté est acceptable ; un silence ne l'est pas.
4. **m-1 à m-6** — traitables dans la vague 2, à condition d'être inscrits. m-2 (virgule dans
   `id_metier`) gagne à être fermé maintenant, tant que le domaine n'est pas déployé.

Le reste du travail de la vague 1 n'appelle aucune reprise.

---

*Rapport établi par l'agent SECU, en lecture seule sur le dépôt. Aucun fichier du code livré n'a
été modifié ; les bases et scripts d'essai vivent hors du dépôt. Base d'audit `grc_audit`
conservée en l'état — son journal porte à demeure les deux anomalies de M-1, qui en sont la
preuve.*
