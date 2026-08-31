# Porte de sécurité S2 — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2**, agent indépendant. Aucune des lignes examinées n'a été écrite par
> moi. Travail en **lecture seule** sur le dépôt ; toutes les manipulations ont eu lieu sur
> une base et des serveurs montés pour l'occasion.
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`,
> révision examinée `ff35ea0` (« Bascule de la persistance : le serveur devient la source,
> la façade ne bouge pas »).
>
> Référence : `docs/PLAN_EXECUTION.md` §4 (les seize contrôles) et §5 (définition de
> « terminé ») ; `docs/PLAN_SERVEUR.md` §1.3, §1.4, §1.9, §2.4 ; `backend/db/CONVENTIONS.md`
> §15 à §20 ; les six rapports de `docs/securite/`.
>
> Date : 31/08/2026.

---

## 1. Verdict

> ### ❌ **PORTE REFUSÉE** — 3 bloquants, 9 majeurs, 9 mineurs.

Le moteur serveur est le meilleur travail de ce chantier depuis le socle : le registre
déclaratif, la découverte du catalogue, le diagnostic à trois causes du `UPDATE 0` et la
traduction des erreurs répondent exactement aux constats que les six passages de S1 leur
avaient légués, et j'ai tenté de les mettre en défaut sans y parvenir. **Ce n'est pas là que
le lot casse.** Il casse à la jointure — entre le serveur et le navigateur, entre le lot L2
et le vhost du lot L0, entre le modèle de la SPA et les contraintes du schéma — c'est-à-dire
précisément là où aucun test ne regarde.

Les trois bloquants sont tous des **pertes de données silencieuses**, et aucun n'est
théorique : je les ai provoqués dans un vrai navigateur, contre un vrai serveur, contre une
vraie base.

| # | Constat bloquant | Ce qu'il détruit |
|---|---|---|
| **B-1** | Ouvrir la nouvelle application efface la base IndexedDB héritée — **même quand le serveur est injoignable et que l'application refuse de démarrer** | Toutes les données de la version locale d'une filiale, avant toute reprise |
| **B-2** | La croix « Masquer » du bandeau de conflit éteint la seule trace ; l'enregistrement reste bloqué pour toujours et l'application affirme ensuite « rien en attente » | Toute la saisie ultérieure sur cette fiche |
| **B-3** | L'import « Remplacer » supprime le contenu serveur de la filiale, **enregistrement par enregistrement, hors transaction**, pendant que l'écran Paramètres promet un point de restauration qui n'existe plus | Le jeu de données d'une filiale entière |

---

## 2. Comment cette porte a été jouée

Rien de ce qui suit ne repose sur la lecture du code seule. Ce qui est affirmé ici a été
rejoué.

| Élément | Ce que j'ai monté |
|---|---|
| Base | `grc_audit_s2`, neuve, migrée par `db/dev/preparer_base_dev.sh` (4 migrations, garde-fous du schéma : aucune anomalie) |
| Données | Deux filiales `FIL-A` / `FIL-B`, un socle de Groupe, semées **par le compte applicatif sous périmètre** |
| Serveur | `node dist/serveur.js` sur `127.0.0.1:3901`, `NODE_ENV=developpement`, puis rejoué en `production` et en `recette` |
| Frontend | La SPA servie derrière un relais maison (`/api/*` → 3901), et une seconde instance portant **la CSP exacte du vhost de production** (`deploy/apache/cyber-grc.conf`) |
| Navigateur | Playwright/Chromium, treize scénarios, dont deux contextes simultanés pour la concurrence |
| Concurrence | Deux connexions PostgreSQL réelles, plus deux navigateurs réels |

Aucune base existante n'a été touchée. Les scripts d'attaque sont restés dans le
scratchpad ; aucun n'a été versé au dépôt.

**Ce que j'ai fait tourner avant de commencer**, pour ne pas confondre un défaut avec un
environnement cassé :

```
$ npm run verifier-types      → aucune erreur
$ npm test                    → tests 380 · pass 380 · fail 0   (durée 4,9 s)
$ node --test "test/api/*"    → tests  55 · pass  55 · fail 0
$ npm audit --omit=dev        → found 0 vulnerabilities
```

---

## 3. La grille §4 — seize contrôles

Rappel de la règle : « sans objet » n'est jamais « passé ».

| # | Contrôle | Statut |
|---|---|---|
| S1 | Cloisonnement par filiale non contournable | ✅ **passé** |
| S2 | Le périmètre ne vient jamais du navigateur | ✅ **passé** |
| S3 | Journal d'audit inaltérable et complet | ⬜ **sans objet** (L5) — mais voir la remarque |
| S4 | Verrouillage optimiste effectif | ❌ **échoué** (M-2, M-7) |
| S5 | Aucune injection SQL | ✅ **passé** |
| S6 | Droits vérifiés côté serveur | ⬜ **sans objet** (L3) — la barrière provisoire est **percée en recette** (M-5) |
| S7 | Droit d'export distinct de la lecture | ⬜ **sans objet** (L3) |
| S8 | Secrets | ✅ **passé** |
| S9 | Chaîne de contrôle des pièces jointes | ⬜ **sans objet** (L6) |
| S10 | Sortie et en-têtes | ❌ **échoué** (M-6) |
| S11 | Limitation du rythme et verrouillage | ⬜ **sans objet** (L3) |
| S12 | Les erreurs ne renseignent pas l'attaquant | ❌ **échoué** (M-3) |
| S13 | Dénis de service applicatifs | ⚠️ **passé avec réserve** (m-1) |
| S14 | Intégrité des opérations composites | ❌ **échoué** (B-3) |
| S15 | Dépendances | ✅ **passé** |
| S16 | Les garde-fous sont branchés | ✅ **passé** (avec la précision m-4) |

### S1 — Cloisonnement par filiale non contournable ✅

**Ce que j'ai rejoué.** Deux filiales semées à égalité. Depuis une session `FIL-A` :
`GET /api/donnees` ne rend **aucune** ligne de `FIL-B` (`volumes.risques = 1`, la
charge utile entière ne contient ni `FIL-B` ni `RISK-B`). `PUT` et `DELETE` sur une ligne
de `FIL-B` sont refusés. La tentative de créer une ligne en visant `filiale_id` dans le
corps est refusée **au bord** :

```
POST /api/entites/risques {"champs":{"nom":"tentative","filiale_id":"FIL-B"}}
→ 400 « Le champ « filiale_id » n'appartient pas à l'entité « risques » »
```

**Ce que j'ai tenté pour le mettre en défaut.** Entêtes (`X-Filiale-Id`, `X-Grc-Filiales`),
cookie, paramètres d'URL (`?filiale=`, `?grc.filiale_id=`), corps, `portee: "groupe"` :
tout est ignoré ou refusé. La création de portée Groupe est **fail-closed** et le reste
tant que `administrationGroupe` vaut faux.

**Une exception, qui n'est pas une fuite mais qui casse le principe.** L'entité `mappings`
est de niveau Groupe et **toute session de filiale peut y créer, modifier et supprimer** —
voir **M-4**. Ce n'est pas une lecture croisée ; c'est une écriture dont le rayon sort de la
filiale.

### S2 — Le périmètre ne vient jamais du navigateur ✅

**Preuve structurelle, vérifiée exhaustivement.** Le seul endroit du serveur qui pose
`grc.utilisateur`, `grc.filiale_id`, `grc.filiales`, `grc.administration_groupe` est
`appliquerPerimetre()` dans `src/db/pool.ts` (une occurrence, ligne 307). Elle n'est appelée
que par `avecTransaction`, seul endroit qui ouvre une transaction (une occurrence,
ligne 271). Son argument est un `PerimetreSession` qui ne peut venir que de
`resolveur.resoudre()` — **une signature sans aucun paramètre**. Il n'existe donc pas de
chemin de type d'une valeur cliente vers un réglage de session : la propriété est tenue par
la forme, pas par la discipline. C'est bien joué, et c'est vérifiable en trois `grep`.

Côté navigateur, `js/core/session.js` n'expose aucun mutateur et l'objet rendu est gelé ;
`js/core/api.js` n'a aucun paramètre de filiale. `purgerRestesNavigateur()` efface
`cyber-context` au démarrage **et** à `pagehide`. La réserve annoncée (six fichiers hors
périmètre relisent encore `cyber-context` comme filtre « donneur d'ordre ») est exacte et
sans conséquence de sécurité : cette clé n'atteint aucun réglage serveur.

Une seule requête emprunte le pool hors transaction (`verifierBase`, un `select 1`), ce que
l'entête de `pool.ts` déclare et borne correctement.

### S3 — Journal d'audit ⬜ sans objet (lot L5)

`journal_audit` est vide après toute ma campagne (`select count(*) → 0`) et aucune ligne de
`src/entites/` ni de `src/api/` ne l'écrit. C'est conforme au découpage. **Ce qu'il faut en
dire, et qui pèse sur les constats ci-dessous** : aucune des destructions décrites en B-1,
B-2, B-3 et M-4 ne laisse la moindre trace exploitable. Le journal technique (pino) trace
les écritures réussies, pas les intentions, et n'a **pas valeur de preuve** — le lot le dit
lui-même. Tant que L5 n'est pas livré, une donnée perdue ou écrasée est **définitivement
indistinguable d'une donnée légitime**. C'est exactement le critère de gravité employé
depuis le début de ce chantier, et c'est pourquoi trois constats sont bloquants.

La dette S1 sur la **lecture non cloisonnée du journal** est toujours là et toujours
assumée ; `chargement-filiale.test.mjs` la réclame explicitement au lieu de la taire, ce qui
est la bonne manière de porter une dérogation.

### S4 — Verrouillage optimiste effectif ❌

C'est le risque projet **P1**, et j'ai fabriqué la course moi-même plutôt que de croire les
tests du dépôt.

**Ce qui tient, et qui tient bien.** À deux connexions réelles du pool, sur `risques` :
Alice écrit, Bob écrit la même version, Bob reçoit `conflit_version` / `GRC03` avec
`version_actuelle`, et **le travail d'Alice survit** — vérifié en relisant la ligne. Le
diagnostic à trois causes fonctionne : une ligne d'une autre filiale, lisible depuis un
périmètre Groupe, rend `refus_perimetre` et **surtout pas** `GRC03`. Le constat Q-7 légué
par S1 est fermé, et il est fermé correctement.

**Ce qui ne tient pas — M-2.** Le verrou de la table de **mise en œuvre** est facultatif.
`versionMiseEnOeuvre` est optionnel dans `SCHEMA_MODIFICATION` ; quand il est absent,
`majMiseEnOeuvre()` construit sa condition **sans clause de version** et écrase :

```
état : statut = « non conforme », version de mise en oeuvre = 2

PUT /api/entites/mesures/MESURE-A  {"version":1,"versionMiseEnOeuvre":1,"champs":{…}}
  → 409 conflit_version, code_grc GRC03, version_actuelle 2      ← correct

PUT /api/entites/mesures/MESURE-A  {"version":1,"champs":{"statut":"non applicable",…}}
  → 200 OK. statut = « non applicable », vmo = 3                 ← le verrou est absent
```

Et le cas nominal l'atteint sans rien forger : deux personnes qui ouvrent l'outil au même
moment sur un contrôle du **socle Groupe** que la filiale n'a pas encore évalué détiennent
toutes deux `_versionMiseEnOeuvre: null`, donc n'envoient rien, donc s'écrasent en silence.
Vérifié :

```
Alice → statut « conforme », maturité 4   → 200, vmo = 1
Bob   → statut « non conforme », maturité 1 → 200, vmo = 2   ← aucune erreur, aucun signal
```

Aujourd'hui ce chemin est masqué par un autre défaut (**M-1** : la filiale ne peut de toute
façon pas évaluer un contrôle du socle). **Le premier correctif de M-1 ouvre M-2 en grand.**
Les deux doivent être traités ensemble.

**Ce qui ne tient pas non plus — M-7.** Le sondage de rafraîchissement peut **perdre
définitivement** la modification d'un autre utilisateur. L'horodatage rendu au client est
pris avec `new Date()` *après* la lecture ; un écrivain concurrent estampille `modifie_le`
à l'ouverture *de sa* transaction, donc **avant**, et valide **après**. Le sondage suivant
demande « ce qui a changé depuis » et ne voit rien ; les volumes n'ayant pas bougé, le filet
« écart de volume ⇒ rechargement » ne se déclenche pas non plus. Rejoué :

```
1. Bob écrit (non validé). modifie_le = 22:23:14.673Z
2. Alice sonde. horodatage rendu = 22:23:15.949Z
3. Bob valide. En base : « écriture de Bob »
4. Alice re-sonde depuis cet horodatage → risques reçus : []
   volumes identiques → aucun rechargement déclenché
   => la modification de Bob est PERDUE pour Alice : oui
```

L'intégrité n'est pas en cause (si Alice écrit ensuite, elle reçoit `GRC03`), mais la
fraîcheur l'est : sur un tableau de bord de conformité, une valeur périmée lue comme
courante est exactement ce qu'un auditeur regarde. Remède peu coûteux : prendre
l'horodatage au **début** de la transaction de lecture, avec une marge, ou passer à une
séquence monotone.

**Le client ne peut pas fixer `version`.** Vérifié au dépôt : `version`, `cree_par`,
`cree_le` sont **refusés** en entrée (400), plus strict que la base qui les ignore. Bon
choix, explicitement argumenté sur place.

### S5 — Aucune injection SQL ✅

Toutes les valeurs sont paramétrées. Les seuls fragments interpolés sont des noms de table
et de colonne, issus de deux sources closes — le registre (littéraux du fichier) et
`pg_catalog` — et repassés par `ident()`, dont l'expression régulière est un filet
supplémentaire délibéré. Un nom d'entité reçu sert de **clé** dans une `Map`, jamais de
fragment (et une `Map`, contrairement à un objet, ne se laisse pas atteindre par
`__proto__`).

**Ce que j'ai tenté.** Nom d'entité `risques"; drop table risques; --` et variantes
encodées → 400 au schéma JSON. Nom de champ contenant du SQL → 400 « champ inconnu ».
Identifiant `RISK-'); drop table risques; --` → accepté **comme valeur** (le domaine
`id_metier` est volontairement permissif pour la reprise), stocké tel quel, sans effet.
Les tables sont intactes.

### S6 — Droits vérifiés côté serveur ⬜ sans objet (L3) — mais la barrière provisoire est percée

Il n'y a pas de modèle de droits ; c'est le lot L3 et c'est dit franchement, y compris dans
la réponse de `/api/session`, ce qui est la bonne pratique.

**Ce qui reste ouvert en attendant, et ce que la barrière tient réellement.** J'ai rejoué
les trois environnements :

```
NODE_ENV=production   sante=200  session=503  donnees=503  écriture → 503  ← fail-closed, tient
NODE_ENV=recette      sante=200  session=200  donnees=200  écriture → 201  ← ouvert
NODE_ENV=developpement                                     écriture → 201  ← ouvert
```

`session.ts` refuse **uniquement** en `production`. Or `PLAN_SERVEUR` §1.10 exige que
l'environnement de recette soit « alimenté par une **copie réaliste de la production** —
tester sur une base vide ne révèle rien ». La conséquence est directe : **une VM de recette
joignable par le VPN sert et laisse écrire une copie réaliste des données de gouvernance
cyber de vingt filiales, sans aucune authentification.** L'entête du fichier ne mentionne
que la production ; le trou n'est écrit nulle part. Voir **M-5**.

### S7 — Droit d'export distinct ⬜ sans objet (L3)

Aucune notion de droit, donc aucun droit d'export. Ce qui reste ouvert : l'export
`grc-backup` du navigateur (`BackupService.exportPlain` / `exportEncrypted`) est
**disponible sans condition et sans trace**, et il exporte désormais le jeu de données
**de la filiale entière rapatrié du serveur**, pas une base locale. Le fichier produit sort
de la machine. C'est cohérent avec l'état du chantier, mais il faut le dire : entre L2 et
L3, tout utilisateur peut extraire l'intégralité d'une filiale, et rien ne le saura.

### S8 — Secrets ✅

Aucun secret dans les réponses (`/api/sante` est volontairement avare), aucun dans
`/api/modele` (vérifié : ni identifiant de base, ni hôte, ni port, ni nom de table),
aucun dans les corps d'erreur. `redact` masque `authorization`, `cookie` et `set-cookie`
dans le journal. `src/config` refuse de démarrer sans les secrets requis en production, et
le mot de passe de développement `dev` ne vaut que sur un poste, ce que `preparer_base_dev.sh`
écrit en toutes lettres.

### S9 — Pièces jointes ⬜ sans objet (lot L6)

Le schéma porte `pieces_jointes`, mais l'API ne l'expose pas et l'entité n'est pas au
registre. Rien à contrôler à ce stade — et rien n'a été anticipé de travers.

### S10 — Sortie et en-têtes ❌

**Ce qui est posé.** L'API pose `x-content-type-options: nosniff` et `cache-control:
no-store` sur toutes ses réponses, en défense en profondeur (vérifié). Le vhost du lot L0
pose HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` et une CSP
stricte. L'échappement du chantier 9 est conservé : `sync.js` et `vault.js` passent tout
texte injecté par `escapeHtml`, y compris les messages du serveur et les noms
d'enregistrement.

**Ce qui échoue.** La CSP déclarée porte `script-src 'self'` — sans `'unsafe-inline'`, ce
qui est la bonne posture — et le frontend compte **70 gestionnaires d'événements en ligne**
(`onclick=`, `onchange=`) répartis sur **25 fichiers**. J'ai servi la SPA derrière cette CSP
exacte et piloté un navigateur réel :

```
Refused to execute inline event handler because it violates the following
Content Security Policy directive: "script-src 'self'".

gestionnaire onchange="PraPrestatairesModule.updateRiskPreview()" → n'a pas fonctionné
```

L'application **démarre** (les `<script src>` sont bien `'self'`), puis une large part de
l'interface est **inerte, en silence** : tableau de bord, cartographie, matrice EBIOS,
cellule de crise, aperçu du risque fournisseur, scénarios PRA, audits. Voir **M-6**.

### S11 — Limitation du rythme ⬜ sans objet (L3)

Aucune limitation, aucune dépendance qui en fournirait une. Ce qui reste ouvert : les
routes de données, coûteuses, sont martelables sans frein (voir S13).

### S12 — Les erreurs ne renseignent pas l'attaquant ❌

**Ce qui tient, et qui est du beau travail.** `src/erreurs/` est le seul chemin de sortie
d'un échec ; tout ce qui n'est pas reconnu devient une erreur interne générique. Un vrai
refus `42501` de la RLS ne laisse fuir ni nom de table, ni nom de politique, ni SQL, ni
pile. Le refus d'un déclencheur métier est relayé tel quel **parce que son texte est écrit
pour l'utilisateur**, et le seul que j'ai su déclencher fusionne délibérément les deux cas
qui feraient oracle :

```
« Mesure MESURE-B inaccessible à la filiale FIL-A : elle est inconnue du catalogue,
  ou locale à une autre filiale. »
```

**Sur les messages et les codes, la confusion « absente » / « hors périmètre » tient.**
Les deux réponses sont rigoureusement identiques, à l'identifiant que l'appelant vient
lui-même d'envoyer :

```
PUT …/risques/RISK-B            → 404 ressource_inconnue, même phrase
PUT …/risques/RISK-NEXISTEPAS   → 404 ressource_inconnue, même phrase
```

**Sur les temps de réponse, elle tient aussi.** Une première mesure en séries séparées
laissait croire à un écart de 0,55 ms ; **entrelacée** — la seule forme honnête, la dérive
machine frappant alors les deux côtés — l'écart tombe à 0,05 ms sur 400 sondes par cas
(médianes 2,212 ms contre 2,161 ms ; 55 % des sondes « cachée » au-dessus de la médiane
« absente », pour 50 % attendus sous l'hypothèse nulle). **Il n'y a pas d'oracle temporel
exploitable sur ce chemin**, et je le dis d'autant plus volontiers que j'ai d'abord cru le
contraire.

**Ce qui échoue — M-3.** L'oracle que le diagnostic refuse de construire, **la route de
création le donne en une requête**. Le client choisit son identifiant, et l'unicité de la
clé primaire ignore la RLS :

```
POST /api/entites/risques {"id":"RISK-B",            …}  → 409 « fait doublon »
POST /api/entites/risques {"id":"RISK-INEXISTANT",   …}  → 201 créé
```

Et il existe une variante **silencieuse**, qui ne laisse rien derrière elle : en joignant
une liaison invalide, la transaction est annulée dans les deux cas, mais les deux réponses
restent distinctes.

```
POST … {"id":"RISK-B",         "champs":{"nom":"s","exigences_liees":["EX-INEXISTANT"]}}
   → contrainte_base  « fait doublon »
POST … {"id":"RISK-SONDE-XYZ", "champs":{"nom":"s","exigences_liees":["EX-INEXISTANT"]}}
   → hors_perimetre   « Écriture refusée »
vérification : aucun enregistrement créé
```

`src/entites/index.ts` §8.7 écrit noir sur blanc : « le serveur *pourrait* apprendre
laquelle — l'unicité de la clé primaire ignore la RLS, une insertion d'essai le dirait. Il
ne le fait pas ». **L'API la fait faire à l'attaquant.** Le raisonnement était juste et il a
été appliqué à une seule des deux routes.

### S13 — Dénis de service applicatifs ⚠️ passé avec réserve

**Ce qui est posé, et vérifié.** Corps borné (`bodyLimit`, 26 Mio par défaut) : un corps de
30 Mo est **refusé en 2,6 ms**, sans être lu. Délais de garde posés **à la connexion** libpq,
donc valables pour toute requête présente et future : `statement_timeout` 15 s,
`idle_in_transaction_session_timeout`, `lock_timeout` 5 s. Pool borné (10). Plafonds
applicatifs explicites et **non silencieux** : collection, liaison, sondage, champs par
enregistrement, caractères par valeur, profondeur et nœuds JSON — ce dernier fermant le
« `JSON.stringify` sur un million de nœuds » qui bloquerait la boucle d'événements.
60 sondages simultanés : 0,65 s au total.

**Pagination assumée, et correctement assumée.** Le chargement complet est le principe même
du §1.3 ; le dépassement est une **erreur explicite** plutôt qu'une troncature, et le
sondage annonce `tronque` pour que le client recharge. La conséquence à connaître : au-delà
de 20 000 lignes dans une collection, la filiale n'est plus servie **du tout**, pas
« servie partiellement ». C'est le bon arbitrage pour un outil de preuve, mais il mérite une
supervision, faute de quoi la panne se présentera comme une panne totale.

**Réserve, m-1.** Les erreurs 4xx de Fastify lui-même deviennent des **500 avec pile
d'appel au niveau `error`** dans le journal technique : le greffon ignore `erreur.statusCode`
(contrairement au gestionnaire de `serveur.ts`, qui l'honore). Un corps trop volumineux ou
un JSON malformé — les deux triviaux à produire en boucle — remplissent journald de traces
et déclenchent des alertes fausses.

**Ce que je signale sans le compter comme un défaut** : chaque sondage exécute
21 `count(*)` + 21 `select`, toutes les 20 s, par onglet ouvert, sans frein serveur. À dix
utilisateurs par filiale et vingt filiales, cela fait de l'ordre de 450 requêtes par seconde
en régime permanent, pour un résultat le plus souvent vide. C'est tenable, mais c'est un
coût de base qu'il vaut mieux avoir mesuré avant la mise en service qu'après.

### S14 — Intégrité des opérations composites ❌

**Ce qui tient.** `avecTransaction` est l'unique ouverture de transaction, et le moteur n'en
ouvre aucune : une opération composite tient donc dans un seul appel, par construction.
Vérifié sur la suppression d'une mesure du socle Groupe encore liée : les déliaisons partent,
la suppression finale échoue, **et tout est annulé** — le lien `EVAL-A → MESURE-G` est
toujours là après coup. Vérifié aussi sur une mesure locale : déliaison, purge de la mise en
œuvre, suppression, en une transaction. La propagation « au plus défavorable » verrouille ses
évaluations (`for update of e`) avant de recalculer.

**Ce qui échoue — B-3.** L'import « Remplacer » n'est pas une opération composite : c'est une
rafale de suppressions HTTP indépendantes. Rejoué dans un navigateur réel :

```
avant : risques = 8 | documents = 2 | incidents = 1
DataStore.applyImport(charge, 'replace')  → rend {"ok":false}
après : risques = 1 | documents = 0 | incidents = 0
suppressions HTTP émises : 20
« point de restauration » disponible : []
```

Vingt requêtes `DELETE`, sans transaction : une coupure VPN au milieu laisse la filiale à
moitié détruite, et l'état intermédiaire est parfaitement observable par les autres
utilisateurs. `applyImport` a d'ailleurs rendu `ok: false` — quelque chose a échoué — **et
la destruction a eu lieu quand même**.

### S15 — Dépendances ✅

`npm audit --omit=dev` : *found 0 vulnerabilities*. Quatre dépendances au total
(`fastify@5.12.1`, `pg@8.23.0`, plus TypeScript et les typages en développement), toutes
justifiées dans l'entête de `serveur.ts`. Aucune dépendance ajoutée par ce lot. La demande
de variable de configuration a bien été formulée plutôt que prise — sauf sur un point,
voir m-2.

### S16 — Les garde-fous sont branchés ✅

Le garde-fou du registre est **appelé** (`onReady`) et il **fait échouer le démarrage**. Je
l'ai éprouvé par sabotage sur ma base, dans les deux sens :

```
RLS non forcée sur risques                 → sortie 1, « Échec de l'ouverture du port »
                                             anomalie : « risques n'a pas enable ET force RLS »
colonne visée par un alias renommée        → sortie 1, « l'alias « date » vise une colonne inconnue »
colonne ENGENDRÉE non déclarée réservée    → sortie 1, « toute insertion la nommerait et échouerait »
colonne métier ordinaire supprimée         → LE SERVEUR DÉMARRE (voir m-4)
```

Trois sabotages sur quatre mordent, et mordent au bon endroit. Le quatrième est **hors de la
portée revendiquée** par le §6 du fichier, qui prend soin de dire « ce qu'il attrape, et rien
de plus » — la leçon du §17.5 est appliquée. Je ne le compte donc pas comme un échec, mais
comme une précision à porter au §1 du même fichier, qui promet un cran de plus (m-4).

---

## 4. Constats

### 4.1 Bloquants

---

#### **B-1 — Ouvrir la nouvelle application détruit les données de l'ancienne, même quand elle refuse de démarrer**

`cyber-gouvernance_V4/js/core/persistence.js` appelle `purgerBaseHeritee()` **au chargement
du module**, sans condition. La base `cyber-grc-db` — instantané complet des données de la
version 100 % navigateur **et** tous ses points de restauration versionnés — est effacée dès
que la page est ouverte.

Le raisonnement écrit dans l'entête est défendable (« laisser sur le poste une copie en clair
des données qu'on vient de rapatrier au serveur ne serait pas une omission neutre »). Il
suppose que la reprise a déjà eu lieu. **Rien ne le vérifie, et la purge a lieu avant que
l'application ait parlé à qui que ce soit.**

**Le scénario, rejoué dans un navigateur réel :**

```
1. bases avant ouverture       : ["cyber-grc-db"]        ← une filiale encore en version locale
   (le serveur est injoignable : on coupe /api/**)
2. écran affiché               : « Serveur indisponible »
3. bases APRÈS ouverture       : []
4. la base héritée existe ?    : false
```

L'utilisateur ouvre la nouvelle adresse, voit « Serveur indisponible — Vérifiez votre
connexion (VPN), puis réessayez », et **ses deux ans de travail sont déjà détruits**. Il n'a
rien fait de mal : il n'a pas encore pu se connecter.

`PLAN_SERVEUR` §2.6 fait de l'export `grc-backup` le chemin de reprise. L'ordre correct est
donc « exporter depuis l'ancienne version, puis ouvrir la nouvelle ». Aucun avertissement,
aucun contrôle, aucune proposition d'export ne défend cet ordre — et l'étape destructrice
passe **avant** que l'utilisateur puisse agir.

**Pourquoi bloquant.** Exigence n°1 du cadrage : « Aucune perte » (`PLAN_SERVEUR` §0.1).
Corriger maintenant coûte quelques lignes : ne purger qu'après un premier chargement réussi
**et** un export confirmé, ou simplement exporter d'office le contenu hérité dans un fichier
avant de purger. Après la mise en service, il n'y a rien à réparer : la donnée n'existe plus,
et aucun journal ne dira ce qu'elle contenait.

---

#### **B-2 — La croix « Masquer » éteint la seule trace, et l'application affirme ensuite que tout est enregistré**

`js/core/sync.js` pose une règle explicite dans son propre entête : *« une écriture refusée
produit toujours quelque chose de visible »*, et *« Le bandeau ne s'efface jamais tout seul »*.
Le bouton `#sync-fermer`, dont l'infobulle dit « Masquer », exécute
`incidents.length = 0; rendreBandeau();`. Il n'efface pas `bloques` — l'enregistrement reste
donc **définitivement exclu de toute écriture** — mais il efface tout ce qui le disait.

**Le scénario, rejoué de bout en bout :**

```
1. Alice crée un risque et l'enregistre       → en base : « Rançongiciel » / v1
2. Un collègue corrige la même fiche          → en base : « Rançongiciel (corrigé par Bob) » / v2
3. Alice modifie à son tour → CONFLIT
   bandeau : « Modifié entre-temps — Risque « Rançongiciel » … »
   état    : incidents 1, bloques 1
4. Alice clique sur la croix « Masquer »
   bandeau : ""                                ← plus rien
   état    : incidents 0, bloques 1            ← toujours bloqué
5. Alice travaille encore 20 minutes sur cette fiche, puis enregistre :
   bandeau                                : ""
   « des modifications en attente ? »      : false
   écran Paramètres                        : {enAttente:false, incidents:0}
   ce que la base contient                 : « version d'Alice »   ← rien n'est parti
6. beforeunload avertirait-il en fermant ? : false
```

Après le clic, l'application **ment activement** : le bandeau est vide, `Sync.etat().enAttente`
vaut faux (parce que `calculerDifferentiel` saute les enregistrements bloqués), l'écran
Paramètres annonce zéro incident, et le filet `beforeunload` laisse fermer l'onglet sans un
mot. Aucun autre point de l'interface ne lit `bloques` : `Sync.surChangementEtat` n'a **aucun
abonné** dans tout le dépôt. Le seul remède — le bouton « Recharger les données » — disparaît
avec le bandeau.

**Aggravant.** Le lot produit lui-même de fausses alertes qui entraînent à cliquer sur cette
croix. Le point d'historique quotidien du tableau de bord porte une unicité sur la date : deux
sessions ouvertes le même jour produisent

```
POST /api/entites/history {"champs":{"date":"2026-08-31",…}}
  → 409 « Cet enregistrement fait doublon … »
```

c'est-à-dire un bandeau « 1 modification non enregistrée — Point d'historique » parfaitement
anodin, quotidien, et que l'utilisateur apprendra à masquer d'un geste. Le geste appris sur
un faux positif s'appliquera au vrai.

**Pourquoi bloquant.** C'est le risque P1 déplacé d'un cran, exactement ce que l'entête du
fichier dit vouloir éviter. Corriger maintenant est trivial (conserver un indicateur compact
tant que `bloques` n'est pas vide ; faire compter `bloques` dans `aDesModificationsEnAttente`).
Après la mise en service, la saisie perdue est irrécupérable et indiscernable d'une saisie
jamais faite.

---

#### **B-3 — L'import « Remplacer » détruit la filiale hors transaction, sous la promesse d'un point de restauration qui n'existe plus**

Trois faits qui, séparément, seraient des mineurs, et qui ensemble forment un piège :

1. `DataStore.applyImport(payload, "replace")` vide les collections en mémoire, puis
   `sync.js` en déduit une **suppression par enregistrement** de tout ce que le serveur
   détenait et l'exécute en autant de requêtes `DELETE` indépendantes.
2. Les points de restauration **n'existent plus** : `createManualBackup` rend `false`,
   `listBackups` rend `[]`.
3. `js/modules/settings.js` continue d'annoncer le contraire, **à l'endroit exact du geste
   destructeur** : ligne 92 « Un point de restauration est créé avant toute modification » et
   ligne 299, dans la confirmation elle-même : *« Remplacer DÉFINITIVEMENT les données
   actuelles ? (un point de restauration est créé avant) »*.

Avant la bascule, ce bouton détruisait la copie navigateur de son seul auteur, et le point de
restauration existait vraiment. Après la bascule, il détruit **le jeu de données serveur de la
filiale**, pour tout le monde, sans filet — et le texte rassurant est resté.

**Rejoué** : 8 risques, 2 documents, 1 incident avant ; 1 risque, 0 document, 0 incident
après ; 20 `DELETE` HTTP ; `listBackups()` → `[]` ; valeur de retour `{"ok":false}`, et la
destruction a eu lieu quand même.

**Pourquoi bloquant.** L'action est irréversible, son rayon est la filiale entière, elle
n'est pas transactionnelle (S14), et aucun journal ne pourra distinguer ces suppressions de
suppressions légitimes (S3, L5 non livré). Corriger maintenant est immédiat : rectifier les
deux phrases et, tant que le moteur d'import transactionnel du lot L7 n'existe pas, refuser
le mode « Remplacer » ou l'exécuter en une seule transaction serveur.

---

### 4.2 Majeurs

#### **M-1 — Une filiale ne peut pas évaluer un contrôle du socle Groupe : le pivot est inopérant là où il a été inventé**

C'est le défaut le plus intéressant du lot, parce qu'il naît **entre** deux fichiers dont
chacun est correct.

`src/entites/index.ts` §8.4 traite avec soin le cas qu'il appelle lui-même « le cas NOMINAL
d'une filiale qui évalue un contrôle du socle Groupe » : si aucun champ de la table
principale ne change, on ne touche pas `mesure_catalogue` et on se contente d'un contrôle de
version en lecture. Le raisonnement est juste.

`js/core/sync.js` envoie **l'enregistrement entier** à chaque modification — c'est son
principe, `save()` ne dit pas ce qui a bougé. Le corps réellement émis :

```
PUT /api/entites/mesures/MESURE-G
{"version":1,"champs":{"statut":"conforme","maturite":4,"responsable":"","commentaire":"",
                       "nom":"Chiffrement des postes","description":""}}
```

`nom` et `description` appartiennent au catalogue. `principales.size` vaut donc 2,
`toucherPrincipale` est vrai, l'`update` sur `mesure_catalogue` est tenté, la RLS le refuse
(ligne de portée Groupe), et le diagnostic rend `portee_groupe` → **403**. La branche
« nominale » est **inatteignable depuis le navigateur** : c'est du code mort en pratique.

**Rejoué à deux navigateurs :**

```
bandeau chez Alice : « Écriture refusée — Mesure de sécurité « Chiffrement des postes » :
                       Cet élément appartient au socle commun du Groupe. »
Alice voit ensuite : {"statut":"","maturite":null}    ← sa saisie a été EFFACÉE de son écran
en base            : (aucune mise en oeuvre)
```

Une mesure **locale** fonctionne parfaitement (vérifié : `conforme / mat 3`). Le défaut ne
frappe donc que le **socle Groupe** — c'est-à-dire la raison d'être de la scission
`mesure_catalogue` / `mesure_mise_en_oeuvre` (`PLAN_SERVEUR` §2.2, `CONVENTIONS.md` §16.2),
et la condition pour que les vingt filiales soient comparables.

S'y ajoute l'effet de bord : le refus étant un refus de droit, `revenirALaValeurServeur`
remet la mémoire à l'état serveur — donc **efface du formulaire** ce que l'utilisateur venait
de saisir. Le comportement est celui que `sync.js` documente et défend (« la mémoire ne doit
pas mentir ») ; combiné à M-1, il se traduit par : « j'ai saisi mon évaluation, elle a
disparu ».

Remède : n'envoyer que les champs modifiés, ou répartir côté serveur en ignorant les champs
principaux dont la valeur est inchangée. **Traiter M-2 dans le même geste**, sans quoi le
correctif ouvre l'écrasement silencieux.

#### **M-2 — Le verrouillage optimiste de la mise en œuvre est facultatif** *(détail au contrôle S4)*

`versionMiseEnOeuvre` absent ⇒ `update` sans clause de version ⇒ écrasement silencieux, 200.
Latent aujourd'hui derrière M-1, ouvert dès que M-1 est corrigé, et **déjà exploitable par
tout appelant de l'API** qui omet le champ. Remède : rendre le champ obligatoire dès qu'une
mise en œuvre existe, ou passer par un `insert … on conflict … where version = $n`.

#### **M-3 — Oracle d'existence inter-filiales par la route de création** *(détail au contrôle S12)*

Une requête, une réponse déterministe, et une variante silencieuse qui ne laisse aucune
ligne derrière elle. Ferme le raisonnement de `RAPPORT_S1_TER` §T-8 d'un côté et l'ouvre de
l'autre. Remède : faire passer l'échec `23505` sur un identifiant **proposé par le client**
par le même verdict indistinct que le diagnostic — ou refuser que le client propose un
identifiant en dehors du chemin de reprise.

#### **M-4 — `mappings` : une entité de niveau Groupe que chaque filiale peut réécrire et supprimer**

`mappings` (le catalogue des correspondances ANSSI↔ISO↔NIS2↔DORA) est de niveau Groupe
(`CONVENTIONS.md` §16.4) : pas de colonne `filiale_id`, donc **hors de la famille de
politiques qui protège les lignes de portée Groupe des tables mixtes**, et hors du garde-fou
`portee: 'groupe'` de la création, qui ne s'applique qu'aux tables mixtes. Ses quatre
politiques sont `true`. Le registre l'expose comme une entité ordinaire.

Rejoué depuis une session `FIL-A` sans aucun privilège :

```
POST   /api/entites/mappings {"id":"MAP-SONDE","champs":{"theme":"forgé par FIL-A",…}} → 201
vu depuis FIL-B (psql)      : MAP-SONDE | forgé par FIL-A
                              liaison: MAP-SONDE/anssi/M1
DELETE /api/entites/mappings/MAP-SONDE                                                 → {"supprime":true}
```

Le §17.6 a été écrit pour empêcher exactement la situation symétrique — « une action de
portée Groupe ne doit pas modifier les données d'une filiale à son insu » — et a coûté un
constat bloquant à la porte S1. Ici le rayon va dans l'autre sens : **une action de filiale
modifie, pour vingt filiales, une référence commune**, sans droit à produire et sans journal
pour l'attribuer. En prime, deux filiales qui éditent la même correspondance se renvoient
des conflits `GRC03` provoqués par quelqu'un qu'elles ne peuvent pas voir.

Je m'arrête à « majeur » et non « bloquant » parce qu'aucune donnée propre à une filiale
n'est détruite et que le contenu est une surcouche de référence, versionnée. L'orchestrateur
peut légitimement le remonter d'un cran : le correctif est peu coûteux aujourd'hui
(conditionner l'écriture à `administrationGroupe`, comme les tables de configuration du
§17.4), et coûteux plus tard.

#### **M-5 — La barrière fail-closed ne couvre pas la recette** *(détail au contrôle S6)*

Refus en `production` uniquement ; `recette` sert et laisse écrire sans authentification, sur
un environnement que `PLAN_SERVEUR` §1.10 exige de remplir d'une copie réaliste de la
production. Remède : refuser partout sauf en `developpement`, ce qui est une ligne.

#### **M-6 — Sous la CSP de production, 70 gestionnaires en ligne sont bloqués** *(détail au contrôle S10)*

L'application démarre et paraît saine ; une large part de l'interface ne répond plus. La CSP
appartient au lot L0 et les gestionnaires en ligne à la SPA historique, mais **L2 est le
premier lot à faire vivre les deux ensemble**, et personne ne les a jamais fait vivre
ensemble avant moi. Remède : passer les 70 attributs en `addEventListener` (le dépôt le fait
déjà partout ailleurs — `document.getElementById("addBtn").onclick = …`), ou, à défaut,
assouplir la CSP en le sachant et en l'écrivant.

#### **M-7 — Le sondage peut perdre définitivement la modification d'un autre utilisateur** *(détail au contrôle S4)*

#### **M-8 — Le « non renseigné » du navigateur (`""`) est refusé par les énumérations du schéma**

Le modèle navigateur n'a jamais porté de `null` : son « non renseigné » est la chaîne vide,
et `convertirPourLaBase` la **conserve délibérément** pour les colonnes texte (« le
round-trip la doit »). Le schéma, lui, code le non-renseigné par `NULL` : toutes ses
énumérations s'écrivent `colonne is null or colonne = any(array[…])`. Les deux conventions ne
se rencontrent jamais, et le résultat est un **refus de l'enregistrement entier**.

Vérifié route par route :

```
traitements.base_legale = ''   → 400   |  base_legale = null → 201
actifs.type = ''               → 400   |  actifs.criticite = ''  → 400
prestataires.criticite/acces=''→ 400   |  documents.type = ''    → 400
incidents.type = ''            → 400   |  risques.niveau = ''     → 400
exigences.statut_conformite='' → 400   |  actions.statut = ''     → 400
```

Ce n'est pas théorique : **deux modules sont cassés par leur propre valeur par défaut**, et
je l'ai constaté en pilotant leurs formulaires réels, sans rien inventer.

* **Prestataires** — les listes `CRITICITE_OPTS` et `ACCES_OPTS` commencent par
  `["", "— Non évaluée —"]` / `["", "— Non évalué —"]`. Créer un prestataire sans évaluer sa
  criticité, c'est-à-dire l'état par défaut du formulaire, échoue :
  `« Enregistrement refusé — Prestataire « Infogérance SA » : La valeur du champ « acces »
  n'est pas admise »`. Toute la fonction « Risque fournisseur & chaîne d'appro NIS2/DORA »
  est inutilisable tant qu'on ne renseigne pas les deux listes.
* **Registre RGPD** — l'option par défaut de la base légale est `— À déterminer —`
  (`value=""`) : `« Enregistrement refusé — Traitement RGPD … champ « base » »`. On ne peut
  pas inscrire un traitement dont la base légale reste à qualifier, ce qui est pourtant l'état
  normal d'un registre article 30 en cours de constitution.

**Et un champ disparaît en silence.** `traitements.notes` n'a **aucune colonne**. Le
formulaire RGPD le collecte, le serveur refuse le champ, `sync.js` le retire du corps et
enregistre le reste :

```
Champs non reconnus par le serveur, donc non enregistrés : traitements.notes.
```

Le bandeau prévient — c'est à porter au crédit du lot, la mécanique est bien pensée — mais
l'enregistrement part **amputé**, et la note saisie ne sera jamais écrite. Un balayage
systématique du vocabulaire (jeu d'essai v12 de la reprise contre `/api/modele`) ne remonte
que ce champ ; c'est donc un trou unique et facile à combler, mais il est dans le registre
RGPD.

Remède : convertir `""` en `NULL` pour les colonnes non-texte **et** pour les colonnes texte
énumérées, ou admettre `''` dans les `check`. Le choix appartient à SCHEMA et à API ensemble ;
ce qui ne peut pas rester, c'est que chacun ait raison de son côté.

#### **M-9 — Le banc d'essai ne couvre ni les routes, ni le navigateur, ni 20 entités sur 21**

Développé au §5.

---

### 4.3 Mineurs

| # | Constat |
|---|---|
| **m-1** | Les 4xx de Fastify (JSON malformé, corps trop volumineux) deviennent des **500 avec pile d'appel au niveau `error`** : le gestionnaire du greffon ignore `erreur.statusCode`, contrairement à celui de `serveur.ts`. Statut faux pour le client, journal polluable à volonté, alertes fausses. |
| **m-2** | `backend/.env.example` — fichier **réservé à l'orchestrateur** (`PLAN_EXECUTION` §2) — a été modifié pour documenter `API_FILIALE_PROVISOIRE`, que **rien ne lit** (`grep` : une seule occurrence dans tout le dépôt). Une variable documentée et sans effet est pire qu'une variable absente : un exploitant la renseignera et croira avoir choisi sa filiale. |
| **m-3** | `f_interdit_changement_portee()` lève un `23514` **sans nom de contrainte**, et `src/erreurs/` relaie ces messages-là mot pour mot. Or celui-ci nomme la table (`tg_table_name`) et la portée précédente — ce que S12 interdit. Inatteignable aujourd'hui (l'API n'écrit jamais `filiale_id`), mais la règle « pas de nom de contrainte ⇒ message sûr » est fausse **dès maintenant**, et c'est la règle qui sera relue dans six mois. |
| **m-4** | Le §1 de `src/entites/index.ts` promet un garde-fou qui « fait échouer le démarrage si le registre et le schéma divergent » ; le §6 du même fichier précise honnêtement qu'il n'attrape que noms et formes. Le sabotage le confirme : la suppression d'une colonne métier ordinaire passe. Aligner le §1 sur le §6 (`CONVENTIONS.md` §17.5 : « son commentaire ne lui prête pas plus de portée qu'il n'en a »). |
| **m-5** | Le point d'historique quotidien produit un `409 doublon` visible par l'utilisateur dès que deux sessions coexistent le même jour — fausse alerte quotidienne sur un enregistrement purement dérivé, qui entraîne au geste de B-2. |
| **m-6** | Le bouton « Recharger les données » du bandeau appelle `recharger()` **directement**, sans pousser d'abord ce qui attend — contrairement à `rechargerApresEcriture()` qui existe deux fonctions plus bas et fait exactement cela. Les saisies non encore parties sur d'autres fiches sont perdues. |
| **m-7** | `js/modules/settings.js` affirme encore « Stockage local (mode hors-ligne) — vos données ne quittent jamais ce navigateur » (ligne 46), propose d'activer un chiffrement retiré (152, 209) et liste des points de restauration inexistants. Le module n'appartient pas à l'agent FRONT ; la conséquence lui appartient (voir B-3). |
| **m-8** | `DELETE /api/entites/:entite/:id` **sans** `?version` supprime sans contrôle de version. Documenté comme facultatif, et le navigateur envoie bien la version — mais `PLAN_SERVEUR` §1.4 range explicitement ce geste sous P1 (« supprimer une ligne que quelqu'un vient de modifier »). |
| **m-9** | **Périmètre (§5, point 7).** `backend/.env.example` (réservé) et `cyber-gouvernance_V4/index.html` (attribué à aucun rôle) ont été modifiés ; `backend/test/**` appartient à OUTILLAGE et porte 1 700 lignes neuves. C'est la même lacune que le constat m-6 de S1 : « un rôle absent du tableau est une lacune, pas une permission ». |

**Et un point de la définition de « terminé » (§5, point 6), que je signale sans le classer :**
`CHANGELOG.md`, `backend/README.md` §8 (qui affiche toujours « L2 — ⬜ à faire »),
`docs/DATA_MODEL.md` et `CLAUDE.md` n'ont **pas** été mis à jour. La porte est donc jouée sur
un lot dont l'état documenté est resté celui d'avant la vague. Si c'est un séquencement
délibéré (le rôle DOC intervenant à la fermeture de la porte), il faut l'écrire ; sinon c'est
un manquement au point 6.

---

## 5. L'état du banc d'essai — mord-il ?

**Réponse courte : celui de la vague 1 mord admirablement ; celui du lot L2 mord à peine.**

### Ce qui mord

Les quatre fichiers SQL de `test/api/` sont un modèle du genre, parce qu'ils ne se contentent
pas d'affirmer : ils **retirent la protection et montrent le dégât**. Le contrôle de morsure
est fait, nommément, et pour chaque propriété :

```
« LA CLAUSE MORD : sans « and version = $2 », Bob écrase Alice sans que rien ne le dise »
« LE ZÉRO MORD : les quatre situations rendent exactement rowCount = 0 »
« LA SONDE NAÏVE MORD : ne regarder que la version rend le verdict Q-7 mot pour mot »
« LE DÉCLENCHEUR MORD : sans lui, la ligne se présente comme créée en 2024 par le DG »
« LA TRANSACTION MORD : les mêmes écritures hors transaction laissent l'état à moitié fait »
« LE BALAYAGE MORD : une politique de lecture ouverte est immédiatement signalée »
```

La concurrence est **réelle** : deux connexions distinctes, `pg_locks` interrogé pour prouver
qu'un écrivain **attend** plutôt qu'une temporisation fixe, et le piège du pilote `pg` (les
requêtes d'une même connexion sont mises en file) consigné pour qu'il ne coûte pas un second
aller-retour. `semerJeuEssai` sème **les 35 tables cloisonnées** et le dit, parce qu'« un
balayage de fuite ne vaut que sur des tables qui contiennent quelque chose ». La leçon de
S1 — « la suite restait verte parce que rien n'exerçait le chemin corrigé » — a été comprise
et appliquée. C'est du très bon travail.

### Ce qui ne mord pas

| Ce qui est éprouvé | Ce qui ne l'est pas |
|---|---|
| Le comportement de PostgreSQL (55 tests) | **Aucune route.** Rien n'importe `dist/api/index.js`, rien ne monte Fastify, rien n'appelle `inject()` |
| `depot.modifier` (9 appels) et `depot.chargerJeuDeDonnees` (1) | `creer`, `supprimer`, `supprimerMesure`, `propagerMesure`, `rafraichir`, `decrire` : **jamais appelés** |
| L'entité `risques` | **Les vingt autres**, l'entité scindée `mesures` comprise — celle qui porte M-1 et M-2 |
| — | Les schémas JSON, le gestionnaire d'erreurs du greffon, la session provisoire, la barrière fail-closed |
| — | **Tout le navigateur** : `api.js`, `session.js`, `sync.js` (965 lignes neuves qui portent la parade P1 côté client), `datastore.js` remanié, `vault.js`, `persistence.js` |

Ce dernier point est le plus lourd, et il est en contradiction directe avec `CLAUDE.md` §5,
qui impose pour chaque itération des tests Playwright headless avec « 0 erreur » et des
captures de validation. **Il n'existe aucun test frontend dans le dépôt** (`grep -rl playwright`
ne rend rien hors `node_modules`). Or **six** de mes douze constats de gravité — B-1, B-2, B-3,
M-1, M-6, M-8 — n'existent que là, et se voient en une session de navigateur.

L'aide partagée assume de ne fournir aucun secours d'appel HTTP (« tant que les routes bougent,
une aide partagée figerait une forme qui n'est pas encore stable »). C'est un raisonnement
recevable pendant l'écriture ; il ne l'est plus à la porte, qui est précisément le moment où
la forme cesse de bouger.

---

## 6. Ce que la grille ne couvre pas

- **La grille §4 ne demande nulle part que le produit fonctionne.** M-1 (aucune filiale ne
  peut évaluer un contrôle du socle), M-6 (l'interface est inerte sous sa propre CSP) et M-8
  (deux modules refusés par leurs valeurs par défaut) ne violent aucun des seize contrôles :
  ce sont des ruptures de la chaîne complète, et seul un essai de bout en bout les voit. La
  grille a été écrite contre les défauts de sécurité ; la vague 2 démontre qu'à la jointure
  serveur/navigateur, **les défauts d'intégration sont aussi coûteux et aussi invisibles**.
  Un dix-septième contrôle serait justifié : *« le chemin complet a été parcouru dans un
  navigateur réel, contre le serveur réel, dans la configuration de déploiement réelle »*.
- **Elle ne couvre pas la destruction par l'outil lui-même.** S14 parle d'atomicité, pas de
  perte. B-1 et B-3 détruisent des données sans qu'aucun contrôle ne s'y oppose.
- **Elle ne couvre pas l'exactitude de ce que l'interface affirme.** B-2 et m-7 sont des
  mensonges de l'interface, et un outil de preuve qui affirme « tout est enregistré » quand
  ce n'est pas vrai est plus dangereux qu'un outil qui plante.
- Les limites déjà connues restent : elle ne remplace pas le test d'intrusion du lot L15, et
  ne protège ni d'un `root` sur la VM ni du propriétaire de la base (`CONVENTIONS.md` §12).

---

## 7. Ce que je n'ai pas pu vérifier

- **La VM cible.** Debian 13, Apache réel, PostgreSQL **17** (j'ai travaillé sur 16.13),
  systemd durci, ClamAV, Active Directory, relais SMTP. M-6 a été démontré avec la CSP
  *déclarée* dans `deploy/apache/cyber-grc.conf`, servie par un relais maison — pas par
  Apache lui-même. Si le vhost réel diffère du fichier versionné, le constat change ; le
  fichier versionné, lui, est sans ambiguïté.
- **Le comportement sous charge réelle** : dix utilisateurs par filiale, vingt filiales,
  liaison VPN internationale. Mes mesures de sondage valent pour un poste et une base vide de
  contention.
- **Le volume réel.** Le plafond de 20 000 lignes par collection n'a pas été atteint ; je n'ai
  pas éprouvé le comportement d'une filiale qui le franchit (le code refuse alors de servir).
- **L'exhaustivité du vocabulaire des modules.** M-8 a été établi sur les modules que j'ai su
  piloter et sur le jeu d'essai v12 de la reprise. Les modules Cartographie, Matrice, Audits
  (grille et constats en JSONB), Référentiels et Correspondances n'ont pas été parcourus
  formulaire par formulaire : **il peut rester des divergences de la même famille**, et un
  balayage systématique reste à faire.
- **La reprise d'un vrai export `grc-backup` de production** dans l'application basculée, de
  bout en bout. Le module de reprise serveur est éprouvé (77 tests) ; le chemin
  « fichier client → `applyImport` → `sync.js` → PostgreSQL » ne l'est pas.

---

## 8. Ce qui est solide, et qu'il faut dire

Refuser cette porte serait mal la lire si l'on n'ajoutait pas ceci : **le cœur du lot est
juste, et il est juste pour les bonnes raisons.**

- Les **trois pièges légués par la vague 1 sont fermés**, et fermés au bon endroit : le
  `UPDATE 0` est départagé en trois causes dans la transaction même qui a échoué ; les
  colonnes de traçabilité sont refusées à l'entrée, plus strictement que la base ; les
  insertions nomment leurs colonnes, la liste étant **découverte** et filtrée sur
  `engendree = false` plutôt que recopiée.
- Le **registre est déclaratif et minimal** : il ne dit que ce que PostgreSQL ne sait pas, et
  un garde-fou branché fait échouer le démarrage quand les deux divergent. La leçon « une
  liste écrite à la main est une omission qui attend » a été appliquée **au module qui
  l'énonce**, ce qui est rare.
- Le **contrôle S2 est tenu par une signature**, pas par une discipline. `resoudre()` sans
  paramètre est la meilleure garantie possible à ce stade, et elle se vérifie en trois `grep`.
- La **traduction des erreurs** est un module sans dépendance d'exécution, avec un `switch`
  exhaustif que le compilateur fait échouer si un motif est ajouté sans être traduit, et un
  cas par défaut qui avale l'inconnu. C'est la dette S1 payée proprement.
- Les **plafonds sont explicites et bruyants** : jamais de troncature silencieuse, un sondage
  qui annonce `tronque`, un JSON borné en profondeur et en nœuds.
- La **session provisoire dit ce qu'elle vaut** — dans son entête, dans un tableau
  « ce que L3 doit mettre à la place », et jusque dans la réponse de `/api/session`, qu'un
  auditeur peut interroger sans ouvrir le code. C'est la bonne manière de porter une dette.
- Côté navigateur, la décision de **loger les numéros de version dans `sync.js` et non dans
  les enregistrements** est exactement la bonne : `data` garde la forme que les modules et
  l'export `grc-backup` connaissent, et **un module qui reconstruit un objet ne peut pas
  égarer sa version**. J'ai cherché ce chemin — c'était la question posée — et il n'existe
  pas : aucun fichier de `js/modules/` ne mentionne `_version`, et `git diff --stat` confirme
  **zéro fichier modifié dans `js/modules/`**. La façade synchrone est réellement préservée.

Le lot ne casse pas là où on le craignait. Il casse là où deux agents avaient chacun raison
et ne se sont pas parlé — le serveur qui écrit partiellement et le client qui envoie tout,
la CSP de L0 et les gestionnaires en ligne de la SPA, le `NULL` du schéma et le `""` du
navigateur, la purge de l'ancien monde et la reprise qui n'a pas encore eu lieu.

---

## 9. Ce qu'il faut faire pour rejouer la porte

1. **Fermer les trois bloquants.** B-1 (ne pas détruire avant d'avoir repris), B-2 (ne jamais
   perdre la trace d'un enregistrement bloqué), B-3 (transaction ou refus, et corriger les
   deux phrases mensongères de l'écran Paramètres).
2. **Traiter M-1 et M-2 ensemble.** Le correctif de l'un ouvre l'autre ; les livrer séparément
   ferait entrer l'écrasement silencieux en production entre les deux.
3. **Écrire les tests qui manquent — et les faire mordre.** Les routes montées dans Fastify,
   `creer` / `supprimer` / `propagerMesure` / `rafraichir` sur l'entité **scindée**, et un
   banc Playwright sur la bascule : conflit, refus de droit, panne réseau, rechargement,
   sondage, import. Chaque correctif de ce rapport doit venir avec le test qui **échoue sans
   lui** — la règle du chantier, et la seule qui ait tenu jusqu'ici.
4. **Rejouer la grille entière**, pas seulement les correctifs, par un auditeur qui n'aura
   écrit aucune des lignes examinées — y compris aucune de celles que ce rapport aura
   provoquées. Cinq passages de S1 sur six ont trouvé leur premier défaut **dans le correctif
   du passage précédent**.

---

*Fin du rapport S2. Les scripts d'attaque, les journaux de serveur et les traces de navigateur
sont restés dans le scratchpad de session et n'ont pas été versés au dépôt. Aucune base
existante n'a été modifiée ; `grc_audit_s2` a été montée pour cet audit et lui seul.*
