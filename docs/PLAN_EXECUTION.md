# Plan d'exécution — chantier serveur Cyber GRC Groupe

> **Comment le chantier `docs/PLAN_SERVEUR.md` est réellement conduit** : découpage en
> vagues de travail parallèle, répartition entre agents, et **portes de sécurité** qui
> ferment chaque vague.
>
> Le **quoi** vit dans [`PLAN_SERVEUR.md`](PLAN_SERVEUR.md) (cadrage, fait autorité) et dans
> [`../backend/db/CONVENTIONS.md`](../backend/db/CONVENTIONS.md) (normes de schéma).
> Ce document dit **qui fait quoi, dans quel ordre, et à quelle condition c'est accepté**.
> L'état réel des lots reste dans [`../backend/README.md`](../backend/README.md) §8.

---

## 0. Pourquoi ce document

Le plan serveur découpe le projet en seize lots (L0 → L15) mais ne dit pas comment les
mener de front sans que le travail se marche dessus. Trois risques, propres à un chantier
conduit par plusieurs agents en parallèle :

1. **Collision d'écriture** — deux agents modifient le même fichier et le dernier écrase.
   Parade : §2, *propriété exclusive des fichiers*. Un fichier a un propriétaire et un seul
   par vague.
2. **Dérive silencieuse** — un agent réinvente une convention plutôt que de lire
   `CONVENTIONS.md`. Parade : §5, la définition de « terminé » exige la conformité aux
   conventions, vérifiée à la porte.
3. **Sécurité repoussée à la fin** — c'est le défaut classique, et il est rédhibitoire ici :
   le plan prévoit une revue de sécurité en L15, mais un défaut de cloisonnement introduit
   en L2 et découvert en L15 se paie en réécriture. Parade : §4, **une porte de sécurité
   ferme chaque vague**, avec une grille rejouée intégralement à chaque fois.

---

## 1. Principe : vagues et portes

```
   Vague N                                  Porte de sécurité N
   ┌───────────────────────────────┐        ┌────────────────────────┐
   │ agents en parallèle,          │        │ auditeur indépendant   │
   │ fichiers disjoints            │──────► │ grille §4 rejouée      │──► Vague N+1
   │ chacun prouve son travail     │        │ intégralement          │
   └───────────────────────────────┘        └────────────────────────┘
                                                 │ constat bloquant
                                                 ▼
                                            correction, re-passage
```

Règles de conduite :

| Règle | Détail |
|---|---|
| **Parallélisme** | Les agents d'une même vague travaillent simultanément sur des fichiers disjoints (§2). |
| **Séquencement** | Une vague ne démarre pas tant que la porte précédente n'est pas franchie. Le chemin critique du plan (L0→L1→L2→L3→L4) l'impose de toute façon. |
| **Preuve d'exécution** | Aucune livraison n'est acceptée sur la seule lecture du code : migrations rejouées sur base neuve, tests exécutés, sortie collée dans le rapport. |
| **Auditeur indépendant** | L'agent qui contrôle n'est jamais celui qui a écrit. Il travaille en lecture seule et rend un rapport, pas un correctif. |
| **Constat bloquant** | Un défaut de la grille §4 arrête la vague. Il est corrigé, puis la porte est rejouée — pas seulement sur le correctif, sur la grille entière. |
| **Commit par vague** | Le travail est validé et poussé à la fermeture de chaque porte, jamais au milieu d'une vague. |
| **L'orchestrateur nomme ses chemins** | Tant qu'un agent écrit, l'orchestrateur commite **des chemins explicites**, jamais `git add -A` — et **nomme seulement les chemins du travail que le titre décrit**. La première rédaction de cette règle s'est révélée insuffisante le jour même : nommer *tous* les fichiers modifiés, en signalant honnêtement dans le corps du message que d'autres agents écrivaient, reproduit le défaut — le titre continue d'attribuer une borne de reprise, un vhost et un installateur à un commit sur un garde-fou d'entropie. Ce qui est fini se commite sous son titre ; ce qui est en vol se commite à part, sous un titre qui dit qu'il est en vol. Appris le 01/09/2026 : un `-A` a emporté le travail en vol de trois agents sous un message qui parlait d'autre chose. Rien n'a été cassé — le banc était vert — mais l'historique attribue désormais un correctif de garde-fou à un commit sur une table de synthèse. C'est la même famille que les divergences que ce chantier passe son temps à corriger : **une trace qui dit autre chose que ce qui s'est passé**, et elle ne se répare pas après coup sur une branche déjà poussée. |

---

## 2. Rôles et propriété des fichiers

Sept rôles. Un agent en endosse un pour la durée d'une vague ; il **n'écrit que dans son
périmètre** et signale au lieu de corriger ce qui appartient à un autre.

