# Cyber GRC Groupe — serveur applicatif

> Guide d'exploitation. Le cadrage complet du projet vit dans
> [`../docs/PLAN_SERVEUR.md`](../docs/PLAN_SERVEUR.md), qui fait autorité.
> La **conduite** du chantier — vagues, portes de sécurité, définition de
> « terminé » — vit dans [`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md).
> Conventions de schéma : [`db/CONVENTIONS.md`](db/CONVENTIONS.md).

**État : lots L0, L1 et L2 livrés. Le lot L3 (authentification AD et droits) est
CONSTRUIT et mesuré de bout en bout contre un Active Directory réel** — sept profils de
recette s'authentifient, l'appartenance **indirecte** à un groupe imbriqué ouvre l'accès,
un compte sans groupe reçoit `403`. **La porte S3 a été jouée une fois, le 04/09/2026, et
REFUSÉE** : zéro fuite entre filiales, mais **deux bloquants des classes dures** (**Q-88**,
l'annuaire `personnes` jamais alimenté ; **Q-89**, le droit d'export contournable), tous
deux **corrigés et mordus le jour même**, plus quinze constats neufs (contrôles S7 et S18
en échec). Sous l'arbitrage du `../docs/PLAN_EXECUTION.md` §0 bis, la porte **trie** au
lieu de bloquer : ce qui reste est inscrit et daté au registre, et rien de ce qui reste
ouvert ne relève des deux premières classes. **Le lot L5 — le journal d'audit — est
livré**, et sa porte **S4 a été jouée le 04/09/2026 et refusée** : dix constats, dont
**un de la classe « fuite de données »** (Q-118), tous corrigés ou datés. Le journal émet
désormais **16 actions sur 20** (les quatre autres reportées par écrit), et la condition
**E6 est fermée** — la lecture est cloisonnée. Voir §8. La porte S1
est « CONFIRMÉE FRANCHIE » au 6ᵉ passage ; la porte S2 a été franchie au 4ᵉ passage puis
**refusée aux 5ᵉ, 6ᵉ, 7ᵉ, 8ᵉ et 9ᵉ** — et elle **ne se rejoue plus jusqu'au vert** : depuis
le 03/09, son verdict est un **tri** en trois classes (`../docs/PLAN_EXECUTION.md` §0 bis).
Le verdict de chaque passage vit dans le journal des portes du
[plan d'exécution](../docs/PLAN_EXECUTION.md) §7, et les rapports dans
[`../docs/securite/`](../docs/securite/) — c'est là qu'il se lit, et nulle part
ailleurs. Voir « Avancement » (§8) en fin de document.

> ⚠️ **L'authentification existe et fonctionne (lot L3) ; ce qui reste ouvert est sa
> couverture par le journal d'audit (lot L5, en cours).** Une session s'ouvre contre
> l'annuaire ou le compte de secours, ses trois axes de droits sont résolus, et une
> requête sans session reçoit `401`. Le repli **fail-closed** décrit plus bas — refus de
> résoudre un périmètre hors de `NODE_ENV=developpement`, `503` sur les routes de
> données — ne vaut plus que pour la session **provisoire** du lot L2, et elle ne sert
> désormais qu'un seul cas : celui où **ni l'annuaire ni le compte de secours ne sont
> configurés** (`src/serveur.ts`, condition vérifiée au démarrage). Une installation qui
> configure l'un des deux — c'est le cas de toute recette ou production correctement
> montée — sert l'authentification réelle, quel que soit `NODE_ENV` (§7). Ce qui n'est
> **pas encore** prouvé, c'est que chaque geste laisse une trace complète au journal :
> voir §8.

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

### ⚠️ Ce qui monte dans la racine web est une **liste blanche**, et pourquoi

`install.sh` ne recopie plus `cyber-gouvernance_V4/` en entier : il ne publie que les
types de fichiers qu'une page a le droit de charger — `html js css svg png ico jpg jpeg
gif webp woff woff2 webmanifest`. Tout le reste **arrête l'installation**, et le contrôle
est fait **deux fois** : sur le dépôt avant la copie, puis sur ce qui a réellement atterri
dans la racine web. Il regarde aussi dans l'autre sens — un fichier légitime manquant
arrête tout autant, parce qu'une liste blanche trop serrée livrerait une application
muette dont personne ne comprendrait la panne.

**D'où vient cette liste, pour qu'elle ne soit pas arbitraire** : c'est exactement ce que
la politique de sécurité de contenu du vhost autorise à charger depuis `'self'`. Un
fichier d'un autre type ne peut être chargé par aucune directive — il n'a donc rien à
faire dans une racine web, quel que soit le motif qui l'y a amené. Les deux listes (celle
d'`install.sh` et le `<FilesMatch>` de `deploy/apache/cyber-grc.conf`) vont **par paire**
et doivent le rester ; ajouter un type à l'une sans l'autre est ce que le message d'échec
rappelle.

#### Ce qui a rendu ce durcissement nécessaire

Le répertoire `cyber-gouvernance_V4/data/` a contenu, un temps, **quatre classeurs de
données réelles** — registre de risques informatiques, import de risques, questionnaire
d'exigences client — et un **fichier de verrou Excel nommant une personne**. Aucun code
de l'application ne les référençait. Mais l'installateur recopiait alors **tout** le
répertoire dans la racine web, et ni `.xlsx` ni `data/` ne figuraient dans les
interdictions du vhost : sur une installation réelle, ces fichiers auraient été
**téléchargeables par une URL devinable, sans aucune authentification** — dans un produit
dont la promesse centrale est le cloisonnement par filiale. Sixième passage de la porte
S2, constat **Q-31**.

Les fichiers sont **retirés de l'arbre de travail**, et un `LISEZ-MOI.md` occupe leur
place pour que la règle survive au retrait.

> 🔒 **Ce qu'il reste à faire, et qui n'appartient pas à une session de travail :** ces
> fichiers **restent dans l'historique git**, donc dans le dépôt distant. Les en purger
> impose une **réécriture d'historique et une poussée forcée** — une décision qui revient
> au **propriétaire du dépôt**. Tant qu'elle n'est pas prise, considérez ces données comme
> divulguées à quiconque a accès au dépôt, et traitez-les comme telles (information des
> personnes concernées si le fichier de verrou nomme quelqu'un, et rotation de ce qui
> serait sensible dans les classeurs).

**La règle qui en découle**, et qui vaut au-delà de ce répertoire : **aucun fichier de
données ne vit sous `cyber-gouvernance_V4/`.** Les jeux d'essai vivent dans un répertoire
de travail hors dépôt ; ce que l'application lit au démarrage vient du serveur.

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

### Ce que le serveur expose

**Quinze** routes de données, plus le point de santé : les neuf du lot L2, trois livrées
par le lot L3 — l'ouverture et la fermeture de session, et l'export sous son propre
droit —, et **trois par le lot L5**, pour le journal d'audit. Le frontend n'en connaît pas
d'autres, et c'est `js/core/api.js` — un fichier unique — qui les appelle toutes.

| Verbe | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/sante` | point de santé (le seul qui réponde sans périmètre résolu) |
| `POST` | `/api/connexion` | ouvrir une session (annuaire ou compte de secours) — **lot L3** |
| `DELETE` | `/api/connexion` | fermer la session courante — **lot L3** |
| `GET` | `/api/session` | qui suis-je, dans quelle filiale, avec quels droits et quelles réserves |
| `GET` | `/api/modele` | description du modèle — champs, types, bornes ; **aucune donnée** |
| `GET` | `/api/donnees` | le jeu de données entier de la filiale, dans la forme de l'objet `data` du navigateur |
| `GET` | `/api/rafraichir` | ce qui a changé depuis un horodatage, plus le compte par collection |
| `GET` | `/api/export` | extraire le jeu de données en enveloppe `grc-backup` — **droit `exporter`, distinct de la lecture** (§3.3, contrôle S7) ; **lot L3** |
| `POST` | `/api/entites/:entite` | créer — **l'identifiant est engendré par le serveur**, en proposer un est refusé |
| `PUT` | `/api/entites/:entite/:id` | modifier — **verrouillage optimiste obligatoire** |
| `DELETE` | `/api/entites/:entite/:id` | supprimer — `?version` **exigé** (une suppression relève du même risque P1) |
| `POST` | `/api/reprise` | reprendre un export `grc-backup` entier, **en une transaction**, avec aperçu |
| `POST` | `/api/operations/propager-mesure` | propagation « au plus défavorable », en une transaction |
| `GET` | `/api/journal` | consulter le journal d'audit — domaine **`journal`**, distinct d'`administration` ; pagination par curseur `avant`, jamais par décalage — **lot L5** |
| `GET` | `/api/journal/export` | extraire le journal en CSV — exige le droit `exporter` **en plus** du domaine ; les amorces de formule sont désamorcées (Q-121) — **lot L5** |
| `GET` | `/api/journal/verification` | vérifier le chaînage par empreinte — **aucune ligne = journal sain** ; réservée au **périmètre Groupe** (Q-118 : la chaîne est une propriété du groupe, et `depuis` en faisait un oracle) — **lot L5** |

⚠️ **Ce que `GET /api/export` ne ferme pas, et il faut le dire** (§17.5) : quelqu'un qui a
le droit de lire peut toujours recopier ce que son écran affiche. Le droit d'export ne
rend pas l'extraction impossible ; il rend l'extraction *en un clic, complète et
silencieuse* impossible, et journalisable — voir §8, tableau « Dette réellement
reportée », pour ce qui, de la journalisation elle-même, est encore devant le lot L5.

### « Le service tourne mais l'application refuse de démarrer »

C'est le symptôme d'une installation **mal configurée**, pas celui d'une authentification
qui n'existerait pas encore : le lot L3 est construit, et une installation qui déclare un
annuaire actif ou un compte de secours (`deploy/install.sh`) sert l'authentification
réelle quel que soit `NODE_ENV`. Il se diagnostique en une commande :

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/session
```

| Réponse | Ce que cela veut dire |
|---|---|
| `401` | pas de session (pas de cookie, ou session expirée/révoquée) : **c'est le cas normal** d'un client qui n'est pas encore connecté. La SPA affiche l'écran de connexion, pas un refus de démarrer |
| `503` | quatre causes, **et les trois premières ne devraient plus se produire sur une installation correctement configurée**. (a) Refus **fail-closed** de la session **provisoire** du lot L2 : ni l'annuaire ni le compte de secours ne sont configurés (`src/serveur.ts`), et `NODE_ENV` n'est pas `developpement` — un repli de développement, pas le chemin normal d'une recette ou d'une production. Le message rendu est volontairement générique (« l'authentification n'est pas encore installée… ») ; **le motif exact part au journal technique**, jamais au client. (b) Aucune filiale active en base : créez-en une avant la mise en service. (c) `API_FILIALE_PROVISOIRE` désigne une filiale inexistante ou inactive — ce cas-là le dit, et le journal donne les codes disponibles. (d) Base de données injoignable (voir la sonde de santé, `GET /api/sante`) |
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

⚠️ **Conséquence pratique : même un commentaire ne se corrige pas dans une migration
déjà appliquée.** On le corrige par des instructions `comment on` dans la migration
**suivante** — c'est ce qu'a fait `005_controles_schema.sql` §9 pour deux commentaires
que la vague 2 avait rendus faux. L'objection « ce n'est qu'un commentaire, rien n'est
encore déployé » est matériellement exacte, et refusée : c'est le raisonnement qui vide
une règle de sa substance la première fois qu'elle coûte quelque chose.

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
chemin appelant. **Neuf contrôles sont découverts et joués** sur une base à jour —
armement des déclencheurs, chemin de recherche des fonctions, couverture RLS,
entropie du générateur d'identifiants, portée figée, privilèges du rôle applicatif,
traçabilité à l'insertion, unicités cloisonnées, et — depuis la migration `007`,
condition d'entrée **E1** du lot L3 — l'écriture du substrat de session
(`f_verifier_substrat_session()`) : aucune table de `sessions`/`session_filiales`/
`session_domaines` ne s'écrit sans authentification, et aucune politique de
**lecture**, où que ce soit dans le schéma, ne s'élargit sur ce même réglage.

⚠️ **L'un d'eux ne mesurait pas ce que son nom promettait**, et l'histoire vaut d'être
connue avant d'écrire le prochain. `f_verifier_entropie_identifiants()` tirait un
identifiant et vérifiait que sa part aléatoire faisait au moins **32 caractères** — une
**longueur**, quand la convention norme **52 bits d'aléa cryptographique**
(`db/CONVENTIONS.md` §2). Or un remplissage à gauche (`lpad`, le `padStart` du jumeau
TypeScript) produit toujours la bonne longueur, **quelle que soit l'entropie portée** :
le contrôle était donc infaillible, au mauvais sens du mot. Pouvoir de détection mesuré
par l'auditeur : **8 sur 200 à 32 bits, 0 sur 200 à 40 bits**, pour un plancher normé à
52. La migration `006` le réémet sur une mesure en **bits**. La leçon est au §17.5 des
conventions : **un garde-fou auquel on prête plus de portée qu'il n'en a endort la
vigilance au lieu de l'entretenir** — une fausse assurance est pire qu'un silence.

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

#### ⚠️ Aucun chemin d'INSTALLATION ne le joue — mais le banc d'essai, si

`db/verifier_cloisonnement.sql` **n'est appelé ni par `install.sh`, ni par
`migrate.mjs`**, et ce n'est pas un oubli : c'est un **geste de recette**, à jouer une
fois avant la mise en service puis annuellement, exactement comme le test de
restauration des sauvegardes (`db/CONVENTIONS.md` §18.5). La raison tient à sa nature :
il **sème des données de démonstration** pour éprouver un comportement, et sa place est
là où l'on éprouve aussi la restauration d'une sauvegarde et l'envoi des courriels.

Ce qui a changé, en revanche : **le banc d'essai le rejoue** (`test/base/demonstration.test.mjs`),
en lançant `psql` sur une base neuve. Il l'a fallu, parce que ces 107 contrôles étaient
dans la situation exacte que ce chantier a appris à redouter — **écrits, corrects, et
rejoués par personne** entre deux recettes. Le banc n'annule pas le geste de recette :
il empêche seulement le script de pourrir en silence entre deux passages.

Deux dispositifs, deux natures, et les confondre les affaiblirait tous les deux :

| | `f_verifier_schema()` | `db/verifier_cloisonnement.sql` |
|---|---|---|
| Ce que c'est | des **fonctions de la base** | un **script de démonstration** |
| Ce qu'il lit | le **texte** des politiques, la déclaration du chemin de recherche | le **comportement** : on écrit, on lit, on compte |
| Quand | à **chaque migration et à chaque installation**, et fait échouer | à **chaque passage du banc**, et à la **recette** devant témoin |
| Ce qu'il attrape | une table sans politique, un `force` absent, un chemin non figé | une politique dont le texte est juste et le sens faux |

Il reste **jouable devant un auditeur**, ce qui est sa raison d'être, et le message
d'échec des garde-fous du schéma le cite comme l'étape suivante.

**Banc d'essai.** Sur un poste de développement ou une recette :

```bash
bash db/dev/preparer_base_dev.sh   # rôles + base + migrations, une seule fois
npm test                           # 1030 essais, onze familles (voir plus bas)
npm run verifier-types             # TypeScript en mode strict
npm audit --omit=dev               # dépendances (contrôle S15 de la grille)
```

`npm test` crée et détruit une base neuve par fichier de test, en appelant le vrai
`db/migrate.mjs` : le banc d'essai éprouve donc aussi l'outil de migration.

#### Prérequis de la machine

Quatre, et aucun n'est facultatif. Ils étaient tous **déjà exigés de fait** ; les écrire
est la moitié du travail, parce qu'une dépendance non écrite est celle qui casse sur la
machine de quelqu'un d'autre.

| Prérequis | Pourquoi | Ce qui se passe s'il manque |
|---|---|---|
| **PostgreSQL joignable**, et `db/dev/preparer_base_dev.sh` déjà passé | chaque fichier de test monte sa propre base | les suites ne démarrent pas — voir l'avertissement du §8 sur les chiffres en baisse |
| Le client **`psql`**, installé et sur le `PATH` | `db/verifier_cloisonnement.sql` porte des méta-commandes `psql` (`\pset`, `\echo`, `\gset`) que le pilote `pg` ne sait pas exécuter | l'essai **échoue** — il ne se saute pas |
| **Playwright** — **découvert**, jamais codé en dur (constat **Q-80**) : `PLAYWRIGHT_MODULE` s'il est posé, puis la résolution ordinaire, puis `npm root -g` **demandé à npm** — et son Chromium (`/opt/pw-browsers`) | les essais navigateur montent un serveur local qui sert `cyber-gouvernance_V4/` **tel quel**, `/api/**` relayé vers l'instance Fastify réelle | l'absence est signalée ; ni l'un ni l'autre n'est une dépendance de `package.json` |
| **Apache 2.4**, `openssl` et **`rsync`** | les essais de déploiement montent un **Apache réel** sur le vhost du dépôt et interrogent l'URL d'entrée ; `rsync` publie réellement les fichiers | l'essai **échoue** — il ne se saute pas, même arbitrage que pour `psql` |

⚠️ **Et rien d'autre : le banc tourne sur machine propre.** Une famille entière a dépendu,
un temps, d'une entrée `/etc/hosts` que rien ne posait — sur la machine de l'auteur elle
existait, sur une machine neuve le banc rendait **614 essais sur 628**. Le banc ne résout
donc plus aucun nom, et un piège **fait échouer** toute tentative de le faire : une
dépendance d'environnement non déclarée est une dépendance qui manquera chez quelqu'un
d'autre, et son absence ne doit jamais ressembler à une propriété tenue.

⚠️ **Pourquoi l'essai de cloisonnement échoue au lieu de se sauter**, alors que l'usage
courant est de sauter ce qu'on ne peut pas jouer : **un essai qui se saute rend un banc
vert sur une machine où la démonstration n'a pas été jouée.** Il fabrique exactement le
silence que tout ce dispositif cherche à supprimer — c'est le trou du « zéro contrôle
découvert » (§5, garde-fous du schéma) sous une autre forme. Réécrire le script pour se
passer de `psql` reviendrait par ailleurs à éprouver *autre chose* que le fichier que
l'auditeur lance devant témoin.

Le même raisonnement vaut pour ce que l'essai juge : **le code de sortie, le nombre de
contrôles joués et le nombre d'échecs, ensemble**. Un script vidé de ses contrôles
sortirait en 0 et annoncerait la démonstration faite ; le compte est donc comparé à un
plancher relevé et daté, qu'un ajout de contrôle ne fait pas rougir mais qu'une
disparition fait échouer.

#### Les familles d'essais

Le détail compte, parce que chacune attrape une classe de défaut que les autres ne
voient pas. ⚠️ **Cette section a longtemps porté ses propres effectifs, à côté de ceux du
§8, relevés à une révision différente (`ca73ac6`) — et les deux ont divergé pendant la
vague sans qu'aucun contrôle ne les compare : six familles et 637 essais ici quand le §8
en comptait déjà onze et 1030 (constat **Q-90**).** Un chiffre qui vit à deux endroits
finit par n'en dire qu'un vrai. Les effectifs ne vivent donc plus qu'**à un seul
endroit** — le bloc de mesure du §8, avec sa révision et sa date — et cette table-ci ne
fixe que ce qui change bien moins souvent que le compte d'essais : la **vocation** de
chaque famille, gardée par `test/documentation/chiffres-du-banc.test.mjs` (elle vérifie
que les répertoires nommés ci-dessous sont exactement ceux qui existaient à la révision
que le §8 cite). Les noms de répertoires sont ceux du dépôt, relus et non recopiés :

| Répertoire | Ce qu'il éprouve |
|---|---|
| `test/base/` | socle, journal en ajout seul et chaînage, RLS, privilèges, garde-fous du schéma, consignation, vocabulaire, **et la démonstration de cloisonnement rejouée par `psql`** |
| `test/api/` | routes montées pour de vrai, verrouillage optimiste, diagnostic d'`UPDATE 0`, familles d'entités, intégrité d'écriture, identifiants, bornes de corps, route de reprise |
| `test/reprise/` | paliers v1 → v12, enveloppe, scission des mesures, round-trip, entrées hostiles |
| `test/navigateur/` | la bascule côté SPA, dans **Chromium**, contre le serveur réel et sous la CSP du vhost — droits inclus (`droits.test.mjs`) |
| `test/deploiement/` | **le vhost livré, joué par un Apache réel** : l'URL d'entrée, la liste blanche de publication, la compression, le cache, les en-têtes, la borne de corps ; plus la copie par `rsync` et les blocs d'`install.sh` |
| `test/depot/` | **ce que le commit seul doit garantir**, pas l'arbre de travail : un fichier suivi n'importe que du suivi, l'entonnoir d'export ne laisse passer aucun site nu, tout réglage documenté est un réglage réellement lu |
| **`test/documentation/`** | **la forme du registre des constats** (sept barres par ligne, numérotation continue et sans doublon, cases « Propriétaire » et « État » jamais vides), **les chiffres du présent document confrontés au réel**, et — depuis cette entrée — **la vocation des familles ci-dessus confrontée à la révision citée au §8** |
| `test/auth/` | l'authentification de bout en bout contre un **Active Directory réel** (Samba) : protocole LDAP, renvois de continuation, compte de secours sans annuaire, chaîne HTTP complète |
| `test/droits/` | le modèle de droits à trois axes : vocabulaire des domaines confronté au catalogue PostgreSQL, projection des niveaux par domaine, écriture conditionnée du substrat de session (E1) |
| `test/annuaire/` | l'annuaire LDAP **simulé** lui-même, contre son propre contrat (`CONVENTIONS.md` §25.2), et un **oracle tiers** (`mod_authnz_ldap` d'Apache, qui ne partage aucune ligne avec ce dépôt) pour ne pas se croire deux fois de la même façon |
| `test/modules/` | le filet **comportemental** des modules métier du frontend (constat Q-16) : afficher, renommer, cliquer, exiger que la navigation atteigne le nouvel identifiant |

*(`test/aide/` n'est pas une famille : ce sont les montages partagés — base, serveur,
navigateur, outillage — que les onze autres appellent.)*

**Deux de ces familles sont nées d'un défaut, et c'est ce qui leur donne leur valeur.**

`test/deploiement/` est née d'un **bloquant**. Le motif `<FilesMatch>` du vhost était
éprouvé en le *simulant en JavaScript sur des noms de fichier* — utile, gratuit, sans
dépendance… et aveugle à **une** entrée : la chaîne vide. Pour `GET /`, Apache résout
`…/frontend/`, dont le dernier composant est vide, et il décide de l'autorisation
**avant** que `DirectoryIndex` n'ait choisi `index.html`. Un motif à négation étant vrai
sur la chaîne vide, `Require all denied` s'appliquait au répertoire : **la page d'accueil
rendait 403 pendant que `/index.html` rendait 200**. Les deux essais sont gardés — la
simulation **fige** la leçon, l'Apache réel la **trouve**.

`test/documentation/` est née de la perte d'un constat. Le registre de
`docs/PLAN_EXECUTION.md` §7 — que le `CLAUDE.md` désigne comme **la seule source des
verdicts** — a porté un jour treize barres sur une ligne au lieu de sept : deux constats
s'étaient collés, le tableau rendait **42 lignes au lieu de 43**, et l'absent était **le
seul bloquant d'un passage**. Le `CONVENTIONS.md` §24 dit qu'une liste écrite à la main
n'est le bon outil **que si un contrôle la confronte au réel** ; ce tableau-là était la
liste, et il n'avait pas son contrôle. Il l'a désormais — et cet essai ne juge **aucun
contenu**, seulement ce qui, dans la forme, fait qu'un constat peut disparaître sans un mot.

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

### La recette est protégée comme la production — par l'authentification réelle du lot L3

C'est une conséquence directe de la règle ci-dessus, et elle surprend : puisque la
recette porte une **copie réaliste de la production**, elle porte de la vraie
donnée de gouvernance de vingt filiales, sur une VM joignable par le VPN. Un
serveur sans authentification qui la servirait — et laisserait l'écrire — n'est pas
un environnement d'essai à données jetables : c'est la même fuite que sur
l'original. La porte S2 l'a relevé (constat M-5) alors que seule la production
était fermée.

⚠️ **Ce paragraphe disait « jusqu'à L3, la recette répond 503 sur toutes les routes de
données ». C'était vrai tant que L3 n'existait pas ; ce ne l'est plus, et l'écrire encore
serait nier ce que L3 a livré (constat Q-90).** La parade n'est plus un refus général :
c'est **l'authentification réelle**, la même qui protège la production — annuaire AD ou
compte de secours, droits à trois axes, journal des connexions (§8). Mesuré sur la recette
de ce chantier, Active Directory Samba compris : une connexion réussie répond `200`, une
connexion refusée `401`. Une recette dont l'installation ne déclare **ni** annuaire actif
**ni** compte de secours retombe sur la session provisoire du lot L2, qui refuse — `503`
hors `NODE_ENV=developpement` — mais c'est désormais le signe d'une **installation
incomplète**, pas le fonctionnement attendu d'une recette (§4).

## 8. Avancement

État réel des lots, **au 04/09/2026**. La **conduite** du chantier — découpage en
vagues, portes de sécurité, définition de « terminé » — vit dans
[`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md) ; le **quoi** vit dans
[`../docs/PLAN_SERVEUR.md`](../docs/PLAN_SERVEUR.md) §7.

| Lot | État |
|---|---|
| **L0 — Socle d'infrastructure** | ✅ **livré** |
| **L1 — Schéma relationnel** | ✅ **livré** (vague 1), corrigé au fil de la porte **S1** — jouée six fois |
| **L2 — API et bascule de la persistance** | ⚠️ **livré** (vague 2) **mais non validé par la porte** — **S2** jouée **neuf fois** : franchie au 4ᵉ passage, **refusée aux 5ᵉ, 6ᵉ, 7ᵉ, 8ᵉ et 9ᵉ** ; les 8ᵉ et 9ᵉ sans bloquant. Elle **ne se rejoue plus jusqu'au vert** : depuis le 03/09, le verdict est un **tri** (`../docs/PLAN_EXECUTION.md` §0 bis), et le lot part en vague 3 avec ses constats triés |
| **L3 — Authentification AD et droits** | ✅ **construit**, mesuré de bout en bout contre un **Active Directory réel** — sept profils entrent, l'appartenance indirecte par groupe imbriqué ouvre l'accès. Porte **S3** jouée une fois (04/09/2026) et **refusée** : zéro fuite entre filiales, **deux bloquants des classes dures** (**Q-88**, **Q-89**) corrigés et mordus le jour même, quinze constats neufs triés par l'arbitrage `docs/PLAN_EXECUTION.md` §0 bis |
| **L5 — Journal d'audit** | ✅ **livré** (04/09/2026), **porte S4 jouée et refusée** — le tri du §0 bis s'applique. Couverture portée de **4 actions émises sur 20** à **16 émissibles** (`purge` et `archivage` relèvent de l'exploitation, `approbation` du lot L8, `analyse_antivirus` du lot L6) ; **condition E6 fermée** par `008_journal_lecture.sql` — `grc_lecture` recevait 160 entrées, il reçoit « Périmètre non positionné » ; trois routes de consultation, écran `/journal`, export CSV désamorcé et éprouvé sur une entrée hostile. **Dix constats neufs** (Q-118 → Q-127), dont **Q-118, classe « fuite de données »** — un oracle sur la chronologie du groupe par `verification?depuis=N` —, corrigé et mordu |
| **L4 — Multi-filiales** | ✅ **livré** (04/09/2026, vague 4) — sélecteur de filiale active, `GET /api/filiales`, migration `009`. Le client envoie un **choix**, le serveur résout un **périmètre** depuis `session_filiales` relu en base ; la filiale active est revérifiée **à chaque requête**. ⚠️ **La « vision Groupe consolidée » du cadrage n'existe pas** : `/api/donnees` est cadré sur la filiale *active*, donc la Direction voit une filiale à la fois (constat de la porte S5, à arbitrer avec le client) |
| **L6 — Pièces jointes** | ✅ **livré** (04/09/2026, vague 4) — les **huit contrôles** du `PLAN_SERVEUR` §1.6 dans un ordre figé, ClamAV réel, SHA-256 sur ce qui est écrit, quarantaine, ré-analyse périodique et son timer. `zip.ts` ouvre le conteneur OOXML : un `.docm` renommé est refusé **par ce que Word y a écrit** |
| L7 → L15 | ⬜ à faire — vagues 5 à 8, voir [`../docs/PLAN_EXECUTION.md`](../docs/PLAN_EXECUTION.md) §3 |

### Les verdicts, tels que le journal des portes les formule

Ils ne se déduisent pas d'ici : ils se lisent dans le journal des portes du
[plan d'exécution](../docs/PLAN_EXECUTION.md) §7, avec le rapport correspondant
dans [`../docs/securite/`](../docs/securite/). Les passages les plus récents de chaque
porte, reproduits mot pour mot — **S3 manquait encore de ce tableau au moment où le
constat Q-90 a été mesuré**, alors qu'elle avait déjà été jouée :

| Porte | Verdict du journal | Rapport |
|---|---|---|
| **S1** (6ᵉ passage) | ✅ **CONFIRMÉE FRANCHIE** — 0 bloquant, 0 majeur, 6 mineurs | [`RAPPORT_S1_SEXIES.md`](../docs/securite/RAPPORT_S1_SEXIES.md) |
| **S2** (4ᵉ passage) | ✅ **FRANCHIE** — 0 bloquant, 4 majeurs, 7 mineurs, **aucun des dix-huit contrôles en échec** | [`RAPPORT_S2_QUATER.md`](../docs/securite/RAPPORT_S2_QUATER.md) |
| **S2** (5ᵉ passage) | ❌ **refusée** — 0 bloquant, 3 majeurs, 3 mineurs. **Contrôle S17 en échec** : le défaut vit *entre* trois fichiers dont aucun n'a tort seul — le vhost coupe la reprise à 60 s pendant que le serveur valide sa transaction. Le cœur du lot n'est pas en cause : 46 sondes hostiles n'ont bougé ni le périmètre, ni une frontière de filiale, ni une requête SQL. | [`RAPPORT_S2_QUINQUIES.md`](../docs/securite/RAPPORT_S2_QUINQUIES.md) |
| **S2** (6ᵉ passage) | ❌ **refusée** — **1 bloquant**, 3 majeurs, 2 mineurs. **S17 et S18 en échec.** Le bloquant vise le correctif Q-27 **accepté à la porte précédente** : il a échangé un doublon silencieux contre une **destruction silencieuse** — le bandeau dit de recharger, l'utilisateur recharge, et la saisie disparaît. Le reste tient : 22 des 28 constats rejoués par mutation, l'hypothèse la plus chargée de Q-19 enfin **mesurée** avec un mandataire (la transaction est bien annulée), 81 sondes hostiles sans effet, 107/107 au cloisonnement, 27 écrans sous la CSP réelle sans violation. | [`RAPPORT_S2_SEXIES.md`](../docs/securite/RAPPORT_S2_SEXIES.md) |
| **S2** (7ᵉ passage) | ❌ **refusée** — **1 bloquant**, 2 majeurs, 3 mineurs. S17 et S18 en échec. **L'auditeur a installé Apache et rsync**, ce que six passages n'avaient pas fait : la liste blanche du vhost — correctif accepté au 6ᵉ — rend **403 sur `/`**, et l'application est injoignable à son URL d'entrée. Le reste tient : 111 sondes hostiles sans effet, cloisonnement 107/107 qui s'effondre proprement au sabotage, et **25 écrans derrière un Apache réel sans une seule violation de CSP** — mesuré pour la première fois. | [`RAPPORT_S2_SEPTIES.md`](../docs/securite/RAPPORT_S2_SEPTIES.md) |
| **S2** (8ᵉ passage) | ❌ **refusée** — **0 bloquant**, 4 majeurs, 3 mineurs. S13 et S17 en échec. « Le lot est plus solide qu'à aucun passage : **17 fermetures rejouées par mutation, 17 morsures, zéro exception**, y compris les trois que le 7ᵉ avait trouvées vertes. » Mais `LimitRequestBody` **ne s'applique pas à `/api/`** et `install.sh` imprimait « ok » en comparant deux nombres dont l'un n'agit pas ; le banc rendait **614/628 sur machine propre**, une famille entière dépendant d'une entrée `/etc/hosts` que rien ne pose ; et **le registre lui-même avait perdu la ligne d'un bloquant** — 42 constats affichés au lieu de 43. La politique TLS livrée est mesurée pour la première fois. | [`RAPPORT_S2_OCTIES.md`](../docs/securite/RAPPORT_S2_OCTIES.md) |
| **S2** (9ᵉ passage) | ❌ **refusée** — **0 bloquant**, 4 majeurs, 6 mineurs. **S12 et S18 en échec.** L'auditeur a fait **pour la première fois la jonction que S17 réclame, en une seule pièce** : Chromium réel → Apache réel sur le vhost du dépôt → serveur réel → PostgreSQL, 0 erreur, 0 violation de CSP. 157 sondes de périmètre sans dérive, 30 formes d'injection, journal en ajout seul refusé **au propriétaire**. Mais le bandeau nomme un geste que le correctif ne couvre pas — **troisième tour du même défaut** —, l'erreur brute de l'analyseur JSON fuit en production, et **deux garde-fous posés le jour même sont contournés**, dont celui du registre. | [`RAPPORT_S2_NONIES.md`](../docs/securite/RAPPORT_S2_NONIES.md) |
| **S3** (1ᵉʳ passage) | ❌ **refusée** — **0 bloquant de fuite entre filiales**, mais **2 bloquants des classes dures** et **15 constats neufs** (Q-88 → Q-102). **S7 et S18 en échec.** Le cœur du lot tient et c'est mesuré : cloisonnement **48/48 en `force RLS`**, périmètre serveur inviolable, AD **réel** fonctionnel — groupes imbriqués compris —, droits à trois axes qui mordent, banc **1028/1028** rejoué deux fois. ⚠️ **Première fois sur ce chantier : les 17 constats fermés la veille ont TOUS tenu sous la mutation.** Les deux bloquants sont ailleurs, et tous deux invisibles à la lecture : **Q-88**, l'annuaire `personnes` jamais alimenté depuis l'AD — **0 ligne après sept connexions réelles** — et **Q-89**, le droit d'export contourné depuis l'interface — **38 213 octets** de « Synthèse Direction », marquée *Document confidentiel*, téléchargés par un compte AD sans droit d'export. Les deux sont corrigés et mordus le jour même | [`RAPPORT_S3.md`](../docs/securite/RAPPORT_S3.md) |

> ## ⚠️ **La porte S2 est REFUSÉE, sur un bloquant. Le lot L2 n'est pas franchi.**
>
> C'est l'information la plus importante de ce document. Le franchissement du 4ᵉ passage
> portait sur la révision **`a4116b6`** (verdict consigné en `120266e`) ; chaque fermeture
> de constats a ensuite été soumise à la porte, et **chacune a été refusée** — 5ᵉ passage
> sur **`f68f799`**, 6ᵉ sur **`f0b4eec`**, 7ᵉ et 8ᵉ sur les révisions qu'ils nomment
> (`ab53aec` pour le 8ᵉ).
>
> Ne lisez donc **aucune** ligne de ce §8 comme un acquis. Ce qui suit décrit un lot
> livré, mesuré et corrigé — pas un lot validé.
>
> **Le 8ᵉ passage est cependant le premier refus sans bloquant, et son auteur écrit que
> « le lot est plus solide qu'à aucun passage » :** 17 fermetures rejouées par mutation,
> 17 morsures, zéro exception — y compris les trois que le passage précédent avait
> trouvées vertes. La trajectoire compte autant que le verdict.
>
> **Mais les deux bloquants qui l'ont précédé visaient chacun un correctif que la porte
> d'avant avait accepté.** Il faut le dire, parce que c'est la leçon la plus transférable
> du chantier : un correctif jugé bon par un auditeur indépendant a détruit des données au
> passage suivant, puis un autre a rendu **l'application injoignable à son URL d'entrée**.
> Le détail est plus bas, sous « Un même mot pour deux couches » et « Une réserve écrite
> n'est pas une réserve traitée » ; la conséquence pour la lecture de ce document est
> immédiate : **la fermeture d'un constat n'est pas une garantie, c'est une hypothèse en
> attente d'être rejouée.**

**Refusée ne veut pas dire cassée, et franchie n'aurait pas voulu dire sans réserve.**
Le verdict ci-dessus le dit lui-même : aucun bloquant, le cœur du lot hors de cause, et
un contrôle en échec qui porte sur un défaut vivant **entre** trois fichiers dont aucun
n'a tort seul. C'est précisément la classe de défaut que le contrôle S17 — *le chemin
complet a été parcouru pour de vrai* — existe pour attraper, et qu'aucune relecture de
fichier ne trouve. Les constats de S2 vivent dans le
**registre des constats ouverts** du [plan d'exécution](../docs/PLAN_EXECUTION.md) §7,
chacun avec un **propriétaire nommé, une échéance et un état**. Ce registre n'est ni
recopié ni résumé ici — pas même par un décompte : il vit, des constats s'y ajoutent et
s'y ferment, et deux listes des mêmes constats divergent en silence. Il existe
précisément parce que la vague 1 avait mesuré, chiffré et écrit un défaut de générateur
d'identifiants **sans l'attribuer à personne** — il est ressorti deux vagues plus tard
en **bloquant**.

⚠️ **Lire la colonne d'état, et pas seulement la présence dans le tableau.** Elle
distingue trois situations que rien d'autre ne distingue : **corrigé, en attente du
rejeu** ; **reporté par écrit** à un lot nommé, avec sa raison ; et **documenté sans
être fermé**, quand fermer coûterait plus cher que le défaut. Un constat ne quitte le
registre que **corrigé *et* rejoué**, la porte étant rejouée intégralement et jamais
seulement sur le correctif.

### ⚠️ Ce qui est prouvé, et ce qui ne l'est pas — à lire avant les chiffres

Trois mots reviennent ci-dessous, et ils ne veulent **pas** dire la même chose. Les
confondre est le seul moyen de se tromper sur l'état réel du lot.

| Mot | Ce qu'il garantit | Qui l'a établi |
|---|---|---|
| **mesuré** | la commande a été lancée à la révision indiquée, et c'est sa sortie qui est écrite | l'auteur de ce document, en rejouant |
| **corrigé** | le défaut est réparé, et le banc d'essai l'exerce | l'agent propriétaire du constat |
| **rejoué / franchi** | un auditeur **qui n'a écrit aucune de ces lignes** a rejoué la **grille entière** — pas seulement le correctif | la porte de sécurité |

**La phrase qui compte, et il n'y en a qu'une : la porte a été rejouée sur la révision
`f68f799` et elle a REFUSÉ le lot.** Le banc est vert, les correctifs sont exercés par
des essais, les chiffres ci-dessous sont rejoués — et rien de tout cela n'a suffi. C'est
exactement la distinction que le registre des constats tient dans sa colonne d'état :
« ✅ corrigé — attend le rejeu » n'est pas « réglé », et un lecteur pressé qui lirait la
coche verte pour un quitus se tromperait. Le 5ᵉ passage vient de le démontrer.

**Et la démonstration est plus intéressante que le verdict.** Ce qui a fait échouer le
lot n'est dans aucun des fichiers que ce document décrit : c'est un désaccord **entre**
le vhost et le serveur, dont aucun n'a tort seul. Aucune relecture, aucun essai unitaire,
aucun de nos chiffres verts ne pouvait le voir — seul le contrôle S17, *« le chemin
complet a été parcouru pour de vrai »*, le pouvait. Prenez-en la leçon avant de lire la
suite : **un banc vert mesure ce qu'il regarde, jamais ce qu'il ne regarde pas.**

Pour l'auditeur qui rejouera la grille, cela se traduit en une consigne courte : **ne
prenez rien de ce document pour un acquis.** Chaque verdict est écrit ci-dessus avec sa
révision ; tout le reste est du travail à contrôler, y compris — et surtout — ce qui est
présenté comme la fermeture d'un constat que vous aviez ouvert.

Cette prudence n'est pas rituelle. Elle vient de ce que ce chantier a mesuré six fois :
**chaque passage de porte a trouvé ce que le précédent avait manqué**, et plusieurs
correctifs acceptés parce que « la suite restait verte » l'étaient parce que rien
n'exerçait le chemin corrigé. Une suite verte prouve l'absence de régression sur ce
qu'elle couvre ; elle ne prouve jamais la couverture.

### Fait et vérifié en exécution

Les chiffres ci-dessous ont été **rejoués** au moment de la rédaction, pas repris d'un
rapport ni d'un message. Point de mesure, sans lequel un chiffre est invérifiable :

| | |
|---|---|
| Révision mesurée | **`d217fbb`** — « Q-75, Q-76, Q-58 : un contrôle non joué ne se confond plus avec un contrôle réussi » (04/09/2026), rejouée **sur la machine réelle** (Debian 13, `SRV-Infra`) et non plus sur un conteneur Ubuntu. ⚠️ **Le compte est passé de 969 à 1030 pendant la vague 3**, cinquante-neuf essais ayant été ajoutés par les agents B1 et B2 après le passage de l'agent de documentation, puis deux de plus au fil des correctifs suivants — et le garde-fou de l'époque ne pouvait pas le voir seul : il confronte le document à **lui-même**, jamais au compte réellement joué (constat **Q-87**, resté **ouvert** — c'est ce qui a laissé passer, jusqu'à la porte S3, les cinq chiffres faux du constat **Q-90**, celui-ci compris) |
| État de l'arbre | **propre** (`git status --porcelain` vide) |
| Base | rôles PostgreSQL **réels** de la machine, engendrés par `deploy/install.sh` (secrets sourcés depuis `~/.grc-essais.env`, `CLAUDE.md` §5 — **`db/dev/preparer_base_dev.sh` non rejoué ici** : il ramènerait ces rôles à `dev` et casserait le service installé) ; chaque fichier d'essai ouvre sa propre base jetable `grc_essai_*`. **PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2)**, client `psql` du même paquet |
| Node · Apache · rsync · OS | **v22.23.2** · **Apache/2.4.68 (Debian)** · **rsync 3.4.1** · Debian GNU/Linux 13 (trixie) |

```
npm run verifier-types                           → aucune erreur
npm test                                         → tests 1030 · pass 1030 · fail 0 (131,0 s)
                                                   base 272 · api 241 · reprise 77
                                                   navigateur 74 · deploiement 65
                                                   depot 5 · documentation 17
                                                   auth 115 · droits 83 · annuaire 48
                                                   modules 33
npm audit --omit=dev                             → found 0 vulnerabilities
psql -U grc_app -f db/verifier_cloisonnement.sql → 107 contrôles · 107 réussis · 0 échoué (code 0)
select * from f_verifier_schema()                → 0 ligne (9 garde-fous découverts, joués, consignés)
```

Schéma relevé **dans le catalogue**, pas dans le texte des migrations : **48 tables** en
**7 migrations**, **192 politiques**, **0 table sans RLS activée, 0 sans RLS forcée**,
**71 clés étrangères** (43 `restrict`, 27 `cascade`, 1 `set null`), **43 tables portant
`cree_par` et 43 déclencheurs de création**, **11 clés étrangères composites** visant
`(id, filiale_id)`, **9 unicités** `uq_<parent>_id_filiale`, **9 contrôles consignés**
dans `controles_schema` (la migration `007_authentification.sql` en a ajouté un neuvième).

Frontend, mesuré en **évaluant le module** et non en dépouillant son texte : façade
`DataStore` à **131 membres**, identique avant et après la vague 2 ; **118 méthodes
distinctes** appelées sur **323 sites**, dans **26 modules**.

⚠️ **Un chiffre faux dans ce document est un constat, pas une coquille** — et c'est
désormais écrit dans la conduite du chantier (`../docs/PLAN_EXECUTION.md` §5) : la remise
à jour de la documentation est une **étape de la fermeture de porte**, au même titre que
le rejeu de la grille. La raison tient en une phrase, et elle a été payée neuf fois :
tant que la mise à jour est demandée **après** le verdict, le signalement suivant est
déjà écrit. Deux formes de ce défaut, qui n'ont pas le même coût :

| Forme | Ce qu'un lecteur en fait |
|---|---|
| un compte qui a **vieilli** (essais, migrations) | il compare à `select count(*)` ou à `npm test`, trouve l'écart, et **cesse de se servir du document comme d'un contrôle** |
| un compte **faux depuis toujours** (la façade à 130) | il vérifie, trouve faux, et **cesse de croire la propriété que le compte illustrait** — ici *« la façade est intacte »*, qui est le cœur du lot |

Le second est le pire, et c'est celui que ce document a porté le plus longtemps. La
parade n'est pas la vigilance : c'est de **mesurer par l'exécution** partout où c'est
possible — `Object.keys` plutôt qu'un dépouillement de texte, `pg_catalog` plutôt qu'une
relecture de migration, `npm test` plutôt qu'un souvenir.

⚠️ **Un chiffre en baisse se diagnostique avant d'être écrit.** Le cas s'est présenté
deux fois : PostgreSQL arrêté au redémarrage du conteneur — le banc rend alors un total
très inférieur **sans un seul échec**, parce qu'une suite qui ne démarre pas ne compte
aucun échec ; et une famille entière qui dépendait d'une entrée `/etc/hosts` absente
d'une machine neuve (**614 sur 628**). **Un banc qui rétrécit sans rougir est le symptôme
le plus trompeur qui soit** : il ressemble à un succès.

⚠️ **Le banc grossit à chaque fermeture de constat**, et c'est la raison d'être de la
ligne « révision mesurée » : **505** essais au 4ᵉ passage, puis **534**, **564**, **615**,
**637**, **651**, **969**, **1030** à la révision citée ci-dessus — et davantage,
probablement, au moment où vous lisez ceci — avec des familles nées en chemin, chacune
d'un défaut ou d'un lot (§5). Un total différent du vôtre n'est donc pas une
contradiction : comparez d'abord la révision **et** l'état de l'arbre. C'est très
exactement la trajectoire que le constat **Q-87** a prise en défaut une fois de plus
entre l'écriture de cette ligne et la précédente : **969** y est resté écrit comme le
compte « ici » pendant que la révision nommée en portait déjà **1028**, puis **1030**.

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

  ⚠️ **Ce contrôle ne couvre que le générateur du serveur.** Le produit fabrique des
  identifiants à **cinq endroits, dans trois langages** — trois générateurs aléatoires et
  deux dérivations qui ne tirent rien (`db/CONVENTIONS.md` §2, qui fait foi). Celui de la
  base a son propre garde-fou dans `f_verifier_schema()` ; celui du navigateur n'en a pas
  encore. Ne pas lire cette ligne comme une couverture des cinq sites — c'est exactement
  l'erreur qui a produit le constat le plus coûteux de la vague : un générateur durci,
  gardé et démontré qui n'était pas celui qui écrivait.
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
  `DataStore` expose **131 membres** ; avant la vague 2, il en exposait **131**, et le
  `diff` des deux listes triées est **vide** : aucun ajouté, aucun retiré, aucune
  signature changée. Les **118 méthodes distinctes** appelées depuis les modules, les
  services et `app.js` — **323 sites d'appel** — le sont à l'identique. C'est la parade
  au risque P3 : aucun des 26 modules métier n'est réécrit.

  > ⚠️ **Ce document a longtemps écrit 130, et la façon dont il se trompait mérite
  > d'être lue.** Le nombre venait d'un dépouillement du texte source qui avalait le
  > **premier** membre de la liste — une erreur d'indice dans mon propre outil, pas dans
  > le produit. C'est le pire genre de chiffre faux : **la propriété qu'il chiffre est
  > vraie**, et un lecteur qui vérifie le nombre, le trouve faux, cesse de croire la
  > propriété — qui est pourtant le cœur du lot. La mesure ne se fait plus sur le texte :
  > le module est **évalué**, et on lit `Object.keys(DataStore)`. Un compte qui vient de
  > l'exécution ne peut pas dériver d'un caractère.
- **Où l'asynchrone est absorbé** : dans `js/core/sync.js`, et là seulement —
  exactement comme `flushNow()` absorbait IndexedDB auparavant. Au démarrage, il lit
  `/api/session`, `/api/modele` et `/api/donnees` ; à chaque `save()`, il compare
  l'état en mémoire à un **instantané de référence** et n'envoie que la différence,
  enregistrement par enregistrement ; un **sondage** rapatrie le travail des autres.
- **Le sondage ne recalcule plus tout, trois fois par battement** — et la façon dont
  ce défaut a été fermé mérite d'être lue, parce qu'elle contredit ce que l'auditeur
  suggérait. Un parcours unique à deux réglages remplace les trois différentiels
  complets : sans contenu, une création se voit à l'absence de sa clé et une
  suppression à la présence d'une clé sans enregistrement en face, ce qui évite de
  canoniser quoi que ce soit (**3 ms au lieu de 41** sur 12 000 enregistrements — mesure
  consignée dans `js/core/sync.js`) ; et
  le visiteur peut **arrêter le parcours** au premier écart quand la question est
  booléenne. **La mémorisation, elle, a été mesurée puis refusée** : `data` appartient
  au `DataStore`, qui en prête une référence vive, et toute invalidation aurait été une
  liste de sites de mutation tenue à la main. Une invalidation manquée afficherait
  « aucune modification en attente » alors qu'il y en a — c'est le risque P1 par un
  autre chemin, pour un gain que la mesure ne réclamait pas.
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
- **Un cycle d'écriture se termine au repos, ou il se réarme** — et l'absence de cette
  propriété a laissé vivre, un temps, une **référence pendante en base**. `renommer()`
  réécrivait les références en mémoire sans réarmer l'envoi : rien ne partait, l'écran et
  la base divergeaient, et l'état « modifications non enregistrées » devenait permanent et
  inexpliqué. Le pire cas est celui qu'un exploitant doit savoir reconnaître dans des
  données antérieures au correctif : une création qui échoue sur une **panne réseau
  passagère** et repart au cycle suivant, la modification qui la cite partie entre-temps
  **avec l'identifiant local**, et la base qui conserve un lien vers une ligne qui n'existe
  pas. Déclencheur exact : le renommage touche un enregistrement que le serveur détient
  **déjà** et que le différentiel du cycle courant ne contenait **pas** ; un renommage à
  l'intérieur d'un même cycle n'est pas concerné, les créations y étant écrites avant les
  modifications.

  ⚠️ **Ce correctif soigne la divergence, jamais la corruption.** Il garantit que la base
  finit par porter ce que la mémoire porte — pas que ce que la mémoire porte soit juste.
  Là où un champ métier valait légitimement la même chaîne qu'un identifiant, la
  réécriture a écrasé cette valeur, et le correctif **persiste fidèlement la valeur
  corrompue**. Lire « mémoire et base alignées » comme « la donnée est réparée » serait un
  contresens ; la seule défense contre cette corruption-là est le **bandeau qui nomme la
  réécriture et son compte**, et c'est pourquoi il ne s'efface jamais tout seul.
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
  mentirait au lecteur du journal ;
- **une seconde marque, `-d-`, dit autre chose** : « le fichier n'apportait pas
  d'identifiant ». Un enregistrement qu'un export ancien livre sans identifiant
  exploitable en reçoit un, dérivé de `(collection, rang, contenu)`. Les deux marques se
  lisent au journal et ne se confondent pas — `-r-` : « le serveur a dû ré-émettre » ;
  `-d-` : « il n'y avait rien à reprendre » (`db/CONVENTIONS.md` §2) ;
- un identifiant **répété dans le fichier** est **refusé** (`400`), avec le nom du
  doublon, et rien n'est modifié : le fichier est fautif, et son porteur peut le voir ;
- l'empreinte SHA-256 du fichier est écrite dans `imports.sha256` ;
- rejouer **le même fichier** converge : `fusionner` crée, `fusionner` met à jour,
  `remplacer` remplace, sans rien dupliquer — enregistrements ré-émis compris.

#### Lot L1 — rejoué sur base neuve

- **48 tables**, obtenues aujourd'hui en **7 migrations** appliquées de bout en bout par
  `db/migrate.mjs` : `001_socle.sql` (16 tables), `002_metier_noyau.sql` (9 entités +
  5 liaisons), `003_metier_operations.sql` (13 entités + 4 liaisons), `004_rls.sql`
  (privilèges, politiques, déclencheurs, garde-fous), `005_controles_schema.sql` (le
  registre des garde-fous) et `006_entropie_et_commentaires.sql` (un garde-fou réémis et
  des commentaires corrigés — ni table, ni donnée, ni politique) closent le lot **L1** ;
  `007_authentification.sql` (condition **E1** : écriture du substrat de session
  conditionnée, neuvième garde-fou de schéma — sans nouvelle table) est du lot **L3**.
  Les trois dernières sont arrivées avec des **fermetures de constats**, après le
  franchissement du 4ᵉ passage de S2 pour `005`/`006`, à l'ouverture de L3 pour `007`.
- **192 politiques**, RLS **activée et forcée** sur **toutes** les tables, propriétaire
  compris : mesuré dans `pg_class`, **0 table sans `relrowsecurity`, 0 sans
  `relforcerowsecurity`**.
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
- **Traçabilité imposée à la création** : les **43 tables** portant `cree_par` portent
  chacune un déclencheur `before insert` nommé `trg_<table>_creation` — **43 relevés**,
  répartis selon la forme de la table entre `f_init_tracabilite` (31), `f_init_creation`
  (10) et `f_init_horodatage` (2). Ce que le client envoie dans `version`, `cree_le` et
  `cree_par` est **ignoré** (`CONVENTIONS.md` §18.1). La couverture n'est pas affirmée
  ici, elle est **vérifiée** : `f_verifier_tracabilite()` balaie les tables à `cree_par`,
  exige le déclencheur, exige la **bonne** fonction pour la forme, exige l'armement
  `always` et **refuse une clause `when`** — un déclencheur conditionnel serait un décor.
  Sur base neuve : 0 anomalie.
- **Garde-fous du schéma branchés et découverts** : `f_verifier_schema()` est
  appelée par `db/migrate.mjs` **et** par `deploy/install.sh`, et fait échouer les
  deux. Elle **découvre** ses contrôles dans le catalogue — **9** aujourd'hui : armement
  des déclencheurs, chemin de recherche, couverture RLS, entropie du générateur
  d'identifiants, portée figée, privilèges, traçabilité, unicités cloisonnées, et
  l'écriture du substrat de session (`f_verifier_substrat_session()`, migration `007`,
  condition **E1**). Sur base neuve : **0 anomalie**.
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

#### Un même mot pour deux couches — le bloquant du 6ᵉ passage

C'est le défaut le plus instructif du chantier, et il n'a rien d'un cas tordu : il est né
d'une bonne pratique appliquée un cran trop loin.

**Ce qui était voulu.** Une création dont l'issue est incertaine — la réponse expire sans
qu'on sache si la requête est arrivée — ne doit plus être rejouée : la rejouer fabrique un
doublon silencieux. L'arbitrage a explicitement **écarté la voie « recharger avant de
rejouer »**, parce qu'un rechargement perd la saisie de l'utilisateur.

**Ce qui s'est produit.** Le correctif écarte bien cette voie dans le code — et **son
bandeau dit à l'utilisateur de recharger**, bouton à l'appui. L'utilisateur fait ce qu'on
lui dit. Mesuré au 6ᵉ passage : **écran 0, base 0**, et un message vert « Données
rechargées ». Le doublon silencieux a été échangé contre une **destruction silencieuse**.
Comparaison A/B sans aucun geste pendant 26 s : code antérieur `base=1` (la saisie
finissait par arriver seule), code actuel `base=0`.

**La cause est ce qu'on avait loué.** Une **seule formulation** servait les deux couches —
le refus côté données et le message côté écran — « pour que le fait ne puisse pas
diverger ». L'intention est juste : deux phrases qui disent la même chose finissent par
se contredire, ce chantier l'a payé neuf fois. Mais la phrase retenue était vraie pour la
**reprise** (où recharger est le bon geste) et destructrice pour une **création bloquée**
(où recharger jette la saisie).

> **La leçon, et elle se transfère au-delà de ce produit : un même mot, vrai à un endroit
> et faux à l'autre, voyage d'autant mieux qu'on a pris soin de n'en avoir qu'un.** La
> mutualisation d'un libellé n'est sûre que si les deux couches partagent la même
> *situation*, pas seulement le même *code d'erreur*. Le remède n'est pas de dupliquer la
> phrase, c'est de vérifier — par un essai qui suit le geste que le message recommande —
> que **le conseil donné à l'utilisateur ne détruit rien**.

C'est aussi pourquoi le contrôle **S18** de la grille existe (« le produit fait ce qu'il
doit faire ») : aucun contrôle de sécurité n'était en échec ici, et le produit détruisait
le travail de son utilisateur.

#### La borne de corps du frontal est un **pré-filtre**, pas une barrière

À écrire tel quel, parce que la version précédente de cette page affirmait le contraire
et que c'est exactement ce qu'un lecteur pressé irait chercher ici.

**Ce qui a été trouvé** : `LimitRequestBody` **ne s'applique pas à un corps relayé**. La
directive est appliquée par le filtre d'entrée HTTP d'Apache, et `mod_proxy_http` prend
la main avant lui — y compris quand la directive est posée dans un `<Location /api/>`.
Mesuré : 28 311 552 octets traversent le frontal en entier alors que la borne annonce
27 262 976 ; le **même** envoi sur `/index.html`, dans le **même** serveur, rend `413`.
Le vhost et `install.sh` affirmaient tous deux l'inverse — et `install.sh` **imprimait
« ok » en comparant deux nombres dont l'un n'agissait pas**, ce qui est la définition
d'un contrôle qui ne contrôle rien.

**Ce qui est en place maintenant**, et il y a deux étages :

| Étage | Ce qu'il arrête | Ce qu'il n'arrête pas |
|---|---|---|
| **Pré-filtre du frontal** (`mod_rewrite` sur `Content-Length`, avant `mod_proxy`) | l'envoi surdimensionné **ordinaire** — un export trop gros, un client qui se trompe. Mesuré : 28 311 552 o annoncés → **413 en 6 ms**, la doublure ne reçoit rien | ⚠️ **un corps sans `Content-Length`, en `Transfer-Encoding: chunked`** : mesuré, 28 Mio passent entiers. Donc **pas un client hostile qui choisit son encodage** |
| **Borne applicative** (Fastify, `bodyLimit`, `src/serveur.ts`) | tout corps hors borne, **quel qu'en soit l'encodage**, et rend `413` | — |

> ⚠️ **Ne présentez pas le pré-filtre comme la barrière du contrôle S13.** Ce n'est pas
> elle : **la barrière qui tient pour l'API est applicative**, en aval du frontal, parce
> qu'elle voit le corps réel. Le trou du `chunked` est un constat ouvert, **reporté par
> écrit au lot L3** — il se ferme avec la limitation de rythme, au même endroit et pour
> la même raison. Le dire autrement rendrait ce paragraphe aussi faux que celui qu'il
> remplace.

Et le contrôle d'installation a changé de nature : il ne compare plus deux nombres, il
**envoie un corps hors borne et constate le refus** (bloc « banc: corps » de
`deploy/install.sh`). C'est la même leçon que le 7ᵉ passage : *un contrôle doit
interroger le chemin que l'utilisateur — ou l'attaquant — emprunte, pas celui qui est
commode à écrire.*

#### Une réserve écrite n'est pas une réserve traitée — le bloquant du 7ᵉ passage

Sept passages de porte ont écrit, honnêtement et sans se contredire, que le vhost
n'était pas éprouvé faute d'Apache sur la machine. C'était vrai, c'était consigné, et
c'était **reporté de passage en passage** — pendant que l'environnement manquant
s'installait en une minute. L'auditeur du 7ᵉ l'a installé. Trois défauts sont sortis
**du seul fait de faire tourner le vhost**, dont un bloquant :

| Ce qui est sorti | Effet mesuré |
|---|---|
| 🛑 La liste blanche du vhost rendait **403 sur `/`** | **L'application était injoignable à son URL d'entrée.** Un motif à négation est vrai sur le basename vide d'une requête de répertoire : l'autorisation était refusée **avant** que `DirectoryIndex` n'atteigne `index.html` |
| **2 166 105 octets de JavaScript servis sans compression** | Apache 2.4.58 sert les `.js` en `text/javascript` ; le vhost écrivait `application/javascript` dans deux directives — **aucune ne s'appliquait**. Corrigé : 2 166 105 → 673 339 octets, et la revalidation **horaire** disparaît au profit des sept jours annoncés |
| Le **logo mis en cache trente jours sans être versionné** | Le bloc énonçait lui-même que le cache long n'est sûr que couplé au jeton de version — et `injecter_jeton_frontend` ne réécrit que les URL `.js` et `.css`. Changer le logo restait invisible jusqu'à trente jours |

> **Deux règles en sortent, et elles valent plus que les trois correctifs.**
>
> 1. **Une réserve écrite n'est pas une réserve traitée.** L'écrire est honnête ; s'y
>    arrêter ne l'est plus dès l'instant où lever la réserve coûte moins cher que la
>    reconduire. Une réserve doit porter, comme un constat, un propriétaire et une
>    échéance — sans quoi elle devient un alibi qui se transmet de passage en passage.
> 2. **Un contrôle doit interroger le chemin que l'utilisateur emprunte, pas celui qui
>    est commode à tester.** La vérification prescrite interrogeait `/index.html` — elle
>    est restée **au vert** pendant que `/` rendait 403. Un contrôle qui évite le chemin
>    réel ne mesure pas le produit, il mesure lui-même.

**Et une méthode, pour les types de contenu** : le vhost porte désormais un **tableau de
ce qu'Apache émet réellement**, extension par extension, mesuré sur un fichier témoin, à
la place de ce qu'on écrivait de mémoire. On y lit par exemple que `.ico` sort en
`image/vnd.microsoft.icon` et non `image/x-icon` — rien n'est cassé aujourd'hui, mais
quiconque aurait voulu le mettre en cache l'aurait écrit faux. Avant d'ajouter un type à
une directive, **servir un fichier de ce type et lire l'en-tête**.

#### Deux défauts de la conduite elle-même, et pourquoi ils sont ici

Ce §8 recense l'état d'un lot. Ces deux-là ne portent pas sur le produit mais sur la
manière dont on le suit — et ils y ont leur place, parce qu'un lecteur qui reprend le
chantier héritera des deux avant d'écrire une ligne de code.

**1. Le registre des constats a perdu la ligne d'un bloquant, en silence.** Le tableau de
`../docs/PLAN_EXECUTION.md` §7 — que le `CLAUDE.md` désigne comme *la seule source des
verdicts* — a porté treize barres sur une ligne au lieu de sept : deux constats s'étaient
collés, le tableau rendait **42 lignes au lieu de 43**, et l'absent était **le seul
bloquant d'un passage**. La cause était une substitution automatique, faite en fermant le
constat qui disait précisément *qu'une case d'état vide passe inaperçue*.

> La réparation ne suffisait pas, et c'est le point : **le registre existe pour qu'aucun
> constat ne se perde ; qu'il en perde un méritait mieux qu'une correction.** Il est
> désormais **gardé par quatre essais de forme** (`test/documentation/`) qui ne jugent
> aucun contenu — sept barres par ligne, numérotation continue et sans doublon, cases
> « Propriétaire » et « État » jamais vides. C'est l'application du `CONVENTIONS.md` §24 à
> la conduite elle-même : une liste écrite à la main n'est le bon outil **que si un
> contrôle la confronte au réel**.

**2. Un commit peut ne pas se tenir seul, et rien ne le vérifiait.** Une quinzaine
d'instantanés ont été figés « vérifiés et verts » en mesurant **l'arbre de travail**, pas
le commit. L'un d'eux commitait un essai qui appelait une fonction restée non commitée :
**à cette révision, il ne s'importait pas.** Le banc ne pouvait pas le voir — il s'exécute
sur l'arbre, où les deux fichiers coexistent.

> La règle qui en découle vaut pour quiconque reprend, et pour moi le premier : **« vert »
> qualifie une révision, jamais un répertoire de travail.** C'est la même exigence que le
> point de mesure de ce document — un chiffre sans sa révision est invérifiable —, et
> elle a une conséquence pratique : mesurer sur un export propre de la révision
> (`git archive`) plutôt que dans l'arbre où d'autres agents écrivent.

### Réserves — ce qui n'est pas vérifié, et ce qui est sciemment reporté

**Sur l'état des lots**

- **« Corrigé » et « rejoué » ne se confondent pas, et le 6ᵉ passage vient de le
  démontrer deux fois.** D'abord parce qu'il a **rejoué 22 des 28 constats par mutation**
  — en cassant délibérément chaque correctif pour vérifier que le banc rougit —, ce qui
  est la seule preuve qu'un correctif tient. Ensuite, et surtout, parce qu'il a trouvé
  qu'**un constat que le registre annonçait fermé et vérifié ne l'était pas** : détecteur
  neutralisé, banc **vert 43/43**, et aucune occurrence dans les essais — les « silences
  vérifiés » que le registre citait appartenaient à d'autres mécanismes. Un correctif
  accepté au passage précédent a par ailleurs produit le **bloquant** de celui-ci.
  L'état constat par constat vit dans le **registre** du
  [plan d'exécution](../docs/PLAN_EXECUTION.md) §7 — seule liste, volontairement — et sa
  colonne d'état se lit en sachant qu'une coche verte y est une **hypothèse**, pas un
  quitus.
- **Une partie de ce qui reste ouvert l'est par décision écrite, pas par oubli** — et
  c'est ce que la colonne d'état du registre permet de vérifier plutôt que de croire. Elle
  distingue un **report** (un constat rattaché au lot qui aura l'occasion de le traiter)
  d'un constat **en cours de correction**, et cette seconde catégorie se remplit encore :
  l'écriture des essais de fermeture en a fait apparaître au moins un de plus. **Ne lisez
  donc pas la liste ci-dessous comme exhaustive** : elle nomme les reports, parce qu'un
  report est une décision qui doit être relisible ; le compte des constats ouverts, lui, se
  lit dans le registre et nulle part ailleurs.

  Les reports, donc : un relève du **lot L3** (le coût d'analyse de corps avant toute
  authentification, qui se règle avec la limitation de rythme en `onRequest`), un du
  **lot L5** (un garde-fou qui mesure une **longueur** là où le `CONVENTIONS.md` §2 norme
  désormais une **entropie** : rien ne casse aujourd'hui, mais aligner un jour le
  générateur SQL le ferait crier à tort) et un du **lot L7** (aucun plafond de durée ni de
  volume sur une reprise).
- **Un constat n'est pas fermé, et le dire vaut mieux que le fermer à moitié.** Le
  repli d'`applyImport` — emprunté seulement contre un serveur qui ne porte pas
  `/api/reprise`, c'est-à-dire lors d'un retour arrière — réécrit **toute chaîne égale
  à l'identifiant renommé**, dans toutes les collections et tous les champs. Le fermer
  proprement supposerait de savoir **quels champs sont des références** : or
  `/api/modele` rend le *type* d'une colonne, jamais sa nature de référence, et les
  références imbriquées vivent dans des documents JSONB dont il ne dit rien. Écrire
  cette liste à la main fermerait le cas d'aujourd'hui et rouvrirait celui que ce
  chantier a déjà payé deux fois : le champ neuf que personne n'y ajoute, et dont la
  référence se met à pointer dans le vide sans que rien ne le dise. **Une fermeture
  partielle serait pire que le défaut.** Ce qui est fait à la place : le cas ne se
  produit plus en silence — quand l'identifiant renommé n'a pas la forme distinctive du
  `CONVENTIONS.md` §2 (un export très ancien peut porter `"7"`) et que le balayage a
  touché autre chose que l'enregistrement lui-même, **le fait est affiché, avec le
  compte des réécritures faites au dehors**.
- **La famille de constats qui a le plus coûté, et qu'il faut connaître avant de lire
  les chiffres ci-dessus comme un acquis : les générateurs d'identifiants.** Le produit
  en fabrique à **cinq endroits, dans trois langages** — trois générateurs aléatoires et
  deux dérivations qui ne tirent rien (`CONVENTIONS.md` §2) — et le durcissement de l'un
  a **deux fois** laissé les autres derrière. Il n'en reste aujourd'hui aucun de faible
  dans `src/reprise/`, où les deux sites **dérivent** au lieu de tirer.
- **Un garde-fou qui cesse d'être découvert ne disparaît plus en silence.**
  `f_verifier_schema()` ne refusait que s'il ne découvrait **aucun** contrôle : une
  migration qui renomme ou re-signe une fonction en aurait effacé un sans un mot. La
  table `controles_schema` (migration `005_controles_schema.sql`) tient désormais le
  **registre nominatif** des garde-fous branchés, et `f_verifier_schema()` **compare** ce
  qu'elle découvre à ce registre. Retirer un contrôle devient un geste explicite —
  `select f_retirer_controle_schema('f_verifier_<x>', '<motif>')`, dans la migration qui
  le retire — au lieu d'une omission silencieuse. Neuf contrôles y sont enregistrés
  depuis la migration `007_authentification.sql` (constat Q-77, ci-dessous).
- ✅ **Ce qui était une réserve — « vérifié sur 16.13, la cible est 17 » — est
  maintenant une mesure.** `db/migrate.mjs` a fait passer les 7 migrations sur
  **PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2)**, le paquet réellement livré par le
  dépôt PGDG sur la VM cible, et non plus seulement sur 16.13 : 48 tables, RLS activée
  et forcée 48/48, 192 politiques, `f_verifier_schema()` → 0 anomalie. Aucune
  fonctionnalité postérieure à 16 n'était employée non plus ; l'écart est désormais
  éprouvé, pas seulement présumé sans conséquence.

**Sur l'environnement**

- ✅ **La réserve d'environnement s'est beaucoup réduite, et c'est le 7ᵉ passage qui l'a
  fait.** Pendant six passages, ce paragraphe disait « Apache n'est pas éprouvé, faute
  d'Apache sur la machine ». **Apache, `mod_deflate`, `mod_expires`, `mod_proxy`,
  `openssl` et `rsync` sont désormais installés et éprouvés** — la version alors mesurée,
  **2.4.58**, était celle d'un conteneur Ubuntu **depuis retiré** (voir le bullet Q-77
  juste après pour la version réellement installée aujourd'hui, **2.4.68**) : le banc
  monte un Apache réel sur le vhost du dépôt, interroge **l'URL d'entrée**, publie les
  fichiers par `rsync`, et mesure ce qui sort. Trois défauts — dont un bloquant — sont
  sortis du seul fait de le faire tourner ; voir « Une réserve écrite n'est pas une
  réserve traitée » ci-dessus. Le comportement du mandataire à l'expiration de
  `ProxyTimeout`, hypothèse la plus chargée du correctif de la reprise, est mesuré lui
  aussi : **la transaction est bien annulée**.
- ✅ **La politique TLS livrée est mesurée**, pour la première fois, au 8ᵉ passage — ce
  qui restait la dernière affirmation du vhost prise sur parole.
- ✅ **Le banc a longtemps mesuré une doublure Ubuntu du frontal, pas la cible — constat
  Q-77.** Les deux bullets ci-dessus datent des 7ᵉ et 8ᵉ passages, joués sur un conteneur
  qui portait Apache 2.4.58 : juste comme mesure de ce qu'ils décrivaient, mais **ce n'était
  pas l'environnement de déploiement**. Depuis le 03/09/2026 le chantier tourne sur la VM
  Debian 13 réelle, et les mêmes propriétés y ont été rejouées, le 04/09 à la révision
  `1590c47` : **Apache/2.4.68 (Debian)**, dont `/etc/mime.types` déclare bien
  `text/javascript` pour les `.js` — la prémisse du correctif Q-42 tient donc aussi
  sur la cible, et les 59 scripts d'`index.html` sont mesurés à
  **2 248 762 → 699 088 octets** derrière le vhost livré ; **PostgreSQL 17.11**
  (dépôt PGDG, et non plus 16.13) ; l'unité systemd réelle
  rend **`systemd-analyze security` → 1,3 OK** ; la chaîne TLS livrée (PKI à deux niveaux)
  vérifie **propre** (`openssl s_client` : `Verify return code: 0`) ; `clamd` est actif.
  Un **Active Directory Samba réel** a par ailleurs été monté pour la recette (23 groupes
  `GRC-*`, un groupe imbriqué — constats **Q-83**/**Q-84**) — ce n'est pas celui du
  client, mais ce n'est plus la doublure JavaScript seule.
