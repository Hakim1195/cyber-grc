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
| FRONT | Sélecteur de filiale, retrait de `cyber-context` du `localStorage` (le périmètre vient du serveur) |

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
| **S18** | **Le produit fait ce qu'il doit faire** | retour d'expérience S2 | Les gestes réels de l'utilisateur — créer, saisir un formulaire, importer, enregistrer, recharger — aboutissent, **et ne détruisent rien**. Un correctif de sécurité qui casse une fonction n'est pas un correctif : c'est un défaut d'une autre nature. |
| **S17** | **Le chemin complet a été parcouru pour de vrai** | retour d'expérience S2 | Dans un **navigateur réel**, contre le **serveur réel**, dans la **configuration de déploiement réelle** — vhost et en-têtes compris. Une démonstration écrite par l'auteur du code ne voit jamais l'écart entre ce qu'il a prouvé et ce que l'usage fait. |
| **S16** | **Les garde-fous sont branchés** | retour d'expérience S1 | Tout contrôle automatique écrit (vérification de couverture RLS, de chemin de recherche, de privilèges) est **réellement appelé** par un chemin de déploiement ou de recette, et **fait échouer** ce chemin. Un garde-fou que rien n'invoque est un commentaire. |

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
| **V1** | L1 schéma relationnel | ✅ **livré, porte S1 franchie** au 5ᵉ passage | S1 |
| **V2** | L2 API et bascule | ✅ **livré, porte S2 franchie** au 4ᵉ passage | S2 |
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
| **S2** (4ᵉ) | 31/08/2026 | ✅ **FRANCHIE** — 0 bloquant, 4 majeurs, 7 mineurs, **aucun des dix-huit contrôles en échec**. Le bloquant du 3ᵉ passage est fermé **deux fois** : la seconde barrière tient sans la première, générateur saboté à trois valeurs et les quarante lignes arrivent quand même. | [`securite/RAPPORT_S2_QUATER.md`](securite/RAPPORT_S2_QUATER.md) |
| **S2** (3ᵉ) | 31/08/2026 | ❌ **refusée** — 1 bloquant, 4 majeurs, 9 mineurs ; **S18 en échec**. Un import en lot n'écrit qu'une partie de ses lignes **et annonce le succès**. Racine : un générateur d'identifiants à mille valeurs d'aléa, **signalé et chiffré dès la vague 1 et laissé de côté par l'orchestrateur**. | [`securite/RAPPORT_S2_TER.md`](securite/RAPPORT_S2_TER.md) |
| **S2** (2ᵉ) | 31/08/2026 | ⚠️ **franchie selon l'auditeur — refusée par l'orchestrateur.** 0 bloquant, 4 majeurs, mais **S12 et S18 sont marqués en échec dans sa propre grille**. Un contrôle en échec ne se franchit pas : c'est la lecture appliquée à la porte S1 au quatrième passage, et elle ne change pas parce que le lot paraît proche de la fin. **Trois des quatre majeurs sont des défauts créés par les correctifs du premier passage.** | [`securite/RAPPORT_S2_BIS.md`](securite/RAPPORT_S2_BIS.md) |
| **S2** | 31/08/2026 | ❌ **refusée** — 3 bloquants, 9 majeurs, 9 mineurs. Le cœur serveur est juste et la façade réellement préservée ; **le lot casse aux jointures**, là où aucun test ne regarde : aucune route montée par le banc, une seule entité couverte, aucun test frontend. | [`securite/RAPPORT_S2.md`](securite/RAPPORT_S2.md) |
| **S1** (6ᵉ) | 31/08/2026 | ✅ **CONFIRMÉE FRANCHIE** — 0 bloquant, 0 majeur, 6 mineurs. Les trois majeurs du 5ᵉ passage sont fermés et rejoués un par un. *« Le premier correctif de la série qui ne se paie pas d'un nouveau major. »* **La vague 2 peut s'ouvrir.** | [`securite/RAPPORT_S1_SEXIES.md`](securite/RAPPORT_S1_SEXIES.md) |
| **S1** (5ᵉ) | 31/08/2026 | ✅ **FRANCHIE** — 0 bloquant, 3 majeurs, 5 mineurs. L'auditeur refuse explicitement la formule « sous réserve », qui avait endormi au quatrième passage, et assigne chaque correction à un lot. **Q5-1 et Q5-2 sont à fermer avant l'ouverture de la vague 2.** | [`securite/RAPPORT_S1_QUINQUIES.md`](securite/RAPPORT_S1_QUINQUIES.md) |

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