| Rôle | Compétence | Périmètre d'écriture exclusif |
|---|---|---|
| **SCHEMA** | PostgreSQL, DDL, RLS, contraintes | `backend/db/migrations/*.sql` |
| **OUTILLAGE** | Exécuteur de migrations, banc d'essai, jeux d'essai | `backend/db/migrate.mjs`, `backend/db/verifier_*.sql`, `backend/db/dev/**`, `backend/test/**` (l'aide partagée `test/aide/**` comprise) |
| **REPRISE** | Absorption des exports `grc-backup`, migrations v1→v12 | `backend/src/reprise/**`, `backend/test/reprise/**` |
| **API** | Node/TypeScript, Fastify, accès aux données | `backend/src/entites/**`, `backend/src/api/**`, `backend/src/db/**` |
| **AUTH** | LDAPS, sessions, droits à trois axes | `backend/src/auth/**`, `backend/src/droits/**` |
| **FRONT** | Bascule de la persistance côté SPA | `cyber-gouvernance_V4/js/core/**`, `cyber-gouvernance_V4/js/services/**` |
| **MODULES** | Les 26 modules métier de la SPA | `cyber-gouvernance_V4/js/modules/**`, `cyber-gouvernance_V4/js/app.js` |
| **SECU** | Revue adversariale — **lecture seule** | `docs/securite/RAPPORT_*.md` uniquement |
| **DÉPLOIEMENT** | Installation, service systemd, frontal Apache, **livraison du frontend au poste** | `backend/deploy/**`, `cyber-gouvernance_V4/index.html` |
| **DOC** | Exploitation et traçabilité | `backend/README.md`, `CHANGELOG.md`, `docs/DATA_MODEL.md`, `CLAUDE.md` |

Un rôle absent de ce tableau est une lacune, pas une permission : deux agents ont dû
écrire dans `backend/src/reprise/**` et `backend/test/aide/**` sans qu'aucun rôle les porte,
ce que la porte S1 a relevé (constat m-6). **Tout fichier neuf est attribué avant d'être écrit.**

Le motif s'est reproduit **trois fois** malgré cet avertissement : les 26 modules métier de la
SPA, puis `index.html`, relevé à trois passages de la porte S2 sans que personne ne puisse le
prendre. Une lacune de propriété se voit dans les rapports d'audit avant de se voir dans le
plan — c'est le signe qu'il faut relire cette table à chaque ouverture de vague, et non
seulement quand un agent bute dessus.

Quatre fichiers sont **partagés et donc réservés à l'orchestrateur** : ce document,
`backend/db/CONVENTIONS.md`, `backend/package.json` et `backend/.env.example`. Un agent qui a besoin d'une dépendance ou
d'une variable de configuration la demande dans son rapport ; il ne l'ajoute pas lui-même.

---

## 3. Les vagues

Dépendances reprises du `PLAN_SERVEUR` §7. Le chemin critique est signalé 🔴.

### Vague 1 — Clore L1 : le schéma relationnel 🔴

Le socle (`001_socle.sql`, 16 tables) est livré. Manquent les entités métier, la RLS et
l'outillage qui permet de les rejouer et de les prouver.

| Agent | Livrable | Critère d'acceptation |
|---|---|---|
| SCHEMA | `002_metier.sql` — les 21 entités du `DATA_MODEL`, les 8 tables de liaison (`CONVENTIONS` §7), la **scission `mesure_catalogue` / `mesure_mise_en_oeuvre`**, le découpage Groupe / Filiale / Mixte (`PLAN_SERVEUR` §2.2) | S'applique sur base neuve après `001` ; toute cascade du `CONVENTIONS` §8 démontrée par un cas d'essai |
| SCHEMA | `003_rls.sql` — rôles, politiques de lecture et d'écriture, `force row level security` sur **toutes** les tables à `filiale_id` | Aucune table à `filiale_id` sans politique ; `grc_app` sans `bypassrls` |
| OUTILLAGE | `db/migrate.mjs` — exécuteur référencé par `install.sh` mais jamais écrit | Transactionnel, idempotent, ordre déterministe, refuse une migration modifiée après application |
| OUTILLAGE | `db/verifier_cloisonnement.sql` + banc d'essai `npm test` | Démontre qu'une session sur la filiale A ne voit **aucune** ligne de la filiale B |

**Porte S1** : cloisonnement, journal inaltérable, cascades, conformité aux conventions.

### Vague 2 — L2 : API et bascule de la persistance 🔴

Le lot qui porte le risque projet **P1** (écrasement silencieux). Il se traite ici, pas après.

| Agent | Livrable |
|---|---|
| API | Couche d'accès générique par entité (lecture, écriture ciblée, suppression), **verrouillage optimiste** (`update … where id = $1 and version = $2`, zéro ligne → `GRC03`), transactions pour les opérations composites |
| API | Chargement initial du jeu de données d'une filiale, écritures ciblées, sondage de rafraîchissement (`PLAN_SERVEUR` §1.3) |
| FRONT | Détournement de `save()` et du chargement dans `datastore.js` / `persistence.js` — **la façade synchrone est préservée, aucun module métier n'est réécrit** (§1.3, risque P3) |
| OUTILLAGE | Test de concurrence : deux écritures sur la même version, une seule passe |

**Porte S2** : injection, contrôle d'accès, verrouillage optimiste, dénis de service, fuite dans les erreurs.

### Vague 3 — L3 authentification et droits 🔴, puis L5 journal

**Six conditions d'entrée** sont écrites au `CONVENTIONS.md` §22, avec l'endroit où chacune fait
foi et la façon dont la porte S3 la vérifiera. Elles se lisent **avant** de répartir le travail :
trois d'entre elles (E1, E2, E3) ne sont pas des améliorations, ce sont des dettes que la vague 1
et la vague 2 ont contractées **au nom de cette vague-ci**.

| Agent | Livrable | Critère d'acceptation |
|---|---|---|
| SCHEMA | `005_*.sql` — politiques d'écriture du substrat de session adossées au réglage `grc.authentification` (**E1**), corrections `comment on` des textes rendus faux (**E5**), et ce que le modèle de droits exige en base | Une session applicative ordinaire ne peut plus écrire dans `sessions`, `session_filiales`, `session_domaines` ; la transaction d'ouverture le peut. `migrate.mjs` ne sort pas en code 4. |
| AUTH | Liaison LDAPS, **résolution récursive des groupes imbriqués**, provisionnement à la première connexion, déprovisionnement qui invalide les sessions actives, sessions serveur, **trois axes** périmètre × profil × niveau, **droit d'export distinct**, compte de secours, limitation du rythme (`PLAN_SERVEUR` §1.5 et §3) | Une appartenance **indirecte** ouvre l'accès ; le retrait du groupe le coupe **et invalide les sessions en cours**, pas seulement la connexion suivante. Le compte de secours est journalisé à chaque usage. |
| API | Application des droits à chaque requête, contrôle d'authentification et limitation de rythme en **`onRequest`, avant l'analyse du corps** (**E4**), droit d'appel de la reprise (**E3**), alimentation de l'annuaire `personnes` depuis l'AD | Un corps volumineux non authentifié est refusé **sans que son analyse ait été payée** : la mesure de ~160 ms pour 18,6 Mo relevée à S2 doit s'effondrer. Aucune route ne pose le drapeau d'administration sans l'avoir décidé d'après la session (**E2**). |
| FRONT | Écran de connexion dans la **porte de démarrage existante** — `Vault.boot` établit déjà la liaison au serveur avant l'affichage —, traitement des `401`/`403`, expiration de session sans perte de saisie | Une session expirée pendant une saisie ne détruit pas la saisie. L'application **ne démarre pas** sur un jeu vide si le serveur refuse : la règle posée en vague 2 tient. |
| MODULES · OUTILLAGE | **Le filet de non-régression des 26 modules** (constat **Q-16**) — il n'en existe aucun, et vingt-trois entrées du journal affirment le contraire | Le protocole est **comportemental**, pas textuel : afficher chaque route de liste, forcer un renommage d'un enregistrement affiché, cliquer la première ligne, exiger que la navigation atteigne le **nouvel** identifiant. Une expression régulière rendrait des faux négatifs — distinguer un identifiant capturé en fermeture d'un identifiant lu dans le DOM demande une analyse de portée. Épingle du même geste la convention du DOM et l'affirmation non vérifiée de `recalerBalisage` |
| MODULES | Ce que les droits rendent conditionnel dans l'interface : entrées de menu, boutons d'écriture, **bouton d'export** | Un profil *Direction* (lecture, Groupe) ne se voit proposer aucune action d'écriture — et l'interface n'est **pas** la barrière : le serveur refuse aussi. |
| OUTILLAGE | Annuaire LDAP simulé pour la recette (aucun AD réel en développement), et le banc qui exerce les trois axes | Chaque profil du `PLAN_SERVEUR` §3.2 est exercé sur ses domaines **et sur ceux qu'il ne doit pas voir**. Un garde-fou se vérifie dans les deux sens (§20.2). |
| DÉPLOIEMENT | Variables de configuration LDAPS, autorité de certification interne, procédure de création des groupes AD **prête à exécuter** (`PLAN_SERVEUR` §3.4) | La liste des groupes est engendrée depuis la configuration des filiales, pas écrite à la main (§19.5). |

Puis, une fois L3 stable : **L5 — journal d'audit** (couverture complète des événements du
`PLAN_SERVEUR` §1.7, consultation, export, vérification du chaînage). **Le resserrement de la
lecture du journal est un livrable ferme de ce lot** (§22, E6) : il ne peut pas être fait plus
tôt, le chaînage par empreinte imposant l'ordre, et il ne doit pas être oublié.

**Ce que cette vague ne doit pas croire acquis** : trois protections tiennent aujourd'hui et ne
survivent pas seules à l'arrivée de l'authentification. Elles sont énumérées au `CONVENTIONS.md`
§22, en fin de paragraphe. La première est la plus traître : *le périmètre vient du serveur*
est vrai parce qu'aucun chemin ne le lit ailleurs — or L3 introduit précisément la couche qui
**fabrique** ce périmètre. Le contrôle S2 de la grille se rejoue contre elle, pas contre les
routes.

**Porte S3** : authentification, sessions, autorisation, couverture et inaltérabilité du journal.

### Vague 4 — L4 multi-filiales et L6 pièces jointes