- ⚠️ **Ce qui reste hors de portée sur cette machine** : le **relais SMTP** et
  l'**Active Directory de production du client**. Le second reste **interdit aux
  essais** par construction — un banc qui éprouve le cas négatif (mot de passe faux,
  compte verrouillé) sur un annuaire réel verrouillerait des comptes réels. Tout le
  reste de ce qui figurait ici — TLS d'une vraie PKI, installation Debian 13 complète,
  unité systemd, ClamAV — **est désormais éprouvé** (bullet ci-dessus).
- ⚠️ **Une barrière est ouverte et reportée par écrit** : le pré-filtre de corps du
  frontal ne borne pas un corps en `Transfer-Encoding: chunked` (voir « La borne de corps
  du frontal » ci-dessus). La borne applicative tient ; le trou du frontal se ferme au
  **lot L3**, avec la limitation de rythme.
- Le lot **L6** (pièces jointes) recettera sa **chaîne d'analyse antivirale** sur le
  ClamAV réel désormais actif sur la machine — c'est la chaîne elle-même (dépôt →
  `clamd` → verdict) qui reste à construire, le lot n'ayant pas commencé, pas l'outil à
  installer. Le lot **L3** a été recetté contre un **Active Directory réel** (Samba)
  plutôt que sur la seule doublure JavaScript ; l'AD du client reste, lui, hors de
  portée. Le lot **L12** (notifications) reste sur une doublure : le **relais SMTP** du
  client n'est accessible ni en essai ni en recette.

