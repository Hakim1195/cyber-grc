# Cyber GRC Groupe — serveur applicatif

> Guide d'exploitation. Le cadrage complet du projet vit dans
> [`../docs/PLAN_SERVEUR.md`](../docs/PLAN_SERVEUR.md), qui fait autorité.
> La **conduite** du chantier — vagues, portes de sécurité, définition de
> « terminé » — vit dans [`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md).
> Conventions de schéma : [`db/CONVENTIONS.md`](db/CONVENTIONS.md).

**État : lot L0 livré ; lot L1 livré. La porte de sécurité S1 a été jouée
plusieurs fois et est en cours de re-passage** — le verdict de chaque passage vit
dans le journal des portes du [plan d'exécution](../docs/PLAN_EXECUTION.md) §7, et
les rapports dans [`../docs/securite/`](../docs/securite/). Voir « Avancement » en
fin de document.

---

## 1. Ce que c'est

Le serveur applicatif de Cyber GRC en édition Groupe : API REST multi-filiales,
adossée à PostgreSQL, authentifiée sur l'Active Directory du groupe.

Contraintes de déploiement, imposées par le client :

- **Debian 13, sans conteneur** — service systemd natif, durci.
- **Apache2 en frontal**, seul point d'entrée. PostgreSQL et ClamAV n'écoutent
  que sur la boucle locale.
- **Aucune exposition Internet** : accès par VPN site-à-site ou VPN client.
- **HTTPS obligatoire**, certificat émis par la PKI interne.

## 2. Installation

```bash
sudo bash deploy/install.sh
```

Le script est idempotent. Au premier passage il crée `/etc/cyber-grc/env` à partir
de `.env.example`, **y engendre les secrets internes**, puis **s'arrête** tant que
manquent les valeurs qu'il ne peut pas inventer : renseignez-les, puis relancez.

### Ce que le script engendre, et ce que vous renseignez

La distinction compte, parce qu'elle dit exactement ce qui reste à faire à
l'exploitant après le premier passage.

| Secret | Origine |
|---|---|
| `BASE_MOT_DE_PASSE`, `BASE_MOT_DE_PASSE_PROPRIETAIRE`, `BASE_MOT_DE_PASSE_LECTURE` | **engendrés** par le script (aléa de 32 octets), jamais affichés |
| `SESSION_SECRET` | **engendré** par le script |
| `LDAP_MOT_DE_PASSE_SERVICE`, `SMTP_MOT_DE_PASSE` / `SMTP_OAUTH_CLIENT_SECRET`, `AUTH_COMPTE_SECOURS_EMPREINTE` | viennent de **votre** système d'information : renseignés à la main |
| `SERVEUR_URL_PUBLIQUE`, `LDAP_URL`, `LDAP_BASE_RECHERCHE`, `LDAP_DN_SERVICE`, `SMTP_HOTE` | valeurs propres au déploiement : renseignées à la main |

Le script ne peut pas inventer ce qui vient d'un autre système : il liste les
variables manquantes et sort en code 2. Les secrets internes, eux, sont déjà
engendrés à ce moment-là — relancer ne les régénère pas.

Aucun secret n'est versionné dans le dépôt, ni affiché, ni passé en argument de
commande : un mot de passe sur la ligne de commande de `psql` est lisible par `ps`
depuis n'importe quel compte de la machine.

### Options

| Option | Effet |
|---|---|
| `--maj` | mise à jour applicative seule : ni dépôts, ni paquets |
| `--seulement-base` | s'arrête après les rôles, la base et les migrations — ni code, ni service, ni frontal. C'est la façon recommandée d'appliquer les migrations (§5) |
| `--reprendre-propriete` | **destructif, à n'employer que si le script le demande** : rend la base et ses objets à `grc_proprietaire` quand une installation antérieure les avait laissés au compte du service (§5) |
| `--reinitialiser-mots-de-passe` | réécrit le mot de passe des trois rôles PostgreSQL existants, quand le fichier de configuration a été perdu |
| `--aide` | la liste complète |

| Variable d'environnement | Effet |
|---|---|
| `CYBER_GRC_HORS_LIGNE=1` | n'appelle pas le registre npm : reprend `node_modules` et `dist` depuis l'arborescence source, préparés en amont sur une machine raccordée. **C'est le mode attendu sur une VM sans accès sortant** — le script échoue explicitement si l'un des deux manque |
| `CYBER_GRC_CONFIG=<répertoire>` | déplace `/etc/cyber-grc` (recette et essais du script) |
| `PGSUPERUTILISATEUR=<rôle>` | compte superutilisateur PostgreSQL (défaut : `postgres`) |

Mise à jour applicative seule, sans toucher aux paquets :

```bash
sudo bash deploy/install.sh --maj
```

**Avant toute montée de version : prenez un instantané Proxmox.** C'est le
filet de retour arrière prévu au plan, et il coûte quelques secondes.

## 3. Arborescence à l'exécution

| Chemin | Contenu | Droits |
|---|---|---|
| `/opt/cyber-grc/backend` | Code compilé | `root:root` |
| `/opt/cyber-grc/frontend` | SPA servie par Apache | `root:root` |
| `/etc/cyber-grc/env` | Secrets et configuration | `root:cyber-grc` 0640 |
| `/var/lib/cyber-grc/pieces-jointes` | Magasin de pièces jointes | `cyber-grc` 0700 |
| `/var/lib/cyber-grc/quarantaine` | Fichiers rejetés par ClamAV | `cyber-grc` 0700 |
| `/var/log/cyber-grc` | Journaux techniques | `cyber-grc` 0750 |
| `/var/backups/cyber-grc` | Sauvegardes | `root` 0700 |

`/etc/cyber-grc/env` est le **seul** chemin de configuration que connaisse le code
(`src/config/index.ts`, `.env.example`, `EnvironmentFile=` de l'unité systemd). Le
nom historique `serveur.env` n'est plus lu par personne ; `install.sh` le renomme
automatiquement s'il le trouve, et le signale — un fichier édité mais lu par
personne est un piège silencieux.

Deux fichiers Apache, à deux endroits différents parce qu'ils n'ont pas la même
portée :

| Fichier livré | Destination | Rôle |
|---|---|---|
| `deploy/apache/cyber-grc.conf` | `/etc/apache2/sites-available/` (`a2ensite cyber-grc`) | le vhost : TLS, mandataire inverse vers Node, en-têtes de la réponse |
| `deploy/apache/durcissement-global.conf` | `/etc/apache2/conf-available/cyber-grc-durcissement.conf` (`a2enconf cyber-grc-durcissement`) | durcissement de **portée serveur** : `ServerTokens`, `TraceEnable`, `FileETag`, garde-fous contre les connexions lentes |

Le second n'est pas un doublon du premier : Apache n'accepte pas ces directives
dans un `VirtualHost`. Sans lui, le vhost pose de bons en-têtes mais la bannière
`Server:` continue d'annoncer les versions d'Apache et d'OpenSSL.

Le magasin de pièces jointes est en `0700` et **hors de l'arborescence web** :
Apache ne le sert jamais. Les fichiers ne sont délivrés que par l'application,
après contrôle des droits. `install.sh` et le serveur refusent tous deux de
démarrer si ce chemin passe sous `CHEMIN_FRONTEND`.

## 4. Exploitation courante

```bash
systemctl status cyber-grc          # état
journalctl -u cyber-grc -f          # journaux en direct
systemctl restart cyber-grc         # redémarrage (arrêt propre, drainage)
curl -fsS http://127.0.0.1:3001/api/sante
```

Le service intercepte `SIGTERM` et draine ses connexions avant de sortir
(`SERVEUR_DELAI_ARRET`). Ne le tuez pas avec `-9`.

## 5. Base de données

### Appliquer les migrations

```bash
sudo bash deploy/install.sh --seulement-base
```

C'est la voie recommandée : le script fournit à l'exécuteur l'environnement dont
il a besoin, et s'arrête avant de toucher au code, au service et au frontal.

**`node db/migrate.mjs` lancé seul ne marche pas.** L'exécuteur exige
`BASE_UTILISATEUR_PROPRIETAIRE` et `BASE_MOT_DE_PASSE_PROPRIETAIRE` dans son
environnement, et sort en code 2 sinon :

```
 ERR Configuration incomplète :
     BASE_UTILISATEUR_PROPRIETAIRE : non renseigné. Les migrations s'appliquent
     avec le compte propriétaire (grc_proprietaire), jamais avec le compte
     applicatif — c'est la couche 4 de la garantie d'ajout seul du journal
     (CONVENTIONS.md §12).                                        [code de sortie 2]
```

Pour l'appeler à la main (diagnostic, recette), donnez-lui la configuration du
service :

```bash
cd /opt/cyber-grc/backend
set -a; . /etc/cyber-grc/env; set +a
node db/migrate.mjs --verifier       # n'écrit rien : dit ce qui reste à appliquer
node db/migrate.mjs                  # applique ce qui manque
node db/migrate.mjs --jusqu-a 002    # s'arrête après la migration 002 (recette)
```

Les migrations sont versionnées et **transactionnelles** (chaque fichier porte son
`begin`/`commit` : il s'applique entièrement ou pas du tout). Le suivi de ce qui
est appliqué vit dans `migrations_schema`, avec l'**empreinte SHA-256** de chaque
fichier : rejouer l'exécuteur sur une base à jour ne fait rien, mais si un fichier
déjà appliqué a été modifié depuis, l'exécuteur s'arrête (code 4) au lieu de
produire deux bases divergentes prétendant porter le même schéma.

Nuance à connaître : cette idempotence est celle de **l'exécuteur**. Passer un
fichier de migration directement à `psql` une seconde fois échoue, et c'est
délibéré (`db/CONVENTIONS.md` §13) — mieux vaut un échec bruyant qu'un `create
table if not exists` qui masque une divergence.

### Le schéma obtenu est contrôlé, pas seulement les migrations appliquées

Des migrations qui passent ne prouvent pas que le schéma est conforme : une base
peut avoir été retouchée à la main, ou une migration peut avoir oublié une
politique. `db/migrate.mjs` **et** `deploy/install.sh` appellent donc tous deux, en
fin de parcours, **`f_verifier_schema()`** — et rien d'autre.

C'est un **point d'appel unique**, et c'en est tout l'intérêt : la fonction ne récite
pas une liste de contrôles, elle les **découvre dans le catalogue**. Est joué tout ce
qui, dans le schéma `public`, s'appelle `f_verifier_<quelque chose>`, ne prend aucun
argument et rend `(objet, anomalie, detail)`. Respecter cette convention d'écriture
suffit à être branché : **un garde-fou neuf arrive sur le déploiement sans qu'aucun
fichier de déploiement change** (`db/CONVENTIONS.md` §19.4 et §19.5).

Un schéma sain ne renvoie **aucune ligne** ; la moindre ligne rendue fait échouer le
chemin appelant. Quatre contrôles sont branchés aujourd'hui — couverture RLS, chemin
de recherche des fonctions, traçabilité à l'insertion, unicités cloisonnées :

```bash
psql -d cyber_grc -c 'select * from f_verifier_schema();'   # 0 ligne = conforme
```

Deux garde-fous du point d'appel méritent d'être connus : une fonction **absente**
(base antérieure à la migration qui la pose) est un avertissement, pas un échec —
sans quoi le contrôle empêcherait de migrer les bases qu'il protège ; une fonction
**présente mais injouable** est un échec, parce qu'une question restée sans réponse
n'est pas une réponse rassurante. Et si la découverte ne trouve *rien*, elle le dit :
un point d'appel muet rendrait « aucune anomalie » sur une base entièrement sabotée.

Portée à ne pas surestimer (`db/CONVENTIONS.md` §17.5) : ces contrôles lisent des
**déclarations** et le **texte** des prédicats, pas leur sens. Ce qui mord sur le sens,
ce sont les tests de comportement (`npm test`) et la démonstration de cloisonnement
ci-dessous.

### Codes de sortie de `db/migrate.mjs`

Ils sont distincts pour qu'un script appelant puisse les traiter séparément.

| Code | Signification |
|---|---|
| `0` | schéma à jour (rien à faire, ou tout appliqué avec succès) |
| `1` | erreur d'utilisation (option inconnue, valeur de `--jusqu-a` invalide) |
| `2` | configuration incomplète (compte propriétaire absent) |
| `3` | connexion à PostgreSQL impossible |
| `4` | divergence d'empreinte : une migration appliquée a été modifiée depuis |
| `5` | répertoire de migrations invalide (nom hors convention, numéro en double) |
| `6` | échec d'application d'une migration |
| **`7`** | **migrations passées, schéma NON CONFORME** : `f_verifier_schema()` remonte une anomalie |
| `10` | `--verifier` : des migrations restent à appliquer (informatif, pas une panne) |

Le `7` est le seul qui dise « les migrations sont passées **et** le résultat n'est pas
bon ». Il ne se rattrape pas tout seul : sur une base à jour, les migrations ne sont
pas rejouées, donc leur contrôle de fin ne s'exécute plus. C'est précisément pourquoi
`install.sh` rejoue le sien à **chaque** passage.

### Trois rôles PostgreSQL, et pourquoi

| Rôle | Usage | Privilèges |
|---|---|---|
| `grc_proprietaire` | applique les migrations ; **propriétaire** de la base et des objets | DDL |
| `grc_app` | compte du service systemd | `select`, `insert`, `update`, `delete` — **sauf** `journal_audit` (`select` et `insert` seuls) et `migrations_schema` (`select` seul) ; ni DDL, ni `bypassrls`, ni `superuser` |
| `grc_lecture` | supervision, exports d'exploitation | `select` |

Cette séparation n'est pas une commodité d'exploitation, c'est la réponse à une
question d'audit. L'ajout seul du journal repose sur quatre couches cumulatives
(`db/CONVENTIONS.md` §12) dont la quatrième est **« le rôle applicatif n'est pas
propriétaire de la table »** : seul le propriétaire peut
`alter table … disable trigger`. Si la base appartient au compte du service, une
API compromise désarme les déclencheurs et réécrit le journal — et la réponse à
« le RSSI peut-il modifier le journal ? » (`PLAN_SERVEUR` §1.7) devient « oui ».

`install.sh` vérifie explicitement cette propriété en fin de parcours et **échoue**
si elle n'est pas celle attendue. Une installation antérieure qui aurait laissé la
base au compte du service se corrige par `--reprendre-propriete`.

Ce que cette garantie **ne** couvre **pas**, et qu'il faut dire : `root` sur la VM
et un superutilisateur PostgreSQL peuvent désactiver un déclencheur. Le journal
protège contre l'application et contre l'administrateur *applicatif* — pas contre
le DBA système. C'est là qu'intervient le chaînage par empreinte, qui rend une
altération par accès direct **détectable** à défaut d'être impossible.

### Deux propriétés à ne jamais casser

1. **Cloisonnement par filiale** — la Row Level Security de PostgreSQL filtre
   sur le périmètre de la session, positionné par le serveur et *jamais* par
   une valeur transmise par le navigateur. Un oubli de filtre dans le code ne
   peut donc pas provoquer de fuite entre filiales. La RLS est activée **et
   forcée** sur toutes les tables, propriétaire compris.
2. **Journal d'audit en ajout seul** — tout `UPDATE` et tout `DELETE` sur
   `journal_audit` sont refusés par la base, y compris au rôle applicatif. Une
   entrée erronée ne se corrige pas : on en ajoute une nouvelle.

### Le démontrer en audit

**Journal en ajout seul.** Sous le compte propriétaire, c'est le déclencheur qui
répond :

```
$ psql -U grc_proprietaire -d cyber_grc -c "update journal_audit set action = 'falsifie';"
ERROR:  Table journal_audit en ajout seul : opération UPDATE refusée.
HINT:   Une entrée de journal ne se corrige pas : ajoutez une nouvelle entrée
        décrivant la correction. Voir backend/db/CONVENTIONS.md §12.
```

Sous le compte de l'application, le refus arrive un cran plus tôt — le privilège
n'existe simplement pas : `ERROR: permission denied for table journal_audit`. Les
deux réponses sont bonnes ; ce sont les couches 1 et 2 du §12.

**Chaînage intact.** Un journal sain ne renvoie aucune ligne :

```sql
select * from f_journal_audit_verifier();      -- vérification intégrale
select * from f_journal_audit_verifier(150000); -- contrôle rapide des entrées récentes
```

**Cloisonnement par filiale.** Il ne s'affirme pas, il se joue — de préférence avec
le compte de l'application, puisque c'est de lui que parle la question d'audit :

```bash
PGPASSWORD=… psql -h 127.0.0.1 -U grc_app -d cyber_grc \
    -v ON_ERROR_STOP=1 -f db/verifier_cloisonnement.sql
```

Le script monte deux filiales de démonstration, puis rend un tableau de **93
contrôles** avec pour chacun l'attendu, l'obtenu et son verdict : lecture, écriture,
liaisons, clés étrangères et unicités, mesures du socle Groupe, périmètre d'écriture,
journal, traçabilité à la création, privilèges du rôle applicatif, couverture de la
RLS. Si un seul contrôle échoue, il lève une exception et sort en erreur — un
cloisonnement rompu ne peut pas passer pour un succès. Tout se joue dans une seule
transaction close par un `rollback` : **il n'écrit rien de durable** et peut donc
être joué sur la production, même si la recette reste le bon endroit pour une
démonstration devant témoin.

#### ⚠️ Aucun chemin d'installation ne le joue, et c'est délibéré

`db/verifier_cloisonnement.sql` **n'est appelé ni par `install.sh`, ni par
`migrate.mjs`**. Ce n'est pas un oubli : c'est un **geste de recette**, à jouer une
fois avant la mise en service puis annuellement, exactement comme le test de
restauration des sauvegardes (`db/CONVENTIONS.md` §18.5).

Deux dispositifs, deux natures, et les confondre les affaiblirait tous les deux :

| | `f_verifier_schema()` | `db/verifier_cloisonnement.sql` |
|---|---|---|
| Ce que c'est | des **fonctions de la base** | un **script de démonstration** |
| Ce qu'il lit | le **texte** des politiques, la déclaration du chemin de recherche | le **comportement** : on écrit, on lit, on compte |
| Quand | à **chaque migration et à chaque installation**, et fait échouer | à la **recette**, avant mise en service puis annuellement |
| Ce qu'il attrape | une table sans politique, un `force` absent, un chemin non figé | une politique dont le texte est juste et le sens faux |

La raison de ne pas le brancher sur l'installation est dans sa nature même : il
**sème des données de démonstration** pour éprouver un comportement. Sa place est là
où l'on éprouve aussi la restauration d'une sauvegarde et l'envoi des courriels — et
il est **jouable devant un auditeur**, ce qui est sa raison d'être. Le message d'échec
des garde-fous du schéma le cite d'ailleurs comme l'étape suivante.

**Banc d'essai.** Sur un poste de développement ou une recette :

```bash
bash db/dev/preparer_base_dev.sh   # rôles + base + migrations, une seule fois
npm test                           # 306 tests (socle, RLS, reprise grc-backup)
npm run verifier-types             # TypeScript en mode strict
```

`npm test` crée et détruit une base neuve par fichier de test, en appelant le vrai
`db/migrate.mjs` : le banc d'essai éprouve donc aussi l'outil de migration.

## 6. Sauvegarde et restauration

| Niveau | Dispositif | Perte maximale |
|---|---|---|
| Base | Archivage continu des WAL vers un stockage distinct | quelques minutes |
| Pièces jointes | Synchronisation horaire vers un second emplacement | 1 heure |
| Ensemble | Sauvegarde Proxmox intégrale de la VM, quotidienne | 24 h (filet) |

### ⚠️ Une sauvegarde logique se prend avec un superutilisateur

`force row level security` s'applique **aussi au propriétaire des tables**. La
conséquence n'est pas intuitive, et c'est exactement le genre de piège qui ne se
découvre qu'à la restauration :

| Commande | Résultat |
|---|---|
| `pg_dump -U grc_proprietaire …` | **échoue** — `query would be affected by row-level security policy` |
| `pg_dump -U grc_proprietaire --enable-row-security …`, sans périmètre déclaré | échoue aussi, sur `GRC04` (le garde-fou de périmètre, `CONVENTIONS.md` §11) |
| `pg_dump -U grc_proprietaire --enable-row-security …`, **avec** un périmètre déclaré (`PGOPTIONS`, `alter role … set`) | **réussit en code 0 — et la sauvegarde est silencieusement partielle** : elle ne contient que les filiales du périmètre |
| `pg_dump -U postgres …` (superutilisateur) | complète |

Le troisième cas est le dangereux : aucune erreur, aucun avertissement, un fichier
d'apparence normale — et des filiales entières absentes. **Les sauvegardes logiques
se prennent avec un superutilisateur PostgreSQL**, jamais avec `grc_proprietaire`,
et `--enable-row-security` n'a aucune raison d'apparaître dans un script de
sauvegarde.

La sauvegarde **physique** (archivage des WAL, instantané Proxmox) n'est pas
concernée : elle copie des fichiers, pas des lignes.

### Cohérence et restauration

⚠️ **Base et pièces jointes doivent être restaurées à un point cohérent entre
elles**, faute de quoi des enregistrements référencent des fichiers absents.
L'application affiche alors la pièce comme indisponible et le journalise,
plutôt que d'échouer — mais l'incohérence reste à éviter.

**La restauration se teste** : une fois avant la mise en service, puis
annuellement. Sur un outil qui héberge le PCA du groupe, une sauvegarde jamais
restaurée n'est pas une sauvegarde.

## 7. Recette

L'environnement de recette est une seconde VM à l'identique, avec deux règles
non négociables : il est alimenté par une **copie réaliste de la production**
(tester sur une base vide ne révèle rien), et il est **incapable d'envoyer des
courriels** — `SMTP_ACTIF=non` ou `SMTP_REDIRECTION_RECETTE` vers une boîte de
test. L'erreur classique est la campagne de relances partie de la recette vers
vingt filiales.

Les booléens de configuration s'écrivent `oui` / `non` (`.env.example` fait foi).

## 8. Avancement

État réel des lots, **au 31/08/2026**. La **conduite** du chantier — découpage en
vagues, portes de sécurité, définition de « terminé » — vit dans
[`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md) ; le **quoi** vit dans
`../docs/PLAN_SERVEUR.md` §7.

