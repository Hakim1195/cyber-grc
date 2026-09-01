# Cyber GRC Groupe — serveur applicatif

> Guide d'exploitation. Le cadrage complet du projet vit dans
> [`../docs/PLAN_SERVEUR.md`](../docs/PLAN_SERVEUR.md), qui fait autorité.
> La **conduite** du chantier — vagues, portes de sécurité, définition de
> « terminé » — vit dans [`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md).
> Conventions de schéma : [`db/CONVENTIONS.md`](db/CONVENTIONS.md).

**État : lots L0, L1 et L2 livrés. Les portes de sécurité S1 et S2 sont
franchies** — S1 « CONFIRMÉE FRANCHIE » au 6ᵉ passage, S2 « FRANCHIE » au 4ᵉ. Le
verdict de chaque passage vit dans le journal des portes du
[plan d'exécution](../docs/PLAN_EXECUTION.md) §7, et les rapports dans
[`../docs/securite/`](../docs/securite/) — c'est là qu'il se lit, et nulle part
ailleurs. Voir « Avancement » (§8) en fin de document.

> ⚠️ **Ce serveur ne sert pas encore de données ailleurs qu'en développement.**
> L'authentification est le lot L3 ; d'ici là, la session provisoire **refuse**
> de résoudre un périmètre hors de `NODE_ENV=developpement`, et l'API répond
> `503` sur toutes ses routes de données — **recette comprise** (§7). Un outil de
> gouvernance cyber sans authentification ne sert pas de données, pas même en
> lecture.

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

### Deux réglages **provisoires** apportés par le lot L2

Ils n'existent que parce que l'authentification (lot L3) n'existe pas encore, et
ils disparaîtront avec elle. Les connaître évite de chercher longtemps pourquoi
un serveur pourtant démarré répond `503`.

| Variable | Effet | Portée |
|---|---|---|
| `API_FILIALE_PROVISOIRE` | code ou identifiant de la filiale de travail de la session provisoire. Vide : la première filiale active par ordre de code, **avec un avertissement au journal à chaque résolution** — le choix appartient à l'utilisateur, et c'est le sélecteur de filiale du lot L4 qui le lui rendra | développement seulement |
| `API_ADMINISTRATION_GROUPE_PROVISOIRE` | `oui` accorde l'administration Groupe à la session provisoire : le socle commun aux vingt filiales (catalogue de mesures, correspondances, documents de portée Groupe) devient écrivable depuis cette machine. Défaut `non` | **sans effet hors développement** : le serveur refuse quoi qu'il arrive |

La règle que ces deux réglages servent, et qui vaut au-delà d'eux : **le drapeau
d'administration Groupe se décide dans le résolveur de périmètre, et nulle part
ailleurs.** Une route qui l'exige le *vérifie* ; aucune ne le *pose*. C'est ce qui
rend la règle impossible à enfreindre par oubli, et c'est la forme qu'aura le
profil *Administration* résolu depuis les groupes AD au lot L3.

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

### Le frontend déployé est **versionné à l'installation**, et il doit l'être

`install.sh` calcule une empreinte de `/opt/cyber-grc/frontend` (`jeton_frontend`,
version du paquet + SHA-256 de tous les `.js` et `.css`) et l'injecte dans chaque
URL de script et de feuille de style d'`index.html`
(`injecter_jeton_frontend`) : `js/app.js?v=0.1.0.4687f6ba1579`. Le script
**échoue** si une seule URL reste sans jeton, et il dit combien il en a versionnées.

Ce n'est pas un raffinement. Le vhost met les `.js` et `.css` en cache **sept
jours** ; `index.html`, qui porte les jetons, est en `no-cache, must-revalidate`.
Les deux réglages ne sont sûrs qu'ensemble : sans le jeton, un correctif d'urgence
resterait invisible une semaine sur les postes de vingt filiales pendant que
l'exploitant constate que « le correctif ne marche pas ». Si l'injection venait à
être retirée d'`install.sh`, il faudrait retirer `text/css` et
`application/javascript` du bloc `ExpiresByType` **dans le même changement**.

## 4. Exploitation courante

```bash
systemctl status cyber-grc          # état
journalctl -u cyber-grc -f          # journaux en direct
systemctl restart cyber-grc         # redémarrage (arrêt propre, drainage)
curl -fsS http://127.0.0.1:3001/api/sante
```

Le service intercepte `SIGTERM` et draine ses connexions avant de sortir
(`SERVEUR_DELAI_ARRET`). Ne le tuez pas avec `-9`.

### Ce que le serveur expose depuis le lot L2

Neuf routes de données, plus le point de santé. Le frontend n'en connaît pas
d'autres, et c'est `js/core/api.js` — un fichier unique — qui les appelle toutes.

| Verbe | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/sante` | point de santé (le seul qui réponde sans périmètre résolu) |
| `GET` | `/api/session` | qui suis-je, dans quelle filiale, avec quelles réserves |
| `GET` | `/api/modele` | description du modèle — champs, types, bornes ; **aucune donnée** |
| `GET` | `/api/donnees` | le jeu de données entier de la filiale, dans la forme de l'objet `data` du navigateur |
| `GET` | `/api/rafraichir` | ce qui a changé depuis un horodatage, plus le compte par collection |
| `POST` | `/api/entites/:entite` | créer — **l'identifiant est engendré par le serveur**, en proposer un est refusé |
| `PUT` | `/api/entites/:entite/:id` | modifier — **verrouillage optimiste obligatoire** |
| `DELETE` | `/api/entites/:entite/:id` | supprimer — `?version` **exigé** (une suppression relève du même risque P1) |
| `POST` | `/api/reprise` | reprendre un export `grc-backup` entier, **en une transaction**, avec aperçu |
| `POST` | `/api/operations/propager-mesure` | propagation « au plus défavorable », en une transaction |

### « Le service tourne mais l'application refuse de démarrer »

C'est le symptôme attendu tant que le lot L3 n'est pas livré, et il se
diagnostique en une commande :

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/session
```

| Réponse | Ce que cela veut dire |
|---|---|
| `503` | trois causes, que **seul le journal technique distingue** — la réponse au client, elle, reste générique : (a) refus **fail-closed**, `NODE_ENV` n'est pas `developpement` (attendu en production **et en recette**, §7) ; (b) aucune filiale active en base — créez-en une avant la mise en service ; (c) `API_FILIALE_PROVISOIRE` désigne une filiale inexistante ou inactive |
| `200` | le périmètre est résolu ; l'application peut charger `/api/donnees` |

```bash
journalctl -u cyber-grc -n 50 | grep -i 'fail-closed\|filiale'
```

Côté navigateur, l'application **ne démarre pas** sur un jeu vide quand le serveur
est injoignable : elle affiche un écran de refus avec un bouton « Réessayer ».
Démarrer quand même afficherait « aucun risque, aucune action, aucun incident » —
c'est-à-dire le contraire de la réalité, dans un outil qui sert de preuve en audit.

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
chemin appelant. **Huit contrôles sont découverts et joués** sur une base à jour —
armement des déclencheurs, chemin de recherche des fonctions, couverture RLS,
entropie du générateur d'identifiants, portée figée, privilèges du rôle applicatif,
traçabilité à l'insertion, unicités cloisonnées :

```bash
psql -d cyber_grc -c 'select * from f_verifier_schema();'   # 0 ligne = conforme

# Ce qui est réellement branché sur cette base, sans le supposer :
psql -d cyber_grc -Atc "select proname from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.proname like 'f\_verifier\_%' and p.pronargs = 0
    and pg_get_function_result(p.oid)
        = 'TABLE(objet text, anomalie text, detail text)'
    and p.proname <> 'f_verifier_schema' order by 1;"
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

Le script monte deux filiales de démonstration, puis rend un tableau de **107
contrôles** avec pour chacun l'attendu, l'obtenu et son verdict : lecture, écriture,
liaisons, clés étrangères et unicités, mesures du socle Groupe, périmètre d'écriture,
journal, traçabilité à la création, privilèges du rôle applicatif, couverture de la
RLS, catalogue partagé des correspondances (C102 à C105), champ du registre RGPD
retrouvé (C106), entropie du générateur d'identifiants (C107).
Si un seul contrôle échoue, il lève une exception et sort en erreur — un
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
npm test                           # 505 tests : base, API, reprise, navigateur
npm run verifier-types             # TypeScript en mode strict
npm audit --omit=dev               # dépendances (contrôle S15 de la grille)
```

`npm test` crée et détruit une base neuve par fichier de test, en appelant le vrai
`db/migrate.mjs` : le banc d'essai éprouve donc aussi l'outil de migration.

Quatre familles, et le détail compte parce que chacune attrape une classe de défaut
que les autres ne voient pas :

| Répertoire | Tests | Ce qu'il éprouve |
|---|---|---|
| `test/base/` | 260 | socle, journal en ajout seul et chaînage, RLS, privilèges, garde-fous du schéma, vocabulaire |
| `test/api/` | 145 | routes montées pour de vrai, verrouillage optimiste, diagnostic d'`UPDATE 0`, familles d'entités, intégrité d'écriture, route de reprise |
| `test/reprise/` | 77 | paliers v1 → v12, enveloppe, scission des mesures, round-trip, entrées hostiles |
| `test/navigateur/` | 23 | la bascule côté SPA, dans **Chromium**, contre le serveur réel (Playwright global) |

Les tests `test/navigateur/` demandent le **Playwright global**
(`/opt/node22/lib/node_modules/playwright`) et son Chromium (`/opt/pw-browsers`) —
ni l'un ni l'autre n'est une dépendance de `package.json`. Ils montent un serveur
local qui sert `cyber-gouvernance_V4/` **tel quel**, avec `/api/**` relayé vers
l'instance Fastify réelle. Ils font partie de `npm test` et se signalent, au lieu de
s'exécuter, sur une machine qui n'en dispose pas.

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

### Depuis le lot L2, le poste de travail ne sauvegarde plus rien

C'est un changement d'exploitation, pas un détail d'implémentation. La version
100 % navigateur gardait un instantané complet des données dans IndexedDB et ses
propres points de restauration ; l'édition Groupe **n'écrit plus rien sur le
poste**. Trois conséquences :

- **Le dispositif ci-dessus est le seul filet.** Il n'y a plus de copie locale à
  laquelle se raccrocher, et c'est voulu : vingt copies complètes de la
  gouvernance cyber du groupe traînant sur des postes étaient un risque, pas une
  assurance.
- **L'export `grc-backup` reste, mais ce n'est plus une sauvegarde** : c'est un
  **format d'échange** (`PLAN_SERVEUR` §2.6), pour reprendre les données d'une
  filiale déjà équipée de la version locale, ou pour les remettre à une filiale
  qui sort du groupe. Le bandeau « exportez régulièrement » a été retiré : il
  serait faux, et il encouragerait exactement ce que le droit d'export distinct
  du modèle cible cherche à encadrer (§3.3 du plan).
- **La base héritée d'un poste n'est jamais détruite par l'application.** Elle est
  détectée et signalée ; l'utilisateur choisit d'exporter puis de reprendre, et
  l'effacement demande encore une confirmation. Voir §8, « Reprise d'un poste ».

## 7. Recette

L'environnement de recette est une seconde VM à l'identique, avec deux règles
non négociables : il est alimenté par une **copie réaliste de la production**
(tester sur une base vide ne révèle rien), et il est **incapable d'envoyer des
courriels** — `SMTP_ACTIF=non` ou `SMTP_REDIRECTION_RECETTE` vers une boîte de
test. L'erreur classique est la campagne de relances partie de la recette vers
vingt filiales.

Les booléens de configuration s'écrivent `oui` / `non` (`.env.example` fait foi).

### ⚠️ La recette est fermée elle aussi, tant que L3 n'est pas livré

C'est une conséquence directe de la règle ci-dessus, et elle surprend : puisque la
recette porte une **copie réaliste de la production**, elle porte de la vraie
donnée de gouvernance de vingt filiales, sur une VM joignable par le VPN. Un
serveur sans authentification qui la servirait — et laisserait l'écrire — n'est pas
un environnement d'essai à données jetables : c'est la même fuite que sur
l'original. La porte S2 l'a relevé (constat M-5) alors que seule la production
était fermée.

Jusqu'à L3, la recette répond donc `503` sur toutes les routes de données, comme la
production. La recette fonctionnelle du lot L2 se fait **en développement**, avec
`db/dev/preparer_base_dev.sh` et une copie anonymisée si l'on veut du volume.

## 8. Avancement

État réel des lots, **au 01/09/2026**. La **conduite** du chantier — découpage en
vagues, portes de sécurité, définition de « terminé » — vit dans
[`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md) ; le **quoi** vit dans
[`../docs/PLAN_SERVEUR.md`](../docs/PLAN_SERVEUR.md) §7.

| Lot | État |
|---|---|
| **L0 — Socle d'infrastructure** | ✅ **livré** |
| **L1 — Schéma relationnel** | ✅ **livré** (vague 1), corrigé au fil de la porte **S1** — jouée six fois |
| **L2 — API et bascule de la persistance** | ✅ **livré** (vague 2), corrigé au fil de la porte **S2** — jouée quatre fois |
| L3 — Authentification AD et droits · L5 — Journal | ⬜ à faire (vague 3) |
| L4 → L15 | ⬜ à faire — voir [`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md) §3 et [`../docs/PLAN_SERVEUR.md`](../docs/PLAN_SERVEUR.md) §7 |

### Les deux verdicts, tels que le journal des portes les formule

Ils ne se déduisent pas d'ici : ils se lisent dans le journal des portes du
[plan d'exécution](../docs/PLAN_EXECUTION.md) §7, avec le rapport correspondant
dans [`../docs/securite/`](../docs/securite/). Reproduits mot pour mot :

| Porte | Verdict du journal | Rapport |
|---|---|---|
| **S1** (6ᵉ passage) | ✅ **CONFIRMÉE FRANCHIE** — 0 bloquant, 0 majeur, 6 mineurs | [`RAPPORT_S1_SEXIES.md`](../docs/securite/RAPPORT_S1_SEXIES.md) |
| **S2** (4ᵉ passage) | ✅ **FRANCHIE** — 0 bloquant, 4 majeurs, 7 mineurs, **aucun des dix-huit contrôles en échec** | [`RAPPORT_S2_QUATER.md`](../docs/securite/RAPPORT_S2_QUATER.md) |

**Franchie ne veut pas dire sans réserve.** Les constats de S2 sont ouverts,
chacun avec un **propriétaire nommé et une échéance**, dans le **registre des
constats ouverts** du [plan d'exécution](../docs/PLAN_EXECUTION.md) §7. Ce registre
n'est ni recopié ni résumé ici — pas même par un décompte : il vit, des constats s'y
ajoutent et s'y ferment, et deux listes des mêmes constats divergent en silence. Il
existe précisément parce que la vague 1 avait mesuré, chiffré et écrit un défaut de
générateur d'identifiants **sans l'attribuer à personne** — il est ressorti deux
vagues plus tard en **bloquant**.

### Fait et vérifié en exécution

Les chiffres ci-dessous ont été **rejoués** au moment de la rédaction, pas repris
d'un rapport. Point de mesure, sans lequel un chiffre est invérifiable :

| | |
|---|---|
| Révision mesurée | **`120266e`** — « Porte S2 franchie… », branche `claude/backend-plan-serveur-hj46fs`. C'est la révision **sur laquelle repose le verdict de la porte** |
| Comment | export propre de cette révision (`git archive`) monté **hors** du dépôt de travail : mesurer dans un arbre où d'autres agents écrivent ne mesure rien |
| Base | neuve, `db/dev/preparer_base_dev.sh --recreer`, **PostgreSQL 16.13** |
| Node | 22.22.2 |

```
npm run verifier-types                           → aucune erreur
npm test                                         → tests 505 · pass 505 · fail 0  (48,7 s)
                                                   base 260 · api 145 · reprise 77 · navigateur 23
npm audit --omit=dev                             → found 0 vulnerabilities
psql -U grc_app -f db/verifier_cloisonnement.sql → 107 contrôles · 107 réussis · 0 échoué
select * from f_verifier_schema()                → 0 ligne (8 garde-fous découverts et joués)
```

⚠️ **Ces chiffres datent de la fermeture de la porte, et le travail continue derrière
eux.** Les constats que S2 a laissés ouverts se ferment depuis, et le banc d'essai
grossit avec eux : au moment où ce paragraphe est écrit, il porte **des tests rouges
délibérés** — écrits pour des constats dont le correctif n'est pas encore posé. Un
banc vert n'est donc pas la seule lecture correcte pendant une fermeture de vague ;
la lecture correcte est le **registre des constats ouverts** (`../docs/PLAN_EXECUTION.md`
§7).

Ce que la fermeture a déjà fait bouger, mesuré sur une base neuve montée depuis la
révision courante de la branche :

| Grandeur | À la fermeture de S2 (`120266e`) | Pendant la fermeture des constats |
|---|---|---|
| Migrations | 4 | **5** — `005_controles_schema.sql` |
| Tables | 47 | **48** — la nouvelle est `controles_schema`, le **registre des garde-fous** : elle ferme le constat « un garde-fou qui cesse d'être découvert disparaît en silence » |
| Politiques RLS | 188 | **192** |
| Clés étrangères | 71 | 71 |
| Garde-fous découverts et joués | 8 | 8, **0 anomalie** |

**Ces chiffres seront remesurés et réécrits à l'ouverture de la vague 3**, quand la
fermeture sera close et le banc redevenu vert. Les prendre pour l'état stable serait
une erreur de lecture : ils décrivent un chantier en cours.

#### Lot L2 — l'API

- **Une couche d'accès, un moteur, un registre.** `src/entites/` sert les **21
  collections** du modèle navigateur sans les recopier : le registre ne décrit que
  ce que PostgreSQL ne sait pas (nom frontend, préfixe d'identifiant, alias de
  colonne, liaisons n-n, scission des mesures) ; colonnes, types, `not null`,
  valeurs par défaut, colonnes **engendrées** et cloisonnement sont **découverts
  dans le catalogue**. Un garde-fou recoupe les deux et **fait échouer le
  démarrage** quand le registre nomme ce que le schéma ne porte plus.
- **Verrouillage optimiste — le risque projet P1.** `update … where id = $1 and
  version = $2`. Zéro ligne = refus, jamais écrasement.
- **`UPDATE 0` est diagnostiqué, pas interprété.** C'était le piège n°1 légué par
  la vague 1 : `GRC03` se définit sur ce zéro, or ce zéro veut dire trois choses.
  `diagnostiquerEcriture()` tranche **dans la même transaction** que l'écriture qui
  a échoué, et rend cinq verdicts distincts :

  | Verdict | Réponse | Ce que voit l'utilisateur |
  |---|---|---|
  | `conflit_version` | `409` + `GRC03` + `version_actuelle` | « modifié entre-temps, rechargez » |
  | `invisible` | `404` | « ressource inconnue » |
  | `autre_filiale` | `403` | « appartient à une autre filiale : consultable, pas modifiable d'ici » |
  | `portee_groupe` | `403` | « relève de l'administration Groupe » |
  | `refus_politique` | `403` | refus de périmètre |

  Sans cette distinction, l'API enverrait recharger sa page à quelqu'un qui n'avait
  pas le droit d'écrire.
- **Le client ne fixe ni `version`, ni `cree_le`, ni `cree_par`** — deuxième piège
  de la vague 1. Ces colonnes sont **exclues par construction** en écriture, et un
  champ client qui les viserait est **refusé**, pas ignoré : ignorer aurait été le
  pire des deux mondes.
- **Les colonnes engendrées ne s'écrivent pas** — troisième piège. Toute insertion
  **nomme ses colonnes**, filtrées sur `engendree = false` : `documents.portee_groupe`
  et `document_referentiels.portee_groupe` entrent dans une clé étrangère, et
  PostgreSQL refuse qu'on leur donne une valeur.
- **`POST /api/reprise`** reprend un export `grc-backup` **entier, en une seule
  transaction**, avec un mode `apercu` qui applique puis **annule** — ce qui est
  montré est donc le vrai résultat, `check`, clés étrangères et RLS compris, et il
  ne reste rien derrière. Le serveur lit l'enveloppe et monte la charge de v1 à v12
  lui-même. Cette route remplace la rafale de `DELETE` un par un qui, avant elle,
  détruisait une filiale hors transaction.
- **L'identifiant est engendré par le serveur** à la création ordinaire : en
  proposer un est refusé, parce que le choisir donnait un **oracle d'existence
  inter-filiales** en une requête. La reprise, elle, **conserve** les identifiants
  du fichier (`identifiantImpose`, réservé à ce chemin) — voir « Reprise d'un poste »
  plus bas.
- **L'entropie du générateur est un contrôle, pas une intention.**
  `verifierRegistre()` — le point unique qui refuse déjà le démarrage du serveur quand
  registre et schéma divergent — mesure aussi la forme, le plancher d'entropie et le
  déterminisme de la ré-émission, sur 20 000 tirages. Une régression n'est donc pas
  rattrapée par la relecture : elle **empêche le service de démarrer**, exactement comme
  `f_verifier_schema()` empêche une migration d'aboutir côté base.

  ⚠️ **Ce contrôle ne couvre que le générateur du serveur.** Le produit en compte
  quatre, dans trois langages (`db/CONVENTIONS.md` §2) : celui de la base a le sien dans
  `f_verifier_schema()`, celui du navigateur n'en a pas encore. Ne pas lire cette ligne
  comme une couverture des quatre sites — c'est exactement l'erreur qui a produit le
  constat le plus coûteux de la vague : un générateur durci, gardé et démontré qui
  n'était pas celui qui écrivait.
- **Une requête = une transaction**, avec le périmètre RLS posé à l'ouverture et
  mort au `commit` ; les lectures s'ouvrent en `read only`, ce qui vaut mieux qu'une
  convention de nommage. Les opérations composites (propagation, reprise) tiennent
  dans une seule transaction : tout ou rien.
- **Le périmètre vient du serveur, et c'est tenu par la forme** : `resoudre()` ne
  prend **aucun argument**. Il n'existe donc structurellement aucun chemin par lequel
  un corps, une entête, un paramètre d'URL ou un cookie atteindrait `grc.filiale_id`
  ou `grc.filiales`.
- **Session provisoire fail-closed** (`src/api/session.ts`) : hors
  `NODE_ENV=developpement`, elle refuse de résoudre et l'API répond `503` — recette
  comprise (§7). Le point d'accroche du lot L3 est l'interface `ResolveurPerimetre` :
  L3 en fournit une autre implémentation, et **rien d'autre ne change** dans `src/api/`.

#### Lot L2 — la bascule côté navigateur

- **La façade synchrone est préservée, et c'est mesurable.** L'objet rendu par
  `DataStore` expose **130 membres** ; avant la vague 2, il en exposait **130** :
  aucun ajouté, aucun retiré, aucune signature changée. Les **118 méthodes
  distinctes** appelées depuis les modules, les services et `app.js` — **323 sites
  d'appel** — le sont à l'identique. C'est la parade au risque P3 : aucun module
  métier n'est réécrit.
- **Où l'asynchrone est absorbé** : dans `js/core/sync.js`, et là seulement —
  exactement comme `flushNow()` absorbait IndexedDB auparavant. Au démarrage, il lit
  `/api/session`, `/api/modele` et `/api/donnees` ; à chaque `save()`, il compare
  l'état en mémoire à un **instantané de référence** et n'envoie que la différence,
  enregistrement par enregistrement ; un **sondage** rapatrie le travail des autres.
- **Le numéro de version ne vit pas dans l'enregistrement.** Il est tenu dans une
  table à part, interne à `sync.js` (`versions[collection] : id → {v, vmo}`), et les
  champs `_version` / `_versionMiseEnOeuvre` sont retirés des enregistrements dès
  leur réception. Motif : `data` garde exactement la forme que les modules et
  l'export `grc-backup` connaissent, et **un module qui reconstruit un objet ne peut
  donc pas perdre la version au passage** — ce serait une porte ouverte au risque P1.
- **Un refus d'écriture produit toujours quelque chose de visible.** Un refus avalé
  en silence laisserait l'utilisateur croire sa saisie enregistrée : ce serait le
  même défaut, déplacé d'un cran. `conflit_version` et `ressource_inconnue`
  conservent la saisie, la marquent et proposent **Recharger** ; `hors_perimetre`
  ne propose **aucun** rechargement — c'est un refus de droit, il n'y a rien à
  recharger ; une panne réseau ne marque rien et réessaie.
- **Les 26 modules métier ont bien été modifiés — mais pas par la bascule.** Deux
  causes, d'une autre nature :
  1. **Conversion des gestionnaires en ligne** (`onclick=…` → `addEventListener`) :
     64 gestionnaires dans 23 modules étaient **bloqués par la politique de sécurité
     de contenu du vhost livré**. L'application ne fonctionnait pas dans sa
     configuration de déploiement, et aucun test ne l'avait vu. Assouplir la CSP
     aurait annulé la défense principale ; la conversion était la seule issue.
  2. **Deux injections HTML antérieures**, trouvées en chemin et corrigées : le nom
     d'un risque dans le panneau de détail de la matrice, le nom d'un client dans le
     sélecteur de donneur d'ordre.

  Contrôlé mécaniquement : hors `settings.js`, **l'ensemble des appels `DataStore.*`
  des modules est inchangé, méthode par méthode et compte par compte**. `settings.js`
  perd six appels — points de restauration locaux et chiffrement du navigateur — parce
  que ces fonctions n'existent plus (voir ci-dessous).
- **Une convention de codage en découle**, et elle est inscrite dans `CLAUDE.md` §3 :
  **l'identifiant d'un enregistrement se lit dans un attribut du DOM au moment du
  clic, jamais capturé en chaîne dans une fermeture.** Le serveur réattribuant
  l'identifiant à la création, une fermeture qui a capturé l'ancien vise ensuite un
  enregistrement qui n'existe plus — en silence. `recalerBalisage()` répare le
  balisage déjà rendu, mais la réparation ne tient que si la convention est respectée.

#### Où vivent les données, maintenant

C'est la question que se pose toute session qui reprend, et la réponse a changé.

| | Avant (produit navigateur) | Depuis le lot L2 |
|---|---|---|
| Source de vérité | IndexedDB `cyber-grc-db`, store `kv` | **PostgreSQL**, sur le serveur |
| Points de restauration | store `backups`, sur le poste | sauvegarde du serveur (§6) |
| Chiffrement au repos | coffre opt-in du navigateur (PBKDF2 + AES-GCM) | **chiffrement disque de la VM** — le coffre a été retiré : il ne protégeait plus rien |
| `localStorage` | instantané de secours, `cyber-context`, `cyber-vault` | **purgés au démarrage** (`js/core/session.js`) |
| Export `grc-backup` | sauvegarde | **format d'échange** (§6) |

Ce qui subsiste d'IndexedDB, et rien d'autre : `js/core/persistence.js` sait encore
**lire** la base héritée d'un poste, en lecture seule, sans jamais provoquer de
migration. `idbAvailable()` rend désormais `false` **définitivement**, ce qui fait
emprunter partout le chemin « pas de stockage local ». `js/core/vault.js` est
neutralisé mais conservé : il est la **porte de démarrage** appelée par `js/app.js`
et par `js/modules/settings.js`, deux fichiers d'un autre périmètre — supprimer
l'objet `Vault` aurait rendu l'application impossible à démarrer.

#### Reprise d'un poste — ce qui se passe exactement

Le chemin de reprise d'une filiale déjà équipée de la version locale
(`PLAN_SERVEUR` §2.6) est : **exporter depuis l'ancienne version, reprendre dans la
nouvelle**. Rien ne défendait cet ordre — la simple ouverture de la nouvelle
adresse effaçait `cyber-grc-db`, **y compris quand le serveur était injoignable et
que l'application refusait de démarrer**. La règle tenue désormais :

> **Rien n'est effacé de ce poste sans un geste explicite de l'utilisateur, et
> jamais avant que ses données aient été mises à l'abri.**

Concrètement : la base héritée est **détectée**, jamais touchée ; un bandeau la
signale après une connexion réussie et propose, dans cet ordre, **d'exporter** puis
**de reprendre** ; le bouton d'effacement n'apparaît qu'une fois l'une des deux
faites, et demande encore confirmation. Un instantané chiffré par l'ancien coffre
est illisible ici — on le dit, et **on n'efface rien**.

Ce que la reprise fait, quand on la rejoue :

- elle est **transactionnelle** : `remplacer` comme `fusionner` réussissent
  entièrement ou pas du tout, et un `apercu` n'écrit rien ;
- elle **conserve les identifiants** du fichier — c'est ce qui rend le round-trip
  exact, et c'est le seul chemin du produit autorisé à imposer un identifiant. Une
  exception, et une seule : quand l'identifiant est **déjà pris dans le domaine global
  par une ligne d'une filiale que l'appelant ne voit pas**, le serveur en retient un
  autre et **réécrit toutes les références** de la charge qui le visaient — références
  découvertes dans le graphe des clés étrangères, pas énumérées ;
- **cet identifiant de remplacement n'est pas tiré au hasard : il est dérivé** d'une
  empreinte de `(filiale, table, identifiant du fichier)`, et porte la marque
  `<PRÉFIXE>-r-<empreinte>`. Deux conséquences, et la seconde n'était pas évidente :
  la reprise devient **idempotente** — trois reprises du même fichier convergent sur
  **une** ligne au lieu d'en cloner trois —, et l'absence d'horodatage est délibérée :
  un identifiant dérivé n'a pas d'instant de création, et y en laisser un crédible
  mentirait au lecteur du journal (`db/CONVENTIONS.md` §2) ;
- un identifiant **répété dans le fichier** est **refusé** (`400`), avec le nom du
  doublon, et rien n'est modifié : le fichier est fautif, et son porteur peut le voir ;
- l'empreinte SHA-256 du fichier est écrite dans `imports.sha256` ;
- rejouer **le même fichier** converge : `fusionner` crée, `fusionner` met à jour,
  `remplacer` remplace, sans rien dupliquer — enregistrements ré-émis compris.

#### Lot L1 — rejoué sur base neuve

- **47 tables** en 4 migrations à la fermeture de S2, appliquées de bout en bout par
  `db/migrate.mjs` : `001_socle.sql` (16 tables), `002_metier_noyau.sql` (9 entités +
  5 liaisons), `003_metier_operations.sql` (13 entités + 4 liaisons), `004_rls.sql`
  (privilèges, politiques, déclencheurs, garde-fous). Une **cinquième migration** est
  arrivée depuis, avec la fermeture des constats — voir le tableau ci-dessus.
- **188 politiques**, RLS **activée et forcée** sur **toutes** les tables : mesuré dans
  `pg_class`, **0 table sans `relrowsecurity`, 0 sans `relforcerowsecurity`** — et cette
  propriété tient toujours sur la révision courante.
- **71 clés étrangères**, relevées dans `pg_constraint` et non dans le texte des
  migrations : **43 en `restrict`, 27 en `cascade`, une seule en `set null`**
  (`incidents.risque_id` — l'incident survit au risque).

  | Clé | Action | Pourquoi |
  |---|---|---|
  | `actions` → `exigences`, `risques`, `evaluations`, `incidents` | `cascade` | l'action corrective disparaît avec ce qu'elle corrigeait (`CONVENTIONS.md` §8) |
  | `tests_pra` → `scenarios_pra` | `cascade` | un test n'existe pas sans son scénario |
  | `actif_dependances` → `actifs` (deux sens) | `cascade` | les liens de cartographie sont purgés des deux côtés |
  | `incidents.risque_id` → `risques` | `set null` | **la seule** du schéma |
  | `actions.mesure_id` → `mesure_catalogue` | **`restrict`** | ⚠️ **pas `set null`** — §17.6 |
  | `evaluation_mesures`, `traitement_mesures`, `mesure_mise_en_oeuvre` → `mesure_catalogue` | **`restrict`** | idem |
  | `personnes.utilisateur_id` → `utilisateurs` | **`restrict`** | §18.2 |

  Les quatre premières lignes sont bien celles du produit navigateur. Les suivantes
  **amendent le §8** et méritent d'être comprises avant d'être relues comme une gêne :
  en contexte de groupe, un `set null` ou un `cascade` déclenché depuis le niveau
  **Groupe** réécrit les lignes de vingt filiales — il incrémente leur `version` et y
  inscrit le nom de quelqu'un qui n'y a jamais travaillé, dans des lignes que l'auteur
  ne peut même pas lire. Supprimer un contrôle du socle que des filiales ont évalué est
  donc **refusé** ; le contrôle **s'archive** (`mesure_catalogue.statut = 'archivee'` +
  `archive_le`), reste lisible et reste rattaché à tout ce qui le référence.
- **Clés étrangères et unicités composites** : quand l'enfant et le parent sont tous
  deux cloisonnés, la clé porte `(référence, filiale_id)` et vise une unicité
  `uq_<parent>_id_filiale`. Relevé dans `pg_constraint` : **11 clés étrangères** dont la
  seconde colonne visée est le `filiale_id` du parent, et **9 unicités** de cette forme.
  Une douzième clé composite vise `(id, portee_groupe)` — la colonne engendrée de
  `documents`. Une clé simple aurait été satisfaite par une ligne **invisible** de la
  filiale voisine : les contrôles d'intégrité de PostgreSQL contournent délibérément la
  RLS (`CONVENTIONS.md` §17.1, étendu aux unicités par le §19.1).
- **Traçabilité imposée à la création** : les **42 tables** portant `cree_par`
  reçoivent un déclencheur `before insert` qui impose `version`, `cree_le` et
  `cree_par` ; ce que le client envoie dans ces colonnes est ignoré
  (`CONVENTIONS.md` §18.1).
- **Garde-fous du schéma branchés et découverts** : `f_verifier_schema()` est
  appelée par `db/migrate.mjs` **et** par `deploy/install.sh`, et fait échouer les
  deux. Elle **découvre** ses contrôles dans le catalogue — **8** aujourd'hui : armement
  des déclencheurs, chemin de recherche, couverture RLS, entropie du générateur
  d'identifiants, portée figée, privilèges, traçabilité, unicités cloisonnées. Sur base
  neuve : **0 anomalie**.
- **Cloisonnement démontré** : `db/verifier_cloisonnement.sql` joué avec `grc_app`,
  **107 contrôles, 107 réussis, 0 échec**, transaction annulée par `rollback`.
- **Inaltérabilité du journal** : `UPDATE` refusé par le déclencheur sous le compte
  propriétaire, refusé par les privilèges sous le compte applicatif ;
  `f_journal_audit_verifier()` ne renvoie rien.
- **Une colonne retrouvée** : `traitements.notes`. Le formulaire RGPD la collectait
  depuis l'origine, le schéma ne la portait pas — le serveur la retirait donc du
  corps avant d'enregistrer le reste. Surtout, un export `grc-backup` existant la
  **porte**, et la reprise l'aurait perdue en silence, sur le registre de l'article 30.
- **Le catalogue des correspondances est devenu une table de configuration** : il
  était réécrit et supprimé par n'importe quelle filiale, pour les dix-neuf autres.
  L'éditer est désormais un acte d'**administration Groupe** ; le lire reste ouvert.

#### Outillage et déploiement

- `db/migrate.mjs` : ordre déterministe, empreinte SHA-256, compte propriétaire
  imposé, contrôle de conformité du schéma, codes de sortie documentés (§5).
- `db/dev/preparer_base_dev.sh` : base de développement et de recette, idempotente,
  refusant de tourner sous `NODE_ENV=production`.
- `deploy/install.sh` : idempotent, engendre les secrets internes, **vérifie que la
  base n'appartient pas au compte du service**, **rejoue les garde-fous du schéma à
  chaque passage**, et depuis la vague 2 **versionne les URL du frontend** (§3) en
  échouant si une seule reste sans jeton.

### Réserves — ce qui n'est pas vérifié, et ce qui est sciemment reporté

**Sur l'état des lots**

- Les deux portes sont franchies, **et des constats restent ouverts** — dont des
  majeurs. Ils ont chacun un propriétaire et une échéance dans le **registre des
  constats ouverts** du [plan d'exécution](../docs/PLAN_EXECUTION.md) §7 : c'est la
  seule liste, volontairement, et c'est là qu'il faut aller avant de conclure quoi
  que ce soit. Deux familles touchent directement ce document, et il vaut mieux les
  connaître avant de lire les chiffres ci-dessus comme un acquis définitif :
  **les générateurs d'identifiants** — le produit en compte quatre, dans trois
  langages, et le durcissement de l'un a deux fois laissé les autres derrière
  (`CONVENTIONS.md` §2) — et **la portée des garde-fous** : `f_verifier_schema()` ne
  refuse que s'il ne découvre **aucun** contrôle, si bien qu'un garde-fou qui cesse
  d'être découvert disparaîtrait en silence. Ce qui est écrit ci-dessus décrit l'état
  **présent**, pas l'état visé.
- Les vérifications ont été menées sur **PostgreSQL 16.13**, alors que la cible du
  déploiement est **PostgreSQL 17** (dépôt PGDG, `install.sh`). Aucune fonctionnalité
  postérieure à 16 n'est employée, mais l'écart reste à éprouver sur la VM cible.

**Sur l'environnement**

- **Rien de ce qui suit n'a pu être éprouvé** sur la machine de développement, faute
  d'environnement : l'installation Debian 13 complète, Apache, ClamAV, l'Active
  Directory et le relais SMTP. `deploy/install.sh`, les fichiers Apache et l'unité
  systemd sont **écrits et relus, pas exécutés en conditions réelles**. Leur première
  exécution sur la VM cible doit être surveillée.

  Nuance apportée par la vague 2, et elle compte : la **politique de sécurité de
  contenu et les en-têtes du vhost** ont bien été éprouvés, en extrayant la
  configuration réelle du fichier livré et en servant le frontend sous elle dans un
  Chromium. C'est ce qui a révélé que l'application ne fonctionnait pas dans sa
  configuration de déploiement. Le reste du vhost — TLS, mandataire inverse — ne
  l'est toujours pas.
- Les lots L3 (authentification), L6 (pièces jointes) et L12 (notifications) se
  recetteront sur des doublures tant que l'annuaire, ClamAV et le relais de
  messagerie du client ne sont pas accessibles.

**Dette reportée, assumée et datée** — un report écrit vaut mieux qu'un silence :

| Sujet | Décision | Échéance |
|---|---|---|
| `sessions`, `session_filiales`, `session_domaines` **écrivables sans condition** par le rôle applicatif | Circulaire et assumé : ces tables *produisent* la décision d'autorisation, elles sont lues avant que le périmètre existe. Parade actuelle : requêtes intégralement paramétrées. | **condition d'entrée du lot L3** (`CONVENTIONS.md` §17.4) |
| **Clés primaires composites** reportées | Arbitrage écrit et daté au `CONVENTIONS.md` §21. | **condition d'entrée du lot L3** |
| **La lecture du journal d'audit n'est pas cloisonnée** | Dérogation qu'impose le chaînage par empreinte (`004_rls.sql` §6). Sans effet tant que le journal est vide ; dès que L5 alimentera `valeurs_avant` / `valeurs_apres`, une session d'une filiale y lirait le contenu d'une autre — et le compte de supervision `grc_lecture` aussi. | **resserrement = livrable ferme de L5** |
| **Aucun contrôle de droits par domaine, aucun droit d'export distinct** | Il n'existe pas encore de modèle de droits : toute session qui passe la porte peut écrire dans sa filiale. La barrière provisoire est le refus **fail-closed** hors développement (§7). | **lot L3** (contrôles S6 et S7 de la grille) |
| **Aucune écriture au journal d'audit** par l'API | Le journal technique trace les écritures ; il n'a pas valeur de preuve. | **lot L5** (contrôle S3) |
| **Aucune limitation de rythme** | Elle appartient à la couche d'authentification, qui n'existe pas. Le constat **Q-10** (coût d'analyse de corps avant toute décision) se traite avec elle, en `onRequest`. | **lot L3** (contrôle S11) |
| Le drapeau `grc.administration_groupe` est une **déclaration que la session fait sur elle-même**, pas un privilège | Il protège contre la faute de programmation, **pas** contre un rôle applicatif compromis, qui le poserait avant d'écrire. La règle tenue aujourd'hui — *toute route qui l'exige le vérifie, aucune ne le pose* — est vraie et démontrée par un test ; à L3 de la rendre **structurellement** vraie. | **lot L3** (`CONVENTIONS.md` §17.4) |
| Supprimer un compte ou une filiale cité au journal est **structurellement impossible** (`restrict` + journal en ajout seul) | Cohérent avec la rétention de trois ans, mais la « purge explicite » de sortie de filiale (`PLAN_SERVEUR` §2.7) n'a aucun chemin applicatif. | procédures d'exploitation à écrire au **lot L13**, avec les purges RGPD |
| Un **commentaire fautif subsiste dans `001_socle.sql`** (constat Q-6 b) | La migration est **déjà appliquée** et `migrate.mjs` en tient l'empreinte SHA-256 : il sort en **code 4** si le fichier bouge. « Une migration appliquée ne se réécrit pas » n'admet pas d'exception pour un commentaire — la correction prendra la forme d'instructions `comment on` dans la migration suivante. Le texte reste donc faux un moment, et c'est le prix de la règle. | **vague 3** |
| Aucun plafond de durée ni de volume sur une reprise | Une reprise de 12 000 enregistrements tient une connexion du pool une vingtaine de secondes ; `statement_timeout` borne l'instruction, jamais la transaction (constat Q-9). | **lot L7** (import) |

Enfin, ce que le dispositif **ne** couvre **pas**, et qui est assumé : ni un `root`
sur la VM, ni un superutilisateur PostgreSQL. Le journal protège contre l'application
et contre l'administrateur *applicatif* — pas contre le DBA système, pour qui le
chaînage par empreinte rend l'altération **détectable** à défaut d'impossible.