⚠️ **Quatre lignes de ce tableau annonçaient encore, sous ces mêmes intitulés, des
manques que le lot L3 avait déjà comblés — un lecteur en concluait que le produit ne fait
pas ce qu'il fait. C'est le constat Q-90, et il ferme ainsi :**

| Ce que cette section disait ouvert | Ce qui est vrai, vérifié dans le code |
|---|---|
| `sessions`, `session_filiales`, `session_domaines` **écrivables sans condition** par le rôle applicatif | ✅ **fermé** — migration `007` : toute écriture y exige `grc.authentification = 'oui'`, posé uniquement par `src/auth/**` (condition **E1**), et gardée par le neuvième contrôle de `f_verifier_schema()` (§5) |
| **Aucun contrôle de droits par domaine, aucun droit d'export distinct** | ✅ **fermé** — un niveau **par domaine** (`DroitsSession.niveaux`, émis par `src/droits/passerelle-api.ts`, consommé par `src/api/droits.ts` : constat **Q-66**) ; `exporter` est une action que `deciderAcces` refuse indépendamment de `lire` (`droits.export`), portée par sa propre route (`GET /api/export`, §4) |
| **Aucune limitation de rythme** | ✅ **fermé** — condition **E4** (`src/api/limiteur.ts`) : les requêtes sans session sont bornées en `onRequest`, **avant** l'analyse du corps ; le constat **Q-10** qu'elle devait traiter est clos avec elle |
| Un garde-fou mesure une **longueur** là où le §2 norme une **entropie** (constat Q-14) | ✅ **fermé depuis la migration `006`**, et cette ligne-ci était la seule du document à ne pas encore le savoir : `f_verifier_entropie_identifiants()` mesure désormais des **bits** (plancher 52), pas des caractères — le détail et la mesure de pouvoir de détection sont au §5 ci-dessus |