| # | Constat | Gravité | Propriétaire | Échéance |
|---|---|---|---|---|
| **Q-1** | Le générateur d'identifiants corrigé, gardé et démontré n'est pas celui qui écrit : tout identifiant réellement écrit vient d'`engendrerIdentifiant()` en TypeScript, un million de valeurs, sans garde-fou | 🟠 majeur | agent **API** | fermeture de la porte S2 |
| **Q-2** | La ré-émission d'identifiant n'est pas idempotente : trois reprises de la même sauvegarde donnent trois clones, et la référence vise le dernier. Le correctif T-4 lui a ouvert le chemin | 🟠 majeur | agent **API** | **avant la mise en service pilote** |
| **Q-3** | La moitié navigateur du correctif T-1 n'a aucun test, alors que le rapport TER en faisait une condition explicite | 🟠 majeur | agent **OUTILLAGE** | fermeture de la porte S2 |
| **Q-4** | La documentation reste antérieure à la vague — **4ᵉ signalement** | 🟠 majeur | agent **DOC** | fermeture de la porte S2 |
| **Q-5** | Un garde-fou de schéma qui *cesse d'être découvert* disparaît en silence : `f_verifier_schema()` ne refuse que s'il n'en trouve **aucun**. Une migration qui renomme ou re-signe une fonction suffit | 🔵 mineur | agent **OUTILLAGE** | fermeture de la porte S2 |
| **Q-6** | Trois textes rendus faux par les correctifs T-2 et T-4 : l'en-tête d'`applyImport`, les commentaires de `uq_imports_idempotence` et `imports.cle_idempotence`, l'anomalie `identifiant-duplique` | 🔵 mineur | (a) et (c) agent **API** · (b) **lot L3**, voir ci-dessous | (a)(c) porte S2 · (b) vague 3 |
| **Q-7** | `imports.id` est engendré par un `Math.random()` en ligne sur un million de valeurs — quatrième clone de la convention d'identifiant, alors que le §2 des conventions n'en veut **qu'un** | 🔵 mineur | agent **API**, avec Q-1 | fermeture de la porte S2 |
| **Q-8** | Le différentiel complet est recalculé plusieurs fois par battement : sondage complet mesuré à 608 ms sur 12 000 enregistrements, et le correctif T-1 en a ajouté un, toutes les 20 s, y compris quand rien n'attend | 🔵 mineur | agent **FRONTEND** | **après** la fermeture de Q-3 — les tests de Q-3 exercent `sonder()`/`cycle()` |
| **Q-9** | Une reprise de 12 000 enregistrements tient une connexion du pool 20 s ; `statement_timeout` borne l'instruction, jamais la transaction. Dix reprises simultanées épuisent le pool | 🔵 mineur | **lot L7** (import) | vague 5 |
| **Q-10** | ~160 ms d'analyse de corps avant toute décision, sans authentification. Ce n'est pas propre à la reprise : le remède est un contrôle en `onRequest`, avec la limitation de rythme | 🔵 mineur | **lot L3** | vague 3 |
| **Q-11** | Le repli d'`applyImport` réintroduit un renommage global quand le serveur ne porte pas `/api/reprise` : chemin atteignable seulement lors d'un retour arrière. À défaut de le fermer, le dire dans le code | 🔵 mineur | agent **FRONTEND** | avec Q-8 |
| **Q-12** | L'en-tête de `js/core/vault.js` justifie la neutralisation du coffre par le fait que « **cinq autres fonctions du coffre sont appelées par `js/modules/settings.js`** » — or `settings.js` n'y fait plus aucune référence, et `Vault.boot` dans `js/app.js` est le seul appel subsistant dans toute la SPA. La décision reste juste ; sa justification écrite ne l'est plus. **Neuvième occurrence du motif « le remède rend fausse la phrase d'un autre fichier »** — cette fois entre deux périmètres d'agents, ce qui est précisément le cas que la propriété exclusive des fichiers ne couvre pas | 🔵 mineur | agent **FRONTEND** | avec Q-8 |

**Arbitrage sur Q-6 (b) — pourquoi il attend la vague 3.** Le commentaire fautif est dans
`001_socle.sql`, migration **déjà appliquée**. `migrate.mjs` en tient l'empreinte SHA-256 et
sort en **code 4** si le fichier bouge : la règle « une migration appliquée ne se réécrit pas »
n'admet pas d'exception pour un commentaire. La correction prend donc la forme d'instructions
`comment on` dans la **prochaine** migration, celle du lot L3. Le produit n'étant pas déployé,
réécrire 001 et recréer les bases de développement serait matériellement possible — et c'est
exactement le raisonnement qui vide une règle de sa substance la première fois qu'elle coûte
quelque chose.