| Lot | État |
|---|---|
| **L0 — Socle d'infrastructure** | ✅ **livré** |
| **L1 — Schéma relationnel** | ✅ **livré**, puis corrigé au fil de la porte **S1**, jouée plusieurs fois et **en cours de re-passage**. Verdicts : journal des portes du [plan d'exécution](../docs/PLAN_EXECUTION.md) §7 |
| L2 — API et bascule de la persistance | ⬜ à faire (vague 2) |
| L3 — Authentification AD et droits · L5 — Journal | ⬜ à faire (vague 3) |
| L4 → L15 | ⬜ à faire — voir `../docs/PLAN_EXECUTION.md` §3 et `../docs/PLAN_SERVEUR.md` §7 |

**Livré n'est pas validé.** Le lot L1 a été soumis à la porte S1 à plusieurs
reprises ; chaque passage a produit des correctifs, et les arbitrages qui en
découlent sont figés dans `db/CONVENTIONS.md` §17, §18 et §19. Le verdict de chaque
passage est consigné dans le journal des portes du plan d'exécution, avec le rapport
correspondant dans [`../docs/securite/`](../docs/securite/) — **c'est là qu'il faut
le lire, et nulle part ailleurs**. Un re-passage est en cours au moment où ces lignes
sont écrites : aucun verdict n'en est annoncé ici.

### Fait et vérifié en exécution

Les chiffres ci-dessous ont été **rejoués** sur une base neuve (`db/dev/preparer_base_dev.sh
--recreer`, PostgreSQL 16.13) au moment de la rédaction, pas repris d'un rapport.

- **Socle applicatif** : squelette Node 22 / TypeScript, configuration validée au
  démarrage (échec explicite si une variable requise manque), pool PostgreSQL
  positionnant le périmètre de session, serveur avec point de santé et arrêt propre.
  `npm run verifier-types` passe en mode strict.
- **Schéma relationnel — 47 tables**, appliquées de bout en bout sur base neuve par
  `db/migrate.mjs` :
  - `001_socle.sql` — 16 tables : filiales, utilisateurs, sessions, groupes AD,
    profils, journal d'audit chaîné, pièces jointes, approbations, référentiels
    activés, imports, paramètres, registre des migrations.
  - `002_metier_noyau.sql` — 9 entités (clients, personnes, exigences,
    **`mesure_catalogue`** et **`mesure_mise_en_oeuvre`**, évaluations, risques,
    actifs, processus) et 5 liaisons n-n.
  - `003_metier_operations.sql` — 13 entités (actions, incidents, crise, PCA/PRA,
    MCO, prestataires, audits, revues, documents, traitements RGPD, correspondances,
    historique) et 4 liaisons.
  - `004_rls.sql` — privilèges, **188 politiques**, RLS **activée et forcée sur les
    47 tables**, déclencheurs de cohérence, et garde-fous du schéma.
- **Actions référentielles — relevées dans `pg_constraint`, pas dans le texte des
  migrations.** Sur 71 clés étrangères : **43 en `restrict`, 27 en `cascade`, une
  seule en `set null`**.

  | Clé | Action | Pourquoi |
  |---|---|---|
  | `actions` → `exigences`, `risques`, `evaluations`, `incidents` | `cascade` | l'action corrective disparaît avec ce qu'elle corrigeait (`CONVENTIONS.md` §8) |
  | `tests_pra` → `scenarios_pra` | `cascade` | un test n'existe pas sans son scénario |
  | `actif_dependances` → `actifs` (deux sens) | `cascade` | les liens de cartographie sont purgés des deux côtés |
  | `incidents.risque_id` → `risques` | `set null` | **la seule** du schéma : l'incident survit au risque |
  | `actions.mesure_id` → `mesure_catalogue` | **`restrict`** | ⚠️ **pas `set null`** — §17.6 |
  | `evaluation_mesures`, `traitement_mesures`, `mesure_mise_en_oeuvre` → `mesure_catalogue` | **`restrict`** | idem |
  | `personnes.utilisateur_id` → `utilisateurs` | **`restrict`** | §18.2 |

  Les quatre premières lignes sont bien celles du produit navigateur. Les
  suivantes **amendent le §8** et méritent d'être comprises avant d'être relues comme
  une gêne : en contexte de groupe, un `set null` ou un `cascade` déclenché depuis le
  niveau **Groupe** réécrit les lignes de vingt filiales — il incrémente leur
  `version` et y inscrit le nom de quelqu'un qui n'y a jamais travaillé, dans des
  lignes que l'auteur ne peut même pas lire. Supprimer un contrôle du socle que des
  filiales ont évalué est donc **refusé** ; le contrôle **s'archive**
  (`mesure_catalogue.statut = 'archivee'` + `archive_le`), reste lisible et reste
  rattaché à tout ce qui le référence. Délier est un geste explicite, fait dans le
  périmètre de celui qui le fait.
- **Clés étrangères et unicités composites** : quand l'enfant et le parent sont tous
  deux cloisonnés, la clé porte `(référence, filiale_id)` et vise une unicité
  `uq_<parent>_id_filiale` — **11 clés composites, 9 unicités** de cette forme. Une
  clé étrangère simple aurait été satisfaite par une ligne **invisible** de la
  filiale voisine : les contrôles d'intégrité de PostgreSQL contournent délibérément
  la RLS (`CONVENTIONS.md` §17.1, étendu aux unicités par le §19.1).
- **Traçabilité imposée à la création** : les **42 tables** portant `cree_par`
  reçoivent un déclencheur `before insert` qui impose `version`, `cree_le` et
  `cree_par` — ce que le client envoie dans ces colonnes est ignoré (`CONVENTIONS.md`
  §18.1). Sans lui, une ligne créée au nom d'un directeur général qu'on n'est pas
  devenait une pièce d'audit inattaquable.
- **Garde-fous du schéma branchés** : `f_verifier_schema()` est appelée par
  `db/migrate.mjs` **et** par `deploy/install.sh`, et fait échouer les deux. Elle
  **découvre** ses contrôles dans le catalogue — 4 aujourd'hui (couverture RLS,
  chemin de recherche, traçabilité, unicités cloisonnées) — de sorte qu'un garde-fou
  neuf s'y branche sans qu'aucun fichier de déploiement change (§5, `CONVENTIONS.md`
  §19.4). Sur base neuve : **0 anomalie**.