Ce que ces quatre lignes ne disaient pas, et qu'il faut ajouter : **la couverture** de ces
propriétés n'est pas encore éprouvée par un banc qui les attaque toutes — c'est le rôle de
la porte de sécurité, pas de cette page.

**Dette réellement reportée, assumée et datée** — un report écrit vaut mieux qu'un silence :

| Sujet | Décision | Échéance |
|---|---|---|
| **Clés primaires composites** reportées | Arbitrage écrit et daté au `CONVENTIONS.md` §21. | **condition d'entrée du lot L3** |
| ~~**La lecture du journal d'audit n'est pas cloisonnée**~~ | ✅ **FERMÉE le 04/09/2026** par `008_journal_lecture.sql` (condition **E6**). Les deux fonctions du chaînage sont `security definer` et la politique suit le périmètre. ⚠️ La justification qui reportait cette dette — « sans effet tant que le journal est vide » — a été **réfutée par la mesure** : `grc_lecture` y lisait **160 entrées**, logins et adresses IP compris | — |
| ~~**La couverture du journal d'audit** par l'API~~ | ✅ **FERMÉE le 04/09/2026** (lot L5). **16 actions sur 20 sont émissibles** — création, modification, suppression avec différentiel, export, import, administration, refus de droit par requête, démarrage, arrêt, consultation et vérification, plus les cinq de la connexion. Les quatre restantes sont reportées **par écrit** : `purge` et `archivage` à l'exploitation (`CONVENTIONS.md` §12), `approbation` au lot L8, `analyse_antivirus` au lot L6 | — |
| Le drapeau `grc.administration_groupe` est une **déclaration que la session fait sur elle-même**, pas un privilège | Il protège contre la faute de programmation, **pas** contre un rôle applicatif compromis, qui le poserait avant d'écrire. La règle tenue aujourd'hui — *toute route qui l'exige le vérifie, aucune ne le pose* — est vraie et démontrée par un test ; à L3 de la rendre **structurellement** vraie. | **lot L3** (`CONVENTIONS.md` §17.4) |
| Supprimer un compte ou une filiale cité au journal est **structurellement impossible** (`restrict` + journal en ajout seul) | Cohérent avec la rétention de trois ans, mais la « purge explicite » de sortie de filiale (`PLAN_SERVEUR` §2.7) n'a aucun chemin applicatif. | procédures d'exploitation à écrire au **lot L13**, avec les purges RGPD |
| Aucun plafond de durée ni de volume sur une reprise | Une reprise de 12 000 enregistrements tient une connexion du pool une vingtaine de secondes ; `statement_timeout` borne l'instruction, jamais la transaction (constat Q-9). | **lot L7** (import) |

Enfin, ce que le dispositif **ne** couvre **pas**, et qui est assumé : ni un `root`
sur la VM, ni un superutilisateur PostgreSQL. Le journal protège contre l'application
et contre l'administrateur *applicatif* — pas contre le DBA système, pour qui le
chaînage par empreinte rend l'altération **détectable** à défaut d'impossible.