| Agent | Livrable |
|---|---|
| API | Sélecteur de filiale, consolidation Groupe, activation des référentiels par filiale, création de filiale |
| API | Chaîne de contrôle des pièces jointes — les **8 contrôles** du `PLAN_SERVEUR` §1.6, ClamAV, empreinte SHA-256, quotas, ré-analyse périodique |
| FRONT | Sélecteur de filiale — le périmètre vient du serveur. *(Le retrait de `cyber-context` du `localStorage` est **fait** : la vague 2 l'a remplacé par un filtre en mémoire.)* |

**Porte S4** : cloisonnement effectif de bout en bout, chaîne pièces jointes, quotas.

### Vague 5 — L7 import, L8 approbation, L9 identité par filiale

Trois lots indépendants, parallélisables.

**Porte S5** : import transactionnel et cloisonné, irréversibilité des étapes d'approbation,
absence de SVG dans les logos.

### Vague 6 — L10 internationalisation de l'interface, L12 notifications, L13 cycle de vie

**Porte S6** : pas de fuite de données par les courriels, redirection de recette effective,
purges conformes au RGPD.

### Vague 7 — L11 traduction des catalogues, L14 documentation

**Porte S7** : relecture métier, paraphrase délibérée (droit d'auteur, `PLAN_SERVEUR` §4.2).

### Vague 8 — L15 durcissement final

Revue de sécurité complète, test d'intrusion interne, corrections. La grille §4 est rejouée
sur l'ensemble du produit, pas seulement sur la dernière vague.

**Porte S8** : condition de mise en service.

---

## 4. La grille de sécurité

Rejouée **intégralement** à chaque porte, par un agent qui n'a pas écrit le code. Un contrôle
sans objet à ce stade est marqué « sans objet », jamais « passé ».

| # | Contrôle | Origine | Preuve attendue |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | §1.9, §2.4 | Session filiale A : zéro ligne de la filiale B. `force row level security` sur toute table à `filiale_id`. `grc_app` sans `bypassrls`, non propriétaire. |
| **S2** | Le périmètre ne vient jamais du navigateur | §2.4 | Aucun chemin de code n'alimente `grc.filiale_id` / `grc.filiales` depuis un corps, une entête, un paramètre d'URL ou un cookie non signé. |
| **S3** | Journal d'audit inaltérable et complet | §1.7 | `update` / `delete` / `truncate` refusés (`GRC01`) ; `f_journal_audit_verifier()` ne renvoie rien ; chaque événement de la liste §1.7 tracé, **exports compris**. |
| **S4** | Verrouillage optimiste effectif | §1.4, risque P1 | Deux écritures concurrentes sur la même version : une passe, l'autre reçoit `GRC03`. Le client ne peut pas fixer `version`. |
| **S5** | Aucune injection SQL | §1.9 | 100 % de requêtes paramétrées. Tout identifiant interpolé vient d'une liste blanche close, jamais d'une entrée utilisateur. |
| **S6** | Droits vérifiés côté serveur à chaque requête | §1.9, §3 | Aucun point d'entrée sans contrôle. Un profil Lecture qui tente une écriture est refusé **par le serveur**, pas par l'interface. |
| **S7** | Le droit d'export est distinct de la lecture | §3.3 | Périmètre Groupe en lecture, sans `GRC-EXPORT` : export refusé. Tout export réussi ou refusé est journalisé. |
| **S8** | Secrets | §1.9 | Aucun secret dans le dépôt, dans une réponse d'API, dans un journal technique, ni dans un message d'erreur. |
| **S9** | Chaîne de contrôle des pièces jointes | §1.6 | Un cas d'essai par contrôle : liste blanche, macros, signature binaire, ClamAV, stockage hors webroot, délivrance forcée en pièce jointe, ré-analyse, quotas. |
| **S10** | Sortie et en-têtes | §1.9 | Échappement conservé (acquis du chantier 9), CSP stricte, `nosniff`, `no-store`, cookie de session `HttpOnly` + `SameSite` + `Secure`. |
| **S11** | Limitation du rythme et verrouillage | §1.9 | Martèlement de la connexion : verrouillage temporaire effectif, échecs journalisés. |
| **S12** | Les erreurs ne renseignent pas l'attaquant | §1.9 | Message générique côté client, détail au journal technique. Aucune pile d'appel, aucun nom d'objet de base en réponse. |
| **S13** | Dénis de service applicatifs | §1.2 | Taille de corps bornée, délais de garde posés, pool borné, listes paginées ou bornées. |
| **S14** | Intégrité des opérations composites | §1.4 | Propagation, cascade et import : tout ou rien. Aucun état intermédiaire observable après échec. |
| **S15** | Dépendances | §1.2 | `npm audit` sans vulnérabilité connue ; toute dépendance ajoutée est justifiée et épinglée. |
| **S16** | **Les garde-fous sont branchés** | retour d'expérience S1 | Tout contrôle automatique écrit (vérification de couverture RLS, de chemin de recherche, de privilèges) est **réellement appelé** par un chemin de déploiement ou de recette, et **fait échouer** ce chemin. Un garde-fou que rien n'invoque est un commentaire. |
| **S17** | **Le chemin complet a été parcouru pour de vrai** | retour d'expérience S2 | Dans un **navigateur réel**, contre le **serveur réel**, dans la **configuration de déploiement réelle** — vhost et en-têtes compris. Une démonstration écrite par l'auteur du code ne voit jamais l'écart entre ce qu'il a prouvé et ce que l'usage fait. |
| **S18** | **Le produit fait ce qu'il doit faire** | retour d'expérience S2 | Les gestes réels de l'utilisateur — créer, saisir un formulaire, importer, enregistrer, recharger — aboutissent, **et ne détruisent rien**. Un correctif de sécurité qui casse une fonction n'est pas un correctif : c'est un défaut d'une autre nature. |

**Pourquoi S18 existe.** L'agent qui tient le banc d'essai de la vague 2 l'a formulé mieux que
personne : *« la grille ne demande nulle part que le produit fonctionne »*. Cinq des constats de
la porte S2 — dont les trois bloquants, qui détruisent des données de l'utilisateur — **ne
violaient aucun des seize contrôles**. Un banc bâti sur la seule grille serait resté vert pendant
que l'application effaçait le travail de ses utilisateurs.

La démonstration est venue du chantier lui-même : le remède au constat sur l'oracle d'existence a
**cassé toute création depuis le navigateur** — plus un risque, plus un incident, plus un document
créable — et rien dans les dix-sept contrôles ne s'en serait ému.

**Pourquoi S17 existe.** La porte S2 a trouvé qu'une branche annoncée comme fonctionnelle dans
la démonstration de son auteur était **du code mort en usage réel** : le frontend n'envoyait pas
ce que la démonstration envoyait. Elle a aussi trouvé que, sous la politique de sécurité de
contenu du vhost livré, **les soixante-dix gestionnaires en ligne de vingt-cinq fichiers sont
bloqués** — l'application ne fonctionne donc pas dans sa configuration de déploiement, ce
qu'aucun test n'avait vu. Ces deux classes de défaut ne se voient que dans le chemin complet.

**Pourquoi S16 existe.** Il a été ajouté après le troisième passage de la porte S1, qui a
constaté qu'une fonction de vérification de la couverture RLS, écrite, testée et correcte,
**n'était appelée par aucun chemin de déploiement**. Une base sabotée passait les contrôles
d'installation au vert pendant que la fonction, si on l'avait appelée, remontait deux anomalies.
Les deux passages précédents ne l'avaient pas vu, parce que **la grille ne demandait nulle part
qu'un garde-fou soit branché** — seulement qu'il existe.

**Ce que la grille ne couvre pas, et qu'il faut dire** : elle ne remplace pas le test
d'intrusion prévu en L15, et elle ne protège pas contre un `root` sur la VM ni contre le
propriétaire de la base (`CONVENTIONS` §12). Ces limites sont assumées et documentées.

---

## 5. Définition de « terminé »

Une livraison n'est acceptée que si **tous** ces points sont vrais. C'est ce que vérifie la porte.

1. **Ça compile** — `npm run verifier-types` sans erreur (le mode `strict` est non négociable).
2. **Ça s'applique depuis zéro** — les migrations rejouées sur une base neuve, avec
   `ON_ERROR_STOP=1`, sans intervention manuelle.
3. **C'est prouvé** — les tests passent, et la sortie est **collée dans le rapport de l'agent**.
   Une affirmation sans sortie de commande n'est pas une preuve.
4. **C'est conforme** — `CONVENTIONS.md` respecté sans exception ; toute dérogation justifiée
   en commentaire, à l'endroit exact où elle est prise.
5. **C'est en français** — noms, commentaires, messages d'erreur, interface (`CLAUDE.md` §3).
6. **C'est documenté** — `backend/README.md` §8 reflète l'état réel, `CHANGELOG.md` est à jour,
   `DATA_MODEL.md` suit si le schéma bouge.
7. **C'est dans le périmètre** — aucun fichier modifié hors de la propriété de l'agent (§2).
8. **Les manques sont dits** — ce qui n'a pas été fait est listé explicitement, pas passé sous
   silence. Un lot partiel annoncé comme tel vaut mieux qu'un lot complet qui ne l'est pas.

---

## 6. Environnement de vérification

La machine de développement dispose de tout ce qu'il faut pour prouver le travail — il n'y a
donc aucune raison de livrer du SQL non exécuté.

```bash
# PostgreSQL local (démarré une fois par session)
pg_ctlcluster 16 main start

# Rôles de développement (mot de passe 'dev', jamais utilisé ailleurs)
#   grc_proprietaire · grc_app · grc_lecture

# Base neuve, propre à chaque agent, pour éviter les collisions
createdb -O grc_proprietaire grc_<agent>

# Application des migrations
PGPASSWORD=dev psql -h 127.0.0.1 -U grc_proprietaire -d grc_<agent> \
    -v ON_ERROR_STOP=1 -f backend/db/migrations/001_socle.sql
```

Réserves à garder en tête : la machine de développement porte **PostgreSQL 16**, la cible
**PostgreSQL 17** (dépôt PGDG, `install.sh`). N'utiliser aucune fonctionnalité postérieure à
16 sans le signaler. Il n'y a **ni Active Directory, ni ClamAV, ni relais SMTP** : les lots
L3, L6 et L12 se recettent sur des doublures, et cela doit être écrit dans leur rapport.

---

## 7. Journal d'avancement

| Vague | Lots | État | Porte |
|---|---|---|---|
| — | L0 socle d'infrastructure | ✅ livré | — |
| **V1** | L1 schéma relationnel | ✅ **livré, porte S1 franchie** au 5ᵉ passage, **confirmée au 6ᵉ** | S1 |
| **V2** | L2 API et bascule | ⚠️ **livré, porte S2 franchie au 4ᵉ passage puis REFUSÉE au 5ᵉ** — 3 majeurs, 3 mineurs, contrôle S17 en échec. **La vague 3 n'ouvre pas** (§1, règle de séquencement) | S2 |
| V3 | L3 authentification, L5 journal | ⬜ | S3 |
| V4 | L4 multi-filiales, L6 pièces jointes | ⬜ | S4 |
| V5 | L7 import, L8 approbation, L9 identité | ⬜ | S5 |
| V6 | L10 i18n interface, L12 notifications, L13 cycle de vie | ⬜ | S6 |
| V7 | L11 i18n catalogues, L14 documentation | ⬜ | S7 |
| V8 | L15 durcissement final | ⬜ | S8 |

**Jalon de mise en service pilote** : V1 à V4 (soit L0 → L6) sur **une filiale**, avec la vue
Groupe, avant généralisation aux vingt (`PLAN_SERVEUR` §7).

### Portes franchies

| Porte | Date | Verdict | Rapport |
|---|---|---|---|
| **S1** | 31/08/2026 | ❌ **refusée** — 1 bloquant, 3 majeurs, 6 mineurs | [`securite/RAPPORT_S1.md`](securite/RAPPORT_S1.md) |
| **S1** (2ᵉ) | 31/08/2026 | ❌ **refusée** — 1 bloquant, 3 majeurs, 3 mineurs, **tous neufs** | [`securite/RAPPORT_S1_BIS.md`](securite/RAPPORT_S1_BIS.md) |
| **S1** (3ᵉ) | 31/08/2026 | ❌ **refusée** — 0 bloquant, 4 majeurs | [`securite/RAPPORT_S1_TER.md`](securite/RAPPORT_S1_TER.md) |
| **S1** (4ᵉ) | 31/08/2026 | ⚠️ **franchie sous réserve** — 0 bloquant, 5 majeurs. **Réserve jugée bloquante par l'orchestrateur** : l'auditeur pose lui-même la lecture stricte, et le §18.4 exige un chemin de *déploiement* — le constat Q-1 est donc un échec du contrôle S16. Les cinq majeurs sont corrigés. | [`securite/RAPPORT_S1_QUATER.md`](securite/RAPPORT_S1_QUATER.md) |
| **S1** (5ᵉ) | 31/08/2026 | ✅ **FRANCHIE** — 0 bloquant, 3 majeurs, 5 mineurs. L'auditeur refuse explicitement la formule « sous réserve », qui avait endormi au quatrième passage, et assigne chaque correction à un lot. **Q5-1 et Q5-2 sont à fermer avant l'ouverture de la vague 2.** | [`securite/RAPPORT_S1_QUINQUIES.md`](securite/RAPPORT_S1_QUINQUIES.md) |
| **S1** (6ᵉ) | 31/08/2026 | ✅ **CONFIRMÉE FRANCHIE** — 0 bloquant, 0 majeur, 6 mineurs. Les trois majeurs du 5ᵉ passage sont fermés et rejoués un par un. *« Le premier correctif de la série qui ne se paie pas d'un nouveau major. »* **La vague 2 peut s'ouvrir.** | [`securite/RAPPORT_S1_SEXIES.md`](securite/RAPPORT_S1_SEXIES.md) |
| **S2** | 31/08/2026 | ❌ **refusée** — 3 bloquants, 9 majeurs, 9 mineurs. Le cœur serveur est juste et la façade réellement préservée ; **le lot casse aux jointures**, là où aucun test ne regarde : aucune route montée par le banc, une seule entité couverte, aucun test frontend. | [`securite/RAPPORT_S2.md`](securite/RAPPORT_S2.md) |
| **S2** (2ᵉ) | 31/08/2026 | ⚠️ **franchie selon l'auditeur — refusée par l'orchestrateur.** 0 bloquant, 4 majeurs, mais **S12 et S18 sont marqués en échec dans sa propre grille**. Un contrôle en échec ne se franchit pas : c'est la lecture appliquée à la porte S1 au quatrième passage, et elle ne change pas parce que le lot paraît proche de la fin. **Trois des quatre majeurs sont des défauts créés par les correctifs du premier passage.** | [`securite/RAPPORT_S2_BIS.md`](securite/RAPPORT_S2_BIS.md) |
| **S2** (3ᵉ) | 31/08/2026 | ❌ **refusée** — 1 bloquant, 4 majeurs, 9 mineurs ; **S18 en échec**. Un import en lot n'écrit qu'une partie de ses lignes **et annonce le succès**. Racine : un générateur d'identifiants à mille valeurs d'aléa, **signalé et chiffré dès la vague 1 et laissé de côté par l'orchestrateur**. | [`securite/RAPPORT_S2_TER.md`](securite/RAPPORT_S2_TER.md) |
| **S2** (4ᵉ) | 31/08/2026 | ✅ **FRANCHIE** — 0 bloquant, 4 majeurs, 7 mineurs, **aucun des dix-huit contrôles en échec**. Le bloquant du 3ᵉ passage est fermé **deux fois** : la seconde barrière tient sans la première, générateur saboté à trois valeurs et les quarante lignes arrivent quand même. | [`securite/RAPPORT_S2_QUATER.md`](securite/RAPPORT_S2_QUATER.md) |
| **S2** (5ᵉ) | 01/09/2026 | ❌ **refusée** — 0 bloquant, 3 majeurs, 3 mineurs. **Contrôle S17 en échec** : le défaut vit *entre* trois fichiers dont aucun n'a tort seul — le vhost coupe la reprise à 60 s pendant que le serveur valide sa transaction. Le cœur du lot n'est pas en cause : 46 sondes hostiles n'ont bougé ni le périmètre, ni une frontière de filiale, ni une requête SQL. | [`securite/RAPPORT_S2_QUINQUIES.md`](securite/RAPPORT_S2_QUINQUIES.md) |
| **S2** (6ᵉ) | 01/09/2026 | ❌ **refusée** — **1 bloquant**, 3 majeurs, 2 mineurs. **S17 et S18 en échec.** Le bloquant vise le correctif Q-27 **accepté à la porte précédente**, et l'arbitrage que j'avais rendu : il a échangé un doublon silencieux contre une **destruction silencieuse** — le bandeau dit de recharger, l'utilisateur recharge, et la saisie disparaît. Le reste tient : 22 des 28 constats rejoués par mutation, l'hypothèse la plus chargée de Q-19 enfin **mesurée** avec un mandataire (la transaction est bien annulée), 81 sondes hostiles sans effet, 107/107 au cloisonnement, 27 écrans sous la CSP réelle sans violation. | [`securite/RAPPORT_S2_SEXIES.md`](securite/RAPPORT_S2_SEXIES.md) |

Ce que trois passages ont appris, et qui vaut pour toutes les portes à venir :

- **Chaque passage a trouvé ce que le précédent avait manqué, sur un chemin que personne ne
  regardait.** Le premier a examiné les clés étrangères et manqué le recoupement des réglages de
  session ; le second a fait l'inverse ; le troisième a trouvé que l'`insert` n'avait jamais été
  éprouvé, alors que l'`update` l'avait été de fond en comble. **Un auditeur unique n'aurait
  trouvé qu'un tiers des défauts.**
- **Le document normatif s'est trompé quatre fois**, et ce sont les agents qui l'ont rattrapé à
  chaque fois. Une convention n'est pas une preuve.
- **Un correctif se juge à ce qu'il rend impossible autant qu'à ce qu'il ferme.** Plusieurs
  correctifs ont été acceptés parce que la suite restait verte — or la suite restait verte
  **parce que rien n'exerçait le chemin corrigé**. C'est le sens de la règle « sans les tests, le
  correctif ne compte pas ».
- **Une liste écrite à la main est une omission qui attend.** Le motif a produit quatre défauts
  distincts : sept clés étrangères oubliées, les déclencheurs d'insertion, une table de liaison
  sur sept, et le point d'appel des garde-fous lui-même. La parade n'est pas la vigilance, c'est
  la **découverte dans le catalogue** — et elle a fini par être appliquée au dispositif de
  contrôle lui-même.
- **Une discipline que rien n'oblige finit par se relâcher — il faut la rendre mécanique.** Le
  banc portait quatre assertions de silence dont trois ne prouvaient rien : elles vérifiaient
  qu'un avertissement ne paraissait pas, sur des chemins où *retirer le mécanisme qui parle*
  produisait le même silence. L'auteur les avait pourtant écrites en connaissant la règle, et
  l'appliquait scrupuleusement ailleurs le même jour. La parade n'est donc pas de mieux la
  connaître : c'est `exigerSilence(texte, avertissement, essaiQuiFaitParler)`, dont le
  **troisième argument n'a aucun effet technique** — il oblige à **nommer l'autre moitié**. Une
  assertion de silence incapable de nommer l'essai qui fait parler le même mécanisme ne prouve
  rien, et son auteur s'en aperçoit **au moment où il tape l'appel**, pas trois portes plus tard.
  Toutes les familles d'assertion négative ne sont pas concernées : « la filiale voisine n'est
  nommée nulle part » mord d'elle-même, puisque casser le cloisonnement fait *apparaître* la
  chaîne. Le piège est réservé aux **absences d'avertissement**.
- **La question utile n'est pas « est-ce que ça passe », c'est « qu'est-ce qui passerait aussi ».**
  Formulée par l'agent qui tient le banc, au terme d'une journée où le motif est apparu quatre fois
  sous quatre déguisements : un essai qui passait des options figées à une fonction **qui les
  ignore**, et concluait « sous horloge et aléa figés, c'est reproductible » — attribuant à un
  décor la propriété qu'il prétendait éprouver ; un essai de masse qui comptait les lignes
  arrivées sans voir que **le rattrapage** les avait remises, donc restait vert avec la moitié
  d'un bloquant rouverte ; un filet de consignation qui **ne rattrape jamais** la migration qui
  l'a introduit, parce qu'elle se vérifie elle-même ; et une démonstration de cloisonnement
  privée de tous ses contrôles, qui **sort en code 0**. Les quatre rendent le même vert qu'une
  propriété tenue. **Seul le sabotage les sépare** — c'est pourquoi le contrôle de morsure n'est
  pas une formalité de fin de travail mais la seule chose qui distingue un essai d'un décor.
- **Un correctif rend fausse la phrase d'un autre fichier — dix fois sur ce chantier.** Le cas le
  plus fréquent n'est pas le renvoi mort, c'est la **justification** : la phrase écrite pour
  expliquer pourquoi on garde quelque chose, que personne ne relit quand l'appelant disparaît.
  Trois exemples du même jour : un commentaire justifiant un cloisonnement « comme le fait déjà »
  une heuristique **que le même correctif venait de supprimer** ; une justification faisant du
  format d'identifiant une condition du round-trip exact, ce qui aurait rendu **intouchable le
  générateur qu'il a fallu changer** ; et un cas nominal du déploiement décrit comme un cas limite
  (« en usage légitime, cela ne se produit jamais »), ce qui est une invitation à ne pas le
  tester. La parade est le **balayage mécanique** — extraire tout symbole cité dans un commentaire
  et vérifier qu'il existe encore hors commentaire — suivi d'une vérification du comportement
  avant chaque réécriture : remplacer une phrase fausse par une autre phrase fausse est un recul.
- **Le journal ci-dessus se tient à jour à chaque passage.** Il a pris deux passages de retard
  pendant le chantier, et c'est un agent de documentation qui l'a signalé : les autres documents
  y renvoient, un lecteur y aurait donc trouvé un état antérieur au dernier rapport.

Le bloquant mérite d'être retenu, parce qu'il justifie à lui seul le dispositif : sept clés
étrangères directes traversaient la frontière de filiale, si bien qu'une suppression ordinaire
dans une filiale détruisait des lignes d'une autre. Le raisonnement correct était écrit dans la
migration elle-même et appliqué aux tables de liaison — mais pas à ces sept clés. Ni le banc
d'essai ni la démonstration d'audit ne couvraient ce chemin : **le défaut serait parti en
production sous 28 contrôles verts**. C'est exactement le cas qu'une revue repoussée en L15
aurait découvert trop tard.

### Registre des constats ouverts

**Pourquoi ce tableau existe.** La vague 1 a mesuré, chiffré et écrit noir sur blanc qu'un
générateur d'identifiants ne rendait que 95 valeurs distinctes sur 100. Personne ne l'a porté :
le constat a été renvoyé à « la clôture de la vague », c'est-à-dire à personne. Deux vagues plus
tard il est ressorti en **bloquant** — un import qui écrit 223 lignes sur 250 *et annonce le
succès*. La leçon tient en une phrase, et elle vaut désormais règle : **un constat chiffré et non
attribué est un constat perdu.** Tout constat sort d'une porte avec un propriétaire nommé et une
échéance, ou il n'en sort pas.

Un constat ne quitte ce tableau que fermé **et rejoué** — la porte est rejouée intégralement,
jamais seulement sur le correctif.

| # | Constat | Gravité | Propriétaire | Échéance | État |
|---|---|---|---|---|---|
| **Q-1** | Le générateur d'identifiants corrigé, gardé et démontré n'est pas celui qui écrit : tout identifiant réellement écrit vient d'`engendrerIdentifiant()` en TypeScript, un million de valeurs, sans garde-fou | 🟠 majeur | agent **API** | fermeture de la porte S2 | ✅ **corrigé** — attend le rejeu de la porte |
| **Q-2** | La ré-émission d'identifiant n'est pas idempotente : trois reprises de la même sauvegarde donnent trois clones, et la référence vise le dernier. Le correctif T-4 lui a ouvert le chemin | 🟠 majeur | agent **API** | **avant la mise en service pilote** | ✅ **corrigé** — attend le rejeu |
| **Q-3** | La moitié navigateur du correctif T-1 n'a aucun test, alors que le rapport TER en faisait une condition explicite | 🟠 majeur | agent **OUTILLAGE** | fermeture de la porte S2 | ✅ **corrigé** — attend le rejeu |
| **Q-4** | La documentation reste antérieure à la vague — **4ᵉ signalement** | 🟠 majeur | agent **DOC** | fermeture de la porte S2 | ✅ **corrigé** — attend le rejeu |
| **Q-5** | Un garde-fou de schéma qui *cesse d'être découvert* disparaît en silence : `f_verifier_schema()` ne refuse que s'il n'en trouve **aucun**. Une migration qui renomme ou re-signe une fonction suffit | 🔵 mineur | agent **OUTILLAGE** | fermeture de la porte S2 | ✅ **corrigé** (`005`) — attend le rejeu |
| **Q-6** | Trois textes rendus faux par les correctifs T-2 et T-4 : l'en-tête d'`applyImport`, les commentaires de `uq_imports_idempotence` et `imports.cle_idempotence`, l'anomalie `identifiant-duplique` | 🔵 mineur | (a) et (c) agent **API** · (b) **lot L3**, voir ci-dessous | (a)(c) porte S2 · (b) vague 3 | ✅ **(a), (b) et (c) corrigés** — (b) fermé par `005`, non par L3 : voir **Q-22 (a)** |
| **Q-7** | `imports.id` est engendré par un `Math.random()` en ligne sur un million de valeurs — quatrième clone de la convention d'identifiant, alors que le §2 des conventions n'en veut **qu'un** | 🔵 mineur | agent **API**, avec Q-1 | fermeture de la porte S2 | ✅ **corrigé** — attend le rejeu |
| **Q-8** | Le différentiel complet est recalculé plusieurs fois par battement : sondage complet mesuré à 608 ms sur 12 000 enregistrements, et le correctif T-1 en a ajouté un, toutes les 20 s, y compris quand rien n'attend | 🔵 mineur | agent **FRONT** | **après** la fermeture de Q-3 — les tests de Q-3 exercent `sonder()`/`cycle()` | ✅ **corrigé** — attend le rejeu |
| **Q-9** | Une reprise de 12 000 enregistrements tient une connexion du pool 20 s ; `statement_timeout` borne l'instruction, jamais la transaction. Dix reprises simultanées épuisent le pool | 🟠 **majeur** *(requalifié par la mesure — voir Q-20)* | **lot L7** (import) pour le fond · borne immédiate avec Q-19 | vague 5 | ouvert |
| **Q-10** | ~160 ms d'analyse de corps avant toute décision, sans authentification. Ce n'est pas propre à la reprise : le remède est un contrôle en `onRequest`, avec la limitation de rythme | 🔵 mineur | **lot L3** | vague 3 | ouvert |
| **Q-11** | Le repli d'`applyImport` réintroduit un renommage global quand le serveur ne porte pas `/api/reprise` : chemin atteignable seulement lors d'un retour arrière. À défaut de le fermer, le dire dans le code | 🔵 mineur | agent **FRONT** | avec Q-8 | ◐ **documenté, non fermé** — fermer exigerait une liste de champs tenue à la main ; le bandeau compte désormais les réécritures hors de l'enregistrement renommé |
| **Q-12** | L'en-tête de `js/core/vault.js` justifie la neutralisation du coffre par le fait que « **cinq autres fonctions du coffre sont appelées par `js/modules/settings.js`** » — or `settings.js` n'y fait plus aucune référence, et `Vault.boot` dans `js/app.js` est le seul appel subsistant dans toute la SPA. La décision reste juste ; sa justification écrite ne l'est plus. **Neuvième occurrence du motif « le remède rend fausse la phrase d'un autre fichier »** — cette fois entre deux périmètres d'agents, ce qui est précisément le cas que la propriété exclusive des fichiers ne couvre pas | 🔵 mineur | agent **FRONT** | avec Q-8 | ✅ **corrigé** — attend le rejeu (trois occurrences, dont une trouvée en lisant) |
| **Q-13** | **Le générateur d'identifiants de la reprise n'avait que MILLE valeurs d'aléa** (`src/reprise/index.ts:513`). Présumé bloquant, **établi majeur par la mesure** : la sortie de `scinderMesures` n'atteint jamais la base — `appliquerReprise` refait la scission côté serveur et n'en retient qu'un compte. Le chemin qui écrivait vraiment est l'autre : sur 250 enregistrements **sans identifiant**, `resoudreIdentifiant` en engendrait **231 distincts**, et la reprise partait en 400 en reprochant au fichier un doublon que le serveur venait de fabriquer — un export ancien légitime devenait irreprenable **une fois sur neuf**, avec un message qui accusait l'utilisateur. Rien de perdu en silence (le garde de T-2 tient), mais un déni de reprise. Remède : les deux sites **dérivent** au lieu de tirer ; il ne reste aucun générateur aléatoire dans `src/reprise/` | 🟠 majeur *(présumé bloquant, corrigé à la baisse par la mesure)* | agent **API**, périmètre élargi à `src/reprise/**` | avant la fermeture de la porte S2 | ✅ **corrigé** — attend le rejeu |
| **Q-14** | **Un garde-fou mesure une longueur là où la convention norme une entropie.** `f_verifier_entropie_identifiants()` (001) exige de `f_generer_id()` une part aléatoire d'au moins **32 caractères**. Rien ne casse aujourd'hui, `f_generer_id` étant inchangée ; mais le §2 vient d'ériger en norme le **plancher d'entropie**, et les formes serveur font 25 caractères de base 36 pour 128 bits — plus d'aléa en moins de signes. Aligner un jour le générateur SQL ferait **crier ce garde-fou à tort**. Un seuil exprimé dans la mauvaise unité est un piège qui attend son déclencheur | 🔵 mineur | **lot L5** (avec le journal, seul écrivain de `f_generer_id`) | vague 3 | ✅ **corrigé** (`006`) — le seuil est en bits ; le témoin base 36 (128 bits en 25 signes) n'est plus crié, 0/200 |
| **Q-15** | **`renommer()` réécrit en mémoire sans réarmer l'envoi.** Trouvé par le cas de Q-11, mais **le périmètre est plus large que le cas qui l'a révélé** — et le pire n'a rien à voir avec Q-11 : la création d'une mesure échoue sur une panne réseau **passagère** et part au cycle suivant ; la modification de l'action qui la cite sort dans le cycle courant avec l'identifiant local ; le renommage qui suit ne vit qu'en mémoire. **La base garde une référence pendante vers une ligne qui n'existe pas** — exactement la classe de défaut que `renommer` existe pour empêcher. Déclencheur exact : le renommage touche un enregistrement que le serveur détient déjà et que le différentiel du cycle ne contient pas | 🟠 majeur | agent **FRONT** (correctif) · agent **OUTILLAGE** (essai rouge d'abord) | avant le rejeu de la porte | ✅ **corrigé** — rouge puis vert mesurés, attend le rejeu |
| **Q-16** | **Aucune couverture de non-régression sur les 26 modules métier, alors que vingt-trois entrées du `CHANGELOG` en annoncent.** Les essais Playwright de ces chantiers ont été écrits, joués, puis **jetés avec le répertoire de travail** : `grep -rl playwright` ne rend qu'un fichier, né en vague 2. Le défaut n'est pas l'absence — c'est qu'un lecteur du journal, ou un agent qui reprend, en conclut qu'il peut modifier un module sans crainte. Corrigé **dans le journal** par annotation ; le **produit**, lui, reste sans filet | 🟠 majeur | **vague 3**, rôles **MODULES** et **OUTILLAGE** | ouverture de la vague 3 | ouvert — *journal annoté, produit non couvert* |
| **Q-17** | ⚠️ *Divergence d'attribution, à lire avant de citer ce numéro : le rapport S2 quinquies numérote **son** Q-17 sur le **jumeau TypeScript** (`src/entites/index.ts`) et range le garde-fou SQL sous Q-14. Ce registre a fait l'inverse. Les deux existent — le SQL est ci-dessous, le TypeScript est **Q-26**.* **Le garde-fou d'entropie mesure une longueur que `padStart` rend infaillible.** Pouvoir de détection mesuré par l'auditeur : **8 sur 200 à 32 bits, 0 sur 200 à 40 bits**, pour un plancher normé à **52**. Il ne dit donc pas « le générateur est bon », il dit « la chaîne est longue » — et il le dit sous un nom qui promet l'inverse. Aggrave Q-14 : ce n'est pas un seuil dans la mauvaise unité, c'est un contrôle sans pouvoir de détection qui rend une fausse assurance | 🔵 mineur | agent **SCHEMA** | avant le 6ᵉ passage | ✅ **corrigé** (`006`) — attend le rejeu |
| **Q-18** | **Un troisième commentaire faux dans `001_socle.sql`, vivant dans le catalogue**, portant mot pour mot la justification qu'un correctif précédent a déclarée « vérifiée fausse ». Hors du périmètre de la condition **E5** et hors de portée du balayage de Q-6 : les deux ont cherché là où on savait déjà | 🔵 mineur | agent **SCHEMA** (migration neuve — `001` est appliquée, §23) | avant le 6ᵉ passage | ✅ **corrigé** (`006`) — 25 candidats, 1 coupable ; le jumeau de fichier reste faux **par construction**, §23 |
| **Q-19** | **Le déploiement livré coupe la reprise à 60 s, et le serveur valide quand même.** `ProxyTimeout 60`, `DELAI_CHARGEMENT_MS = 60000`, et une instance Fastify sans `requestTimeout` : mesuré sur un vrai port, client interrompu à 4 s → `AbortError`, **12 000 lignes en base 20 s plus tard**. L'utilisateur lit « le serveur n'a pas répondu », puis voit ses données apparaître. Seuil ≈ 36 000 enregistrements contre un plafond **annoncé par le produit** de 420 000. Le commentaire du vhost affirme le contraire de ce qui se passe. **Aucun des trois fichiers n'a tort seul** — c'est le contrôle S17 | 🟠 majeur | agent **API+DÉPLOIEMENT** (périmètre joint, voir ci-dessous) | avant le 6ᵉ passage | ✅ **corrigé** — attend le rejeu |
| **Q-20** | **Q-9 requalifié par la mesure : le report avait été accordé sur un chiffre cinq fois trop bas.** 98,9 s pour 60 000 enregistrements (registre : « 20 s »), ~11,5 min extrapolées aux plafonds annoncés. Et la conséquence n'est pas « le pool est occupé » : **dix reprises simultanées font répondre HTTP 500 à tout autre utilisateur** après 5 s d'attente. Le remède de fond reste à L7 — c'est la **gravité** et le « rien à faire d'ici là » qui sont refusés | 🟠 majeur | agent **API+DÉPLOIEMENT** (même borne que Q-19) | avant le 6ᵉ passage | ✅ **corrigé** (borne + 503) — le fond reste à L7 |
| **Q-21** | **Trois des cinq comportements que Q-3 exigeait ne sont exercés que dans le sens du silence.** Canari de doublons, signalement de rétrécissement, « le sondage qui pousse » : **neutralisés un par un, le banc reste vert 32/32**. Le `CHANGELOG` les déclare tous exercés. Quatrième occurrence du motif de Q-16 — une protection affirmée qui n'existe pas | 🟠 majeur | agent **OUTILLAGE** (essais) · agent **DOC** (la phrase) | avant le 6ᵉ passage | ✅ **corrigé** — deux essais comportementaux, le troisième structurellement inatteignable et éprouvé autrement |
| **Q-22** | **Trois renvois vers le registre ont divergé de ce qu'il dit.** (a) Q-6 (b) est annoncé reporté à L3 alors que `005` l'a fermé — un agent de la vague 3 lira **E5** comme satisfait par héritage et ne cherchera pas le troisième commentaire, qui est Q-18 ; (b) le `CONVENTIONS.md` §2 attribue à Q-3 un manque que Q-3 ne dit pas ; (c) Q-15 n'apparaît nulle part hors du registre — un lecteur du journal ne saura jamais qu'une référence pendante a pu vivre en base | 🔵 mineur | **orchestrateur** (a et b) · agent **DOC** (c) | immédiat | ✅ **corrigé** — (a) et (b) par l'orchestrateur, (c) par DOC |
| **Q-23** | **`UI.genId` n'a aucun garde-fou d'exécution**, et personne ne le porte. Le manque est réel et exact — c'est le §2 du `CONVENTIONS.md` qui l'a écrit —, mais il l'a **attribué à Q-3**, qui dit autre chose et qui est clos. Il serait donc sorti du registre avec lui, sans avoir jamais eu de propriétaire. **C'est la forme exacte que le chantier a payée deux fois**, cette fois dans mon propre document normatif | 🔵 mineur | agent **FRONT** | avant le 6ᵉ passage | ⚠️ **coche retirée** — les « deux silences » prouvaient une propriété du **produit**, pas du détecteur ; voir **Q-32** |
| **Q-24** | **`champsRefuses` n'est jamais fait parler.** Le bandeau « Champs non reconnus par le serveur, donc **non enregistrés** » dit à l'utilisateur qu'une partie de sa saisie n'a pas été gardée ; aucun essai ne vérifie qu'il le dise. Trouvé par l'agent d'outillage en cherchant, à ma demande, d'autres endroits où le banc mesure dans le sens du silence | 🔵 mineur | agent **OUTILLAGE** | avant le 6ᵉ passage | ✅ **corrigé** — attend le rejeu |
| **Q-25** | **Le refus de droit (403) n'est éprouvé que côté serveur.** `routes.test.mjs` couvre le 403 et vérifie même qu'il ne se déguise pas en `GRC03` — mais **rien n'éprouve la moitié navigateur** : `traiterEchec` doit revenir à la valeur du serveur et poser un bandeau **sans bouton de rechargement** (`rechargeable: false`), un refus de droit n'ayant rien à recharger. Même forme que Q-21 : une protection dont un seul côté est tenu. **Ce mécanisme est celui sur lequel L3 va reposer entièrement** | 🟠 majeur | agent **OUTILLAGE** | avant le 6ᵉ passage — et **condition d'entrée de fait pour L3** | ✅ **corrigé** — trois propriétés éprouvées séparément, chacune mordue |
| **Q-26** | **Le jumeau TypeScript du garde-fou d'entropie est intact** (`src/entites/index.ts`, `padStart`), et il a failli perdre son propriétaire dans mon registre : le rapport le désignait sous le numéro **Q-17**, que j'ai attribué au garde-fou SQL. Le SQL est réparé par `006` ; **le TypeScript ne l'est pas**. Ce que l'agent qui l'a mesuré offre à qui le reprendra : son `padStart` est **structurellement incapable d'échouer**, son comptage sur 20 000 tirages est aveugle dès 40 bits, et le remède qui marche est le même qu'en SQL — compter les symboles **par position** sur la sortie base 36, seuil **en bits**. **Troisième occurrence du motif de Q-23**, toujours dans le même document, toujours de ma main | 🔵 mineur | agent **API** | avant le 6ᵉ passage | ✅ **corrigé** — et le contrôle est devenu **interrogeable**, ce qui n'était pas demandé |
| **Q-27** | **Une écriture expirée est rejouée automatiquement, et sur une CRÉATION cela produit une ligne en double, en silence.** `estPassagere()` est vraie pour une expiration, donc `sync.js` réessaie. Mesuré quand le serveur avait en fait validé : écran **1**, base **2**, `enAttente=false`, **bandeau vide** — le produit annonce que tout est enregistré. La modification et la suppression sont protégées (le rejeu tombe sur `conflit_version` ou `404`) ; **la création n'a rien pour la protéger précisément parce que le client ne propose plus d'identifiant** — le remède de M-3 a retiré la seule chose qui aurait fait converger le rejeu. Un doublon silencieux dans un outil de preuve d'audit | 🟠 majeur | agent **FRONT** (arbitrage rendu ci-dessous) · agent **OUTILLAGE** (essai) | avant le 6ᵉ passage | ✅ **corrigé** — attend le rejeu |
| **Q-28** | **`LONGUEUR_ALEA` est dupliquée en dur dans `src/reprise/index.ts`**, avec le rendu `toString(36).padStart(25, '0')` et le littéral `25`. Ce n'est **pas** une infraction à la règle « un seul générateur par langage » — c'est une **dérivation**, elle ne tire rien, et le §2 tient à la pureté de ce module. Mais si quelqu'un change la longueur d'un côté, les identifiants `-d-` et `-r-` **cessent de se ressembler**. Rien ne casse aujourd'hui ; signalé par son auteur plutôt que laissé sans propriétaire — c'est ce que le registre existe pour recevoir | 🔵 mineur | agent **API** | vague 3 |
| **Q-29** | 🛑 **Le correctif de Q-27 a échangé un doublon silencieux contre une DESTRUCTION silencieuse.** Une création dont la réponse expire *sans que la requête soit jamais arrivée* est bloquée ; le bandeau affiche « rechargez la page avant de recommencer » et offre le bouton. L'utilisateur fait ce qu'on lui dit — mesuré : **écran 0, base 0**, et un message vert « Données rechargées ». A/B sans aucun geste pendant 26 s : code antérieur `base=1` (la saisie arrivait seule), code actuel `base=0`. **Le commentaire du correctif affirme l'inverse** — « la voie *recharger avant de rejouer* a été écartée pour cela ». C'est **mon arbitrage** qui a écarté cette voie, et c'est la phrase du bandeau qui y ramène | 🛑 **bloquant** | agent **FRONT** | immédiat | ✅ **corrigé** — recharger PRÉSERVE une création bloquée, et « Envoyer à nouveau » rend le retour |
| **Q-30** | **Q-27 n'est fermé qu'à moitié** : `issueInconnue` n'est posé que dans la branche `AbortError`. Un **502/504 du frontal** reproduit le défaut mot pour mot — écran 1, **base 2**, bandeau vide. Une ligne, dans la branche qui identifie déjà le cas | 🟠 majeur | agent **FRONT** | immédiat | ✅ **corrigé** — 502/504 marqués, 503 délibérément exclu |
| **Q-31** | **`install.sh` recopie des données réelles dans la racine web d'Apache.** Trois classeurs — registre de risques, scénarios PCA/PRA, exigences client — plus un **fichier de verrou Excel nommant une personne**, servis **sans aucun contrôle d'accès** : ni `.xlsx` ni `data/` ne figurent dans les interdictions du vhost, et aucun code ne les référence. Dans un produit dont le métier est de protéger ce genre de contenu | 🟠 majeur | fichiers **retirés par l'orchestrateur** · exclusions à poser par **DÉPLOIEMENT** | immédiat | ✅ **corrigé** — liste blanche dérivée de la CSP, trois barrières |
| **Q-32** | **Q-23 fermé en apparence.** Détecteur neutralisé → **banc vert 43/43**, et aucune occurrence dans `test/` : les « deux silences vérifiés » du registre appartenaient à d'autres mécanismes. Pire — le compteur de session rend le détecteur **structurellement inerte** : l'auditeur n'a pas su fabriquer de collision sans le retirer | 🟠 majeur | agent **FRONT** (le mécanisme) · **OUTILLAGE** (l'essai) | immédiat | ◐ **le mécanisme est réparé, l'essai manque** — le détecteur n'était pas inerte, mais le compteur ne portait pas la garantie qu'on lui prêtait |
| **Q-33** | **Trois remèdes antérieurs sans aucun essai** — recalage d'adresse (N-3), vidage (m-6), abandon avant transaction. Le premier affiche « Mesure introuvable » pour une fiche créée dix secondes plus tôt | 🔵 mineur | agent **OUTILLAGE** | avant le 7ᵉ passage |
| **Q-34** | **Q-4, cinquième signalement.** `README` et `CHANGELOG` ignorent la migration `006` et les douze constats Q-15 → Q-28 ; « 5 migrations » quand le catalogue en porte **6** | 🔵 mineur | agent **DOC** | avant le 7ᵉ passage |

**Arbitrage sur Q-6 (b) — rendu le 01/09/2026, et déjà dépassé par les faits.** La migration
`005` §9 a posé les `comment on` le jour même : « la prochaine migration » s'est trouvée être
`005`, pas celle de L3. Le raisonnement ci-dessous reste juste et vaut pour la prochaine fois ;
sa **conclusion opérationnelle**, elle, est périmée, et l'avoir laissée telle quelle a produit le
constat **Q-22 (a)** — un agent de la vague 3 lisant la condition d'entrée E5 l'aurait crue
satisfaite par héritage, et n'aurait pas cherché le troisième commentaire fautif (**Q-18**), qui
lui est toujours là.

**Arbitrage d'origine — pourquoi il devait attendre.** Le commentaire fautif est dans
`001_socle.sql`, migration **déjà appliquée**. `migrate.mjs` en tient l'empreinte SHA-256 et
sort en **code 4** si le fichier bouge : la règle « une migration appliquée ne se réécrit pas »
n'admet pas d'exception pour un commentaire. La correction prend donc la forme d'instructions
`comment on` dans la **prochaine** migration, celle du lot L3. Le produit n'étant pas déployé,
réécrire 001 et recréer les bases de développement serait matériellement possible — et c'est
exactement le raisonnement qui vide une règle de sa substance la première fois qu'elle coûte
quelque chose.