- **Cloisonnement démontré** : `db/verifier_cloisonnement.sql` joué avec `grc_app`,
  **93 contrôles, 93 réussis, 0 échec**, transaction annulée par `rollback`.
- **Inaltérabilité du journal prouvée** : `UPDATE` refusé par le déclencheur sous le
  compte propriétaire, refusé par les privilèges sous le compte applicatif
  (`grc_app` n'a que `select` et `insert` sur `journal_audit`, `select` seul sur
  `migrations_schema`) ; `f_journal_audit_verifier()` ne renvoie rien.
- **Banc d'essai** : **306 tests** `node:test`, 0 échec — **229 sur la base** (socle,
  journal, verrouillage optimiste, RLS, privilèges, garde-fous) et **77 sur la
  reprise**. Chaque fichier monte une base neuve **en appelant le vrai
  `db/migrate.mjs`** : l'outil de migration est éprouvé en même temps que le schéma.
- **Reprise des exports `grc-backup`** (`src/reprise/**`) : portage serveur des
  migrations v1 → v12, lecture d'enveloppe, scission des mesures
  catalogue / mise en œuvre, refus explicite d'une enveloppe chiffrée, round-trip
  exact des identifiants, entrées hostiles bornées en taille et en nombre de nœuds.
  Module pur : il n'écrit ni en base, ni sur le disque.
- **Outillage** : `db/migrate.mjs` (ordre déterministe, empreinte SHA-256, compte
  propriétaire imposé, contrôle de conformité du schéma, codes de sortie documentés
  — §5) et `db/dev/preparer_base_dev.sh`.
- **Déploiement** : unité systemd durcie, vhost Apache, durcissement de portée
  serveur, `install.sh` idempotent qui engendre les secrets internes, **vérifie que
  la base n'appartient pas au compte du service** et **rejoue les garde-fous du
  schéma à chaque passage**.

### Réserves — ce qui n'est pas vérifié, et ce qui est sciemment reporté

**Sur l'état du lot**

- La **porte de sécurité S1** (`../docs/PLAN_EXECUTION.md` §4) a été jouée
  plusieurs fois par des auditeurs indépendants, et **un re-passage est en cours**.
  Le lot L1 est livré ; **aucun verdict n'est annoncé ici** — il se lit dans le
  journal des portes du plan d'exécution §7 et dans les rapports de
  [`../docs/securite/`](../docs/securite/).
- Les vérifications ci-dessus ont été menées sur **PostgreSQL 16.13**, alors que la
  cible du déploiement est **PostgreSQL 17** (dépôt PGDG, `install.sh`). Aucune
  fonctionnalité postérieure à 16 n'est employée, mais l'écart reste à éprouver sur
  la VM cible.

**Sur l'environnement**

- **Rien de ce qui suit n'a pu être éprouvé** sur la machine de développement, faute
  d'environnement : l'installation Debian 13 complète, Apache, ClamAV, l'Active
  Directory et le relais SMTP. `deploy/install.sh`, les fichiers Apache et l'unité
  systemd sont **écrits et relus, pas exécutés en conditions réelles**. Leur
  première exécution sur la VM cible doit être surveillée.
- Les lots L3 (authentification), L6 (pièces jointes) et L12 (notifications) se
  recetteront sur des doublures tant que l'annuaire, ClamAV et le relais de
  messagerie du client ne sont pas accessibles.

**Dette reportée, assumée et datée** — un report écrit vaut mieux qu'un silence :

| Sujet | Décision | Échéance |
|---|---|---|
| `sessions`, `session_filiales`, `session_domaines` **écrivables sans condition** par le rôle applicatif | Circulaire et assumé : ces tables *produisent* la décision d'autorisation, elles sont lues avant que le périmètre existe. Parade actuelle : requêtes intégralement paramétrées. | **condition d'entrée du lot L3** (`CONVENTIONS.md` §17.4) |
| **La lecture du journal d'audit n'est pas cloisonnée** | Dérogation qu'impose le chaînage par empreinte (`004_rls.sql` §6). Sans effet tant que le journal est vide ; dès que L5 alimentera `valeurs_avant` / `valeurs_apres`, une session d'une filiale y lirait le contenu d'une autre — et le compte de supervision `grc_lecture` aussi. | **resserrement = livrable ferme de L5** |
| `UPDATE 0` ne distingue pas « ligne absente », « version périmée » et « écriture refusée par la RLS » | Or `GRC03` (`CONVENTIONS.md` §15) est défini comme « 0 ligne sur `update … and version = $2` » : la couche d'écriture annoncerait « modifié entre-temps, rechargez » à qui n'avait pas le droit d'écrire. | **à traiter dans la conception de L2**, pas après |
| Supprimer un compte ou une filiale cité au journal est **structurellement impossible** (`restrict` + journal en ajout seul) | Cohérent avec la rétention de trois ans, mais la « purge explicite » de sortie de filiale (`PLAN_SERVEUR` §2.7) n'a aucun chemin applicatif. | procédures d'exploitation à écrire au **lot L13**, avec les purges RGPD |
| `documents` et `document_referentiels` portent une **colonne engendrée** (`portee_groupe`) qui entre dans une clé étrangère | PostgreSQL refuse qu'on lui donne une valeur : toute insertion **nomme ses colonnes**, et un aller-retour naïf qui relit une ligne entière puis la réinsère échoue. | à respecter par **L2** (écriture) et **L7** (import), `CONVENTIONS.md` §18.6 |
| Le drapeau `grc.administration_groupe` est une **déclaration que la session fait sur elle-même**, pas un privilège | Il protège contre la faute de programmation, **pas** contre un rôle applicatif compromis, qui le poserait avant d'écrire. | la barrière réelle est le modèle de droits à trois axes du **lot L3** (`CONVENTIONS.md` §17.4) |

Enfin, ce que le dispositif **ne** couvre **pas**, et qui est assumé : ni un `root`
sur la VM, ni un superutilisateur PostgreSQL. Le journal protège contre l'application
et contre l'administrateur *applicatif* — pas contre le DBA système, pour qui le
chaînage par empreinte rend l'altération **détectable** à défaut d'impossible.
