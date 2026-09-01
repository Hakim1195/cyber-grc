# Porte de sécurité S2 (3ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-TER**, agent indépendant. Je n'ai écrit aucune des lignes examinées,
> ni aucun des deux rapports précédents. Travail en **lecture seule** sur le dépôt : le seul
> fichier que je crée est celui-ci.
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`,
> révision examinée **`f631dbf`** (« Les deux propriétés qui ne mordaient pas, et un
> instrument qui inventait »).
>
> Référence : `docs/PLAN_EXECUTION.md` §4 (les **dix-huit** contrôles) et §5 ;
> `docs/PLAN_SERVEUR.md` §0.1, §1.3, §1.4, §1.9, §1.10, §2.4, §2.6, §5, §7 ;
> `backend/db/CONVENTIONS.md` §15 à §20 ; `docs/securite/RAPPORT_S2.md` et
> `docs/securite/RAPPORT_S2_BIS.md`.
>
> Date : 01/09/2026.

---

## 1. Verdict

> ### ❌ **PORTE REFUSÉE** — 1 bloquant, 4 majeurs, 9 mineurs. **Le contrôle S18 échoue.**

Le serveur, lui, tient. Les trois bloquants du premier passage sont fermés — je les ai
rejoués moi-même, dans un vrai navigateur, contre le vrai serveur —, les quatre majeurs du
second le sont aussi, et deux d'entre eux le sont **au bon endroit** : la barrière du socle
Groupe est dans la **base** (`42501` de la RLS), le contrôle applicatif n'étant plus qu'une
défense en profondeur, et je l'ai vérifié en retirant l'application du chemin. La ré-émission
d'identifiant referme réellement l'oracle du constat N-1 : le bilan d'une reprise est
**strictement identique** que l'identifiant soit libre ou déjà pris par une filiale invisible.
C'est du bon travail, et il faut le dire avant le reste.

**Le lot casse ailleurs, et cette fois du côté du navigateur, sur le geste que le client a
désigné comme décisif : l'import.** Un import de 250 lignes annonce « 250 exigences
importées » et n'en écrit que 222. Rien ne le dit : pas de bandeau, pas d'incident, pas
d'erreur de console, et le sondage ne rattrape rien — cinquante secondes plus tard, le
compte n'a pas bougé. Le reste part au premier geste suivant de l'utilisateur ; s'il n'y en a
pas, il ne part jamais. Sur l'import CSV d'AirCyber, ce sont **13 réponses sur 234** qui
manquent — donc un score de conformité faux, dans l'outil que le client destine à la preuve
d'audit ISO 27001.

| # | Constat | Gravité |
|---|---|---|
| **T-1** | **Un import en lot n'écrit qu'une partie de ses lignes, annonce le succès, et rien ne le dit** | 🔴 **bloquant** |
| **T-2** | La ré-émission d'identifiant fabrique un **jumeau silencieux** quand le fichier porte deux fois le même identifiant — et réoriente les références vers le jumeau | 🟠 majeur |
| **T-3** | `POST /api/reprise` **lit, migre et analyse le fichier avant la barrière fail-closed** : en production, un appelant non authentifié fait travailler le serveur 139 ms par requête | 🟠 majeur |
| **T-4** | **Un fichier `grc-backup` ne peut être repris qu'une seule fois, définitivement** : « Fusionner » puis « Remplacer » avec le même fichier est refusé, restaurer deux fois la même sauvegarde est impossible | 🟠 majeur |
| **T-5** | Le **plan de renommage n'est pas cloisonné par entité** : un export ancien où deux entités partagent un identifiant fait réécrire la référence de l'une vers l'autre, et la reprise entière est refusée sur un message qui accuse l'utilisateur | 🟠 majeur |

Le critère de gravité employé depuis le début du chantier — *un défaut est bloquant si le
corriger maintenant coûte peu et le corriger après la mise en service exige de réparer des
données qu'on ne pourra plus distinguer des légitimes* — désigne **T-1** sans hésitation. Le
corriger coûte une ligne (l'espace aléatoire de `UI.genId` fait mille valeurs). Après la mise
en service, un registre d'exigences amputé de 9 % de ses lignes est rigoureusement
indiscernable d'un registre que personne n'a fini de remplir.

**Et une observation de méthode, parce qu'elle vaut pour les portes à venir.** T-1 n'a été
trouvé ni par la lecture du code, ni par le banc d'essai, ni par l'un des deux passages
précédents. Il n'apparaît qu'en **comptant les lignes en base après un geste réel de
l'utilisateur** — pas en vérifiant que le geste « fonctionne ». Les deux rapports précédents
ont piloté des formulaires ; aucun n'a recompté ce qui était arrivé de l'autre côté.

---

## 2. Comment cette porte a été jouée

Rien ici ne repose sur la lecture seule du code, ni sur la démonstration de quelqu'un
d'autre. Ce qui est affirmé, je l'ai rejoué.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2t`**, neuve, créée par `db/dev/preparer_base_dev.sh --recreer` (4 migrations, garde-fous du schéma : aucune anomalie), plus **quatorze bases d'essai jetables** ouvertes par `ouvrirBaseEssai`, purgées à la fin. Aucune base existante n'a été touchée. |
| Données | Deux filiales `FIL-ESSAI-A` / `FIL-ESSAI-B` à égalité, socle de Groupe (`MESURE-G`, `DOC-G`, `PERS-G`, `PARAM-G`, `MAP-G`), semées **par le compte applicatif sous périmètre** |
| Serveur | `construireServeur()` réel, monté quatorze fois, en `developpement`, puis rejoué en `recette` et en `production` |
| Frontend | La SPA servie telle quelle par un relais maison, `/api/*` relayé vers l'instance Fastify réelle, sous **la CSP exacte extraite de `deploy/apache/cyber-grc.conf`** |
| Navigateur | Playwright / Chromium, **quinze scénarios**, dont un import Excel réel de 250 lignes fabriqué avec la SheetJS embarquée de l'application |
| Sabotages | Renommage de colonne, `disable row level security`, suppression de politique, colonne métier retirée — sur bases jetables, restaurées à chaque fois |

Ce que j'ai fait tourner avant de commencer, pour ne pas confondre un défaut avec un
environnement cassé :

```
$ npm run verifier-types                     → aucune erreur
$ npm test                                   → tests 490 · pass 490 · fail 0   (25,0 s)
$ node --test "test/navigateur/*.test.mjs"   → tests  22 · pass  22 · fail 0
$ npm audit --omit=dev                       → found 0 vulnerabilities
$ psql -f db/verifier_cloisonnement.sql      → 106 contrôles · 106 réussis · 0 échoué
$ git status --porcelain                     → (vide, avant et après ; backend/dist/ est ignoré)
```

Les scripts d'attaque sont restés dans le scratchpad de session ; **aucun n'a été versé au
dépôt**, et le dépôt n'a pas été modifié d'une ligne.

**Ce que j'ai vérifié de mon propre outillage, avant d'accuser le code.** Deux fois, mon
instrument m'a menti et j'ai failli rapporter un défaut qui n'existait pas :

* un `PUT` qui paraissait **pendre indéfiniment** — c'était mon budget de temps global,
  consommé par la création de la base et les migrations ; rejoué avec une garde de 20 s, la
  route répond en 3 ms ;
* trois cents créations qui « n'arrivaient pas au serveur » — mes enregistrements n'avaient
  pas d'identifiant, et le différentiel les ignore à juste titre.

Le constat **T-1** a survécu à cette défiance : je l'ai reproduit **quatre fois**, par trois
chemins différents (import Excel réel, import CSV AirCyber par son code réel, deux
enregistrements fabriqués), en comptant les requêtes HTTP émises et les lignes en base.

---

## 3. Le sort des vingt et un constats du premier passage

### 3.1 Les trois bloquants — tous fermés, tous rejoués par moi

| # | Constat | Sort | Ce que j'ai constaté |
|---|---|---|---|
| **B-1** | Ouvrir l'application détruisait la base héritée | ✅ **fermé** | Base `cyber-grc-db` fabriquée à la main, application ouverte **API coupée** : écran « Serveur indisponible », `indexedDB.databases()` → `["cyber-grc-db"]`, contenu intact. API rétablie : la base est **toujours là**, et un bandeau propose « Exportez-les, ou reprenez-les dans cette filiale. Rien ne sera effacé sans votre accord. » |
| **B-2** | La croix « Masquer » éteignait la seule trace | ✅ **fermé** | Conflit fabriqué par un tiers via `fetch` direct. Avant la croix : `{enAttente:true, incidents:1, bloques:1}`, bandeau détaillé. **Après** : `{enAttente:true, incidents:0, bloques:1}` et le bandeau devient « 1 enregistrement(s) non enregistré(s) — la saisie reste à l'écran mais n'est pas partie au serveur. [Voir le détail] [Recharger les données] ». L'application ne dit plus jamais « tout est enregistré ». |
| **B-3** | L'import « Remplacer » détruisait la filiale hors transaction | ✅ **fermé** | `applyImport(payload,'replace')` par le chemin du produit : `{ok:true, transactionnel:true, supprimes:22}`, **0 requête `DELETE`**, 1 `POST`. Volumes serveur 2/2/2/2 → 1/0/1/1 (le socle Groupe survit). L'écran Paramètres ne promet plus de point de restauration. |

### 3.2 Les neuf majeurs

| # | Sort | Preuve que j'ai rejouée |
|---|---|---|
| **M-1** — filiale ne pouvant évaluer un contrôle du socle | ✅ **fermé** | `PUT …/mesures/MESURE-G` avec les seuls champs de mise en œuvre → **200** ; avec **l'enregistrement entier** (définition inchangée comprise) → **200** ; en tentant de renommer la définition → **403 `hors_perimetre`**. Le pivot fonctionne, et le droit n'est exigé que si une écriture aurait lieu. |
| **M-2** — verrou de la mise en œuvre facultatif | ✅ **fermé** | Course fabriquée par HTTP : Alice → 200 (`vmo` 1→2) ; Bob avec la **même** `vmo` périmée → **409 GRC03** ; Bob **sans** `vmo` → **409 GRC03**. Le travail d'Alice survit. |
| **M-3** — oracle par la route de création | ✅ **fermé** | `id` dans l'enveloppe → **400** avec la phrase qui explique la règle. `id` glissé **dans `champs`** → 201, identifiant engendré par le serveur, **et le même verdict que l'identifiant soit libre, pris ailleurs, ou quelconque**. Pas d'oracle. (Réserve de forme : voir **T-6**.) |
| **M-4** — `mappings` réécrivable par toute filiale | ✅ **fermé, et j'ai vérifié OÙ** | `POST /api/entites/mappings` depuis une filiale → 403. En retirant l'application du chemin, `insert into mappings` en session de filiale ordinaire → **`42501 new row violates row-level security policy`** ; la même écriture en administration Groupe → aucun refus. **La barrière est dans la base** ; le contrôle applicatif est une défense en profondeur, pas un diagnostic. |
| **M-5** — fail-closed ne couvrant pas la recette | ✅ **fermé** | Trois environnements montés : `production` et `recette` → `session` 503, `donnees` 503, `POST risques` 503 ; `developpement` ouvert. |
| **M-6** — 70 gestionnaires en ligne bloqués par la CSP | ✅ **fermé** | SPA servie sous la CSP exacte du vhost, cinq sessions de navigateur, quatre modules pilotés par leurs vrais boutons, import Excel réel : **0 violation de CSP, 0 erreur de script**. |
| **M-7** — le sondage perdait la modification d'un autre | ✅ **fermé** (lu, non rejoué) | `repereDeSondage()` prend `transaction_timestamp()` et lui retranche `BORNES.margeSondageMs`. Je n'ai pas fabriqué la course. |
| **M-8** — le `""` du navigateur refusé par les listes fermées | ✅ **fermé** | `prestataires` (`criticite`/`acces` vides) → 201 ; `traitements` (`base_legale` vide) → 201 ; `actifs`, `incidents` → 201 ; `traitements.notes` écrit **et relu**. (`documents` avec `statut:''` → 400 « obligatoire », mais le formulaire du produit ne le produit jamais : sa valeur par défaut est `brouillon`.) |
| **M-9** — le banc ne couvrait rien | ✅ **largement fermé** | 490 tests, dont 22 de navigateur et une aide HTTP partagée. Ce qu'il ne couvre toujours pas est dit au §7 — et c'est là que vit **T-1**. |

### 3.3 Les neuf mineurs

| # | Sort | Constat |
|---|---|---|
| **m-1** | ✅ fermé | JSON malformé → 400, corps 31 Mo → **413**, route inconnue → 404, méthode inconnue → 404. Aucune pile. |
| **m-2** | ✅ fermé | `API_FILIALE_PROVISOIRE` et `API_ADMINISTRATION_GROUPE_PROVISOIRE` sont lues par `src/api/session.ts` et documentées dans `.env.example`. |
| **m-3** | ✅ fermé (lu) | `messageSurEtRedige()` filtre les jetons contre les noms d'objets découverts. |
| **m-4** | ⚠️ toujours ouvert, sans gravité | La suppression d'une colonne métier ordinaire **ne fait pas échouer** le démarrage : le serveur démarre et le champ devient inconnu (400). C'est la portée revendiquée au §6 du registre ; le §1 promet toujours un peu plus. |
| **m-5** | ✅ fermé | Deux points d'historique le même jour → 409 portant `identifiant: "HIST-…"` et `version_actuelle: 1`. |
| **m-6** | ✅ fermé (lu) | Le bouton du bandeau appelle `rechargerApresEcriture()`. |
| **m-7** | ✅ fermé | Écran Paramètres relu dans le navigateur : plus de chiffrement local, plus de points de restauration, plus de « ne quittent jamais ce navigateur ». (Mais voir **T-11**.) |
| **m-8** | ✅ fermé | `DELETE` sans `?version` → **400** ; avec une version fausse → **409 GRC03**. |
| **m-9** | ❌ **toujours ouvert** | Voir **T-13**. |

---

## 4. Le sort des quinze constats du second passage

| # | Sort | Preuve que j'ai rejouée |
|---|---|---|
| **N-1** — oracle rouvert par la reprise | ✅ **fermé sur le canal visé**, résidu **T-9** | Sondes en `apercu:true` sur `risques`, `mesures`, `personnes`, `documents` : `RISK-B`, `RISK2-B`, `MESURE-B`, `PERS-B`, `DOC-B` (invisibles) et des identifiants libres rendent **exactement le même bilan** (`{crees:1, maj:0, liaisons:0, lus:1}`, 200). Le seul écart mesurable est **temporel** (~1 ms, voir T-9), et le canal « importer puis relire » subsiste hors aperçu. |
| **N-2** — le produit ne savait pas reprendre son propre export | ✅ **fermé** | Round-trip complet par le chemin du produit dans un vrai navigateur : `exportSnapshot()` (111 136 octets) → `parseImport` → `applyImport(…, 'merge')` → **200, 326 mises à jour, 0 création, aucun refus**. Vérifié aussi à l'API sur un socle Groupe complet (`mappings` + `documents` + `personnes` + `mesures` renvoyés à l'identique → 200, 0 création). |
| **N-3** — la liste gardait l'identifiant local | ✅ **fermé** | Créations par les vrais boutons sur **actifs, personnel, risques** : l'identifiant affiché est celui du serveur, **zéro `data-id` périmé** dans le document. (Incidents ouvre la fiche au lieu de la liste — comportement du module, pas un résidu.) |
| **N-4** — `retirerLesInchangees` échouait contre `NULL` | ⚠️ **fermé pour texte et date, ouvert pour les autres familles** | `aide` (texte, `NULL` en base) renvoyée à `''` → 200 ; `_deleted` (booléen) renvoyé à `''` → **403**. Voir **T-7**. |
| **N-5** — message faux sur une référence morte | ❌ **toujours ouvert, et il a gagné du terrain** | Une reprise portant une référence qui ne pointe nulle part rend « cet enregistrement, ou l'un des éléments qu'il désigne, n'existe pas dans votre périmètre — ou sort de la filiale où vous travaillez ». La cause réelle est un fichier incohérent ; le message envoie chercher un problème de droits. Voir **T-10**. |
| **N-6** — `/api/modele` échappait au fail-closed | ✅ **fermé** | `production` et `recette` : `/api/modele` → **503**. Mais la même faille existe ailleurs : voir **T-3**. |
| **N-7** — balayage anti-drapeau nominal | ✅ **fermé** | `routes.test.mjs` balaie désormais **aussi** `set_config('grc.administration_groupe', …)` et `set grc.administration_groupe =`, par `readFileSync` (donc insensible à l'octet NUL de T-8). |
| **N-8** — « Ce fichier a déjà été importé » à tort | ❌ **toujours ouvert** | `applyImport` traduit encore **tout** `contrainte_base` par cette phrase. Elle est désormais juste pour l'unicité d'idempotence — et fausse pour un `23503` de référence morte. Voir **T-10**. |
| **N-9** — la trace d'import ne disait pas ce qu'elle détruisait | ✅ **fermé** | Ligne `imports` relue : « reprise « fusionner » depuis un export v12 · 0 ligne(s) supprimée(s) · 0 liaison(s) · 0 champ(s) sans destination », `lignes_ignorees = 0`. |
| **N-10** — un refus nommait un identifiant interne | ✅ **fermé** (lu) | `inserer` reçoit l'identifiant que l'appelant connaît. Non rejoué. |
| **N-11** — aucun cassage de cache | ❌ **toujours ouvert** | `index.html` charge **59 `<script>`, dont 0 porte un jeton de version**, sous `ExpiresByType application/javascript "access plus 7 days"`. |
| **N-12** — coût de la reprise, absence de frein | ❌ **toujours ouvert, et aggravé** | Mesuré : 20 000 enregistrements (4,5 Mo) analysés en 139 ms de calcul bloquant — **et ce calcul a lieu avant l'authentification** (T-3). |
| **N-13** — deux propriétés que le banc n'éprouvait pas | ✅ **fermé, et mieux que demandé** | Le verrou de la mise en œuvre a désormais son fichier de test (`verrou-mise-en-oeuvre.test.mjs`, 331 lignes) ; et le garde-fou du socle Groupe n'est plus seulement applicatif — il est **dans la RLS**, ce que j'ai vérifié en le contournant. |
| **N-14** — la documentation en retard | ❌ **toujours ouvert, troisième passage** | `backend/README.md` ligne 407 : « L2 — API et bascule de la persistance \| ⬜ à faire (vague 2) ». `CHANGELOG.md` : aucune entrée. Voir **T-12**. |
| **N-15** — périmètre | ⚠️ **partiellement fermé** | `backend/.env.example` n'a plus bougé depuis `8ff7d75`. `cyber-gouvernance_V4/index.html` (**277 lignes modifiées dans la vague**) n'appartient toujours à aucun rôle du §2. Voir **T-13**. |

---

## 5. La grille §4 — dix-huit contrôles

Rappel de la règle : « sans objet » n'est jamais « passé ».

| # | Contrôle | Statut |
|---|---|---|
| S1 | Cloisonnement par filiale non contournable | ✅ **passé** |
| S2 | Le périmètre ne vient jamais du navigateur | ✅ **passé** |
| S3 | Journal d'audit inaltérable et complet | ⬜ **sans objet** (L5) — avec la conséquence dite ci-dessous |
| S4 | Verrouillage optimiste effectif | ✅ **passé** |
| S5 | Aucune injection SQL | ✅ **passé** |
| S6 | Droits vérifiés côté serveur | ⬜ **sans objet** (L3) — la barrière provisoire est fermée partout **sauf sur `/api/reprise`**, qui travaille avant elle (**T-3**) |
| S7 | Le droit d'export est distinct de la lecture | ⬜ **sans objet** (L3) |
| S8 | Secrets | ✅ **passé** |
| S9 | Chaîne de contrôle des pièces jointes | ⬜ **sans objet** (L6) |
| S10 | Sortie et en-têtes | ✅ **passé** (réserve de cache : T-14) |
| S11 | Limitation du rythme et verrouillage | ⬜ **sans objet** (L3) — **T-3** rend son absence coûteuse |
| S12 | Les erreurs ne renseignent pas l'attaquant | ✅ **passé** (résidus T-9 et T-10) |
| S13 | Dénis de service applicatifs | ⚠️ **passé avec réserve** (**T-3**) |
| S14 | Intégrité des opérations composites | ✅ **passé** |
| S15 | Dépendances | ✅ **passé** |
| S16 | Les garde-fous sont branchés | ✅ **passé** |
| S17 | Le chemin complet a été parcouru pour de vrai | ⚠️ **passé avec réserve** (Apache, Debian 13, PostgreSQL 17 hors de portée) |
| S18 | **Le produit fait ce qu'il doit faire** | ❌ **ÉCHOUÉ** (**T-1**, **T-4**) |

### S1 — Cloisonnement ✅

`db/verifier_cloisonnement.sql` : **106 contrôles, 106 réussis, 0 échoué**, sous la seule
réserve documentée (C22, lecture du journal d'audit non cloisonnée — dette assumée de L5).
Depuis une session `FIL-ESSAI-A` : `GET /api/donnees` ne contient ni `FIL-ESSAI-B` ni
`RISK-B` ; `PUT` et `DELETE` sur une ligne voisine → 404 indistinct ; `POST` avec
`filiale_id` dans `champs` → 400 au bord ; `POST` avec `portee: "groupe"` → 403.

**Ce que j'ai tenté et qui n'a pas mordu** : entêtes `x-filiale-id`, `x-grc-filiales`,
`x-administration-groupe`, cookie forgé, `?filiale=`, `mappings` de niveau Groupe, propagation
sur une mesure voisine (200 avec `evaluationsMisesAJour: 0` — **le même verdict que sur une
mesure inexistante**, donc pas d'oracle non plus).

### S2 — Le périmètre ne vient jamais du navigateur ✅

Vérifié par la forme et par l'essai. `resoudre()` ne prend aucun argument ;
`appliquerPerimetre()` est le seul poseur des quatre réglages et n'est appelé que par
`avecTransaction`. Aucune des cinq entêtes/cookies/paramètres essayés ne modifie ce que la
session voit. `purgerBaseHeritee()` n'est **plus appelé au chargement** (une seule occurrence
dans tout le frontend, dans un commentaire qui explique pourquoi).

### S3 — Journal d'audit ⬜ sans objet (L5)

`journal_audit` porte exactement les deux lignes du semis après toute ma campagne. C'est
conforme au découpage, et cela pèse sur les constats : **aucune des pertes décrites en T-1 ne
laisse la moindre trace**. Tant que L5 n'existe pas, une ligne absente est indiscernable
d'une ligne jamais saisie — c'est très exactement le critère qui rend T-1 bloquant.

### S4 — Verrouillage optimiste ✅

Les deux moitiés de l'entité scindée sont arbitrées, et je l'ai fabriqué moi-même :

```
Alice (vmo 1)            → 200, vmo = 2
Bob   (MÊME vmo périmée) → 409 GRC03
Bob   (SANS vmo)         → 409 GRC03
en base : statut « conforme », maturité 4     ← le travail d’Alice survit
DELETE sans version      → 400
DELETE ?version=99       → 409 GRC03
```

Un `PUT` qui ne change rien n'avance pas la version — **et le contrôle de version reste
joué** : avec une version périmée, un corps sans changement rend bien `409 GRC03` et non 200.
J'ai cherché ce que ce nouveau contrat ouvrait, et je n'ai rien trouvé qui morde : sur une
ligne **illisible**, `retirerLesInchangees` ne retire rien (la lecture est vide), l'`update`
part, rend zéro ligne, et le diagnostic conclut `404` — **le même 404 qu'un identifiant
inexistant**. Il n'y a donc pas d'oracle de contenu sur ce qu'on ne peut pas lire.

### S5 — Aucune injection SQL ✅

Noms d'entité (`risques"; drop table risques; --`, `__proto__`, `constructor`, `pg_class`,
`RISQUES`), noms de champ, identifiants, pollution de prototype : tout est refusé au bord ou
par le registre. `select count(*) from risques` inchangé après la campagne. Les identifiants
SQL passent tous par `ident()`, alimenté par le catalogue.

### S6 — Droits ⬜ sans objet (L3), avec un trou nommé

Le fail-closed couvre désormais `/api/session`, `/api/donnees`, `/api/modele` et les
écritures, en `production` **et** en `recette`. **Il ne couvre pas le travail de
`/api/reprise`** : la route lit, décode et migre le fichier **avant** d'appeler le résolveur.
Détail en **T-3**.

### S7 · S9 · S11 — ⬜ sans objet (L3, L6, L3)

L'absence de limitation de rythme (S11) devient coûteuse à cause de T-3 : la route la plus
chère du produit est atteignable sans authentification.

### S8 — Secrets ✅

Aucun secret littéral dans `src/`, `db/`, `deploy/`, `js/` (les deux occurrences de
`PGPASSWORD` sont des références de variable). `/api/session` ne rend que l'identité, la
filiale et l'aveu que l'authentification est provisoire. Aucun message d'erreur ne porte de
nom de table, de pile d'appel ni de SQL.

### S10 — Sortie et en-têtes ✅

`x-content-type-options: nosniff` et `cache-control: no-store` sur toutes les réponses de
l'API, y compris `/api/sante`. La CSP du vhost, appliquée telle quelle dans le navigateur :
**0 violation** sur cinq sessions, quatre modules pilotés, un import réel. Réserve : **T-14**
(aucun jeton de version sur 59 scripts).

### S12 — Les erreurs ne renseignent pas l'attaquant ✅

`PUT` sur une ligne voisine, sur une ligne voisine **avec la valeur exacte qu'elle porte**, et
sur un identifiant inexistant : **trois fois la même phrase, le même code, le même statut**.
Un refus de RLS ne laisse fuir ni table, ni politique, ni SQL. Le bilan d'une reprise ne
distingue pas « identifiant pris ailleurs » de « libre ».

Deux résidus, tous deux mineurs et tous deux dits : le canal « importer puis relire » (T-9)
et deux messages qui désignent la mauvaise cause (T-10).

### S13 — Dénis de service ⚠️ passé avec réserve

Les bornes sont là et je les ai toutes heurtées :

```
valeur de 300 000 caractères   → 400 « dépasse 200000 caractères »
300 champs                     → 400 « maximum 80 »
document imbriqué 60 fois      → 400 « imbriqué trop profondément »
corps de 31 Mo                 → 413, sans être lu
route inconnue / méthode       → 404
```

**Réserve, T-3** : la route de reprise fait **139 ms de calcul bloquant** sur un fichier de
4,5 Mo *avant* de refuser en 503 pour absence d'authentification. À la borne de 20 Mo, c'est
une demi-seconde d'événement bloqué par requête, sans authentification et sans frein.

### S14 — Intégrité des opérations composites ✅

* **reprise** : un fichier qui échoue à la fin ne laisse rien — 2 risques avant, 2 après,
  `RISK-OK-1` absent, aucune ligne `imports` ;
* **aperçu** : un « remplacer » en aperçu rend le bilan exact des 20 collections purgées et
  **ne supprime rien**, ligne `imports` comprise (0 avant, 0 après) ;
* **propagation** : une transaction, `evaluationsMisesAJour: 1`, verrouillage `for update` ;
* **cascade** : `supprimerMesure` délie puis supprime, dans la seule filiale active.

### S15 — Dépendances ✅

`npm audit --omit=dev` : *found 0 vulnerabilities*. Deux dépendances d'exécution
(`fastify`, `pg`), aucune ajoutée depuis le passage précédent.

### S16 — Les garde-fous sont branchés ✅

Éprouvé par sabotage, dans les deux sens, et sur les **deux** chemins :

```
# chemin de DÉPLOIEMENT (f_verifier_schema, point d'appel unique)
alter table risques disable row level security;
node db/migrate.mjs --verifier   → code de sortie 7
      [couverture_rls] risques → rls_desactivee
node db/migrate.mjs              → code de sortie 7   (l'application est refusée aussi)
alter table risques enable  …    → code de sortie 0

# chemin d'EXÉCUTION (garde-fou du registre, onReady)
alter table revues rename column date_revue to date_revue_zz;
   → le service NE DÉMARRE PAS : « revues : l'alias « date » vise une colonne inconnue »
alter table risques no force row level security;
   → le service NE DÉMARRE PAS : « risques n'a pas « enable » ET « force row level security » »
```

Deux sabotages passent sans bruit, et c'est **conforme à la portée revendiquée** : la
suppression d'une colonne métier ordinaire (le champ devient inconnu, 400) et la suppression
d'une politique de lecture (la table devient alors refus-par-défaut, donc fail-closed).

### S17 — Le chemin complet ⚠️ passé avec réserve

Parcouru pour de vrai : navigateur réel, serveur réel, CSP réelle du vhost, base migrée
depuis zéro, fichiers Excel fabriqués par la bibliothèque embarquée de l'application. **C'est
là que T-1 a été trouvé**, et il n'est visible d'aucune autre façon. Ce qui manque au
parcours : Apache lui-même, Debian 13, PostgreSQL 17.

### S18 — Le produit fait ce qu'il doit faire ❌

Deux gestes ordinaires échouent.

* **T-1** — « j'importe mon fichier Excel » : l'écran annonce 250 lignes, le serveur en reçoit
  222, et rien ne le dit. Sur l'import CSV d'AirCyber : 234 annoncées, 222 écrites.
* **T-4** — « j'ai fusionné, je préfère finalement remplacer » : refusé. « Je restaure ma
  sauvegarde une seconde fois » : refusé, définitivement, avec un message qui renvoie à
  l'exploitant.

Aucun des deux ne viole un contrôle de sécurité. C'est exactement pourquoi S18 existe.

---

## 6. Constats neufs

### 6.1 Bloquant

---

#### **T-1 — Un import en lot n'écrit qu'une partie de ses lignes, annonce le succès, et rien ne le dit**

**Le geste, joué par son vrai chemin.** Un classeur de 250 exigences, fabriqué avec la
SheetJS embarquée de l'application, passé à `ImportExcelService.importExigences` — c'est-à-dire
au bouton « Importer (Excel) » du module Exigences. Je mesure **à l'instant exact où l'écran
annonce le succès** :

```
ce que l’écran annonce (alert)       : { importes: 250, ignores: 0 }
POST /api/entites/exigences émis     : 222   (222 réponses 201, aucune erreur)
EXIGENCES RÉELLEMENT EN BASE         : 223   (222 + la ligne du semis)
état de synchronisation              : { enAttente: true, enCours: false,
                                         incidents: 0, bloques: 0 }
bandeau affiché                      : ""            ← rien
erreurs de console                   : []            ← rien
```

**Rien ne repart tout seul.** Le sondage tourne toutes les 20 s ; il ne pousse pas ce qui
attend. Rejoué avec deux cycles complets de sondage :

```
en base après +0 ms      : 238    enAttente: true
en base après +25 000 ms : 238    enAttente: true
en base après +50 000 ms : 238    enAttente: true
puis UNE saisie ordinaire de l’utilisateur → 252   (tout part d’un coup)
```

**Le même défaut sur le geste le plus central du produit.** L'import CSV des réponses
AirCyber, joué par la boucle réelle de `referentiels.js` (`upsertEvaluation` sur les
234 questions) :

```
réponses importées (annoncé)   : 234
DataStore.flush() rend         : { ok: true, quota: false }
ÉVALUATIONS EN BASE            : 222        ← 13 manquantes
état                           : enAttente true, incidents 0, bandeau vide
en base 4 s plus tard          : 222
```

Un score de conformité AirCyber calculé sur 222 réponses au lieu de 234 est faux — et c'est
la valeur que le client destine à la preuve d'audit.

**La cause, isolée jusqu'au mécanisme.** Elle tient en deux lignes qui ne se connaissent pas :

1. `js/core/ui.js` — `genId(prefix)` rend `prefix + "-" + Date.now() + "-" +
   Math.floor(Math.random() * 1000)`. **Mille valeurs.** Sur une boucle d'import, `Date.now()`
   ne bouge pas d'une itération à l'autre : mesuré dans le navigateur,
   **22 identifiants en double sur 234** tirages consécutifs. Le générateur interne
   d'`upsertEvaluation` (`"EVAL-" + Date.now() + "-" + Math.floor(Math.random()*1000)`) fait
   **29 doublons sur 234**. `importExcel.js` en a un troisième, de la même forme.
2. `js/core/sync.js` — `ordonnerCreations()` indexe le lot dans une `Map` **clé = identifiant**
   (`restantes.set(item.id, …)`). Deux créations au même identifiant s'effondrent en une : la
   seconde n'est jamais rendue, donc **jamais écrite**. Le cas minimal, rejoué :

```
DataStore.addRisque({ id: 'RISK-DUP', nom: 'A' })
DataStore.addRisque({ id: 'RISK-DUP', nom: 'B' })
await Sync.pousser()   → { ok: true, echecs: 0 }
POST émis              : 1
```

Instrumenté sur l'import de 250 lignes : `Api.creer` est appelé **227 fois** pendant le cycle
de l'import, qui rend pourtant `{ok: true, echecs: 0}`. Un second cycle en ajoute 21, un
troisième les derniers.

**Pourquoi personne ne le voit.** `rendreBandeau()` n'affiche quelque chose que si
`incidents.length > 0 || bloques.size > 0 || panneReseau || champsRefuses.size > 0`. Un lot
simplement **en attente** ne remplit aucune de ces conditions. Le seul endroit du produit qui
mentionne l'état est l'écran Paramètres, et il annonce **« Modifications en attente : en cours
d'envoi »** alors que `enCours` vaut faux et que rien ne partira (voir T-11). Le filet
`beforeunload` avertit — il lit `aDesModificationsEnAttente()` — mais il pousse en
« au mieux » : si l'utilisateur confirme la fermeture, le cycle n'a pas le temps d'aboutir.

**Pourquoi bloquant.** Exigence n°1 du cadrage : « Aucune perte » (`PLAN_SERVEUR` §0.1).
L'import est le **critère décisif** du client (`CLAUDE.md` §8). Corriger maintenant coûte une
ligne — porter l'espace aléatoire de `genId` (et de ses deux clones) à un ordre de grandeur
qui tienne un lot, et indexer `ordonnerCreations` sur le rang plutôt que sur l'identifiant.
Après la mise en service, un registre d'exigences ou un questionnaire AirCyber amputé de 5 à
10 % de ses lignes est **rigoureusement indiscernable** d'un registre inachevé : rien ne le
trace (S3, L5 non livré), et l'utilisateur a vu « 250 importées ».

**Ce que ce constat dit du dispositif.** `js/services/importExcel.js` est le **seul** service
du frontend qui n'a pas été touché par la vague 2 : son `_finish` parle encore de « stockage
saturé » et de quota du navigateur, notions retirées par la bascule. Le chemin qui perd des
lignes est précisément celui que personne n'a rouvert.

---

### 6.2 Majeurs

---

#### **T-2 — La ré-émission d'identifiant fabrique un jumeau silencieux, et réoriente les références vers lui**

Le remède au constat N-1 est bon dans son principe : plutôt que de refuser (ce qui répondrait
« cet identifiant existe »), le serveur **ré-émet** l'identifiant et réécrit les références de
la charge. Les deux issues deviennent indistinguables, et je l'ai vérifié.

Il traite en revanche de la même façon un cas qui n'a rien à voir : **le fichier porte deux
fois le même identifiant**. Rejoué :

```
POST /api/reprise  { risques: [ {id:'RISK-DBL', nom:'premier'},
                                {id:'RISK-DBL', nom:'second'} ],
                     actions: [ {id:'ACT-DBL', risque_id:'RISK-DBL'} ] }
→ 200   crees: { risques: 2, actions: 1 }

en base : RISK-DBL                     :: premier
          RISK-1788234387233-592423    :: second        ← un jumeau, identifiant du serveur
action  : ACT-DBL.risque_id = RISK-1788234387233-592423 ← elle vise le JUMEAU
```

Avant le remède, la clé primaire refusait le second et la reprise entière était annulée :
l'utilisateur voyait un refus. Maintenant il voit un succès, la base porte un enregistrement
de plus que son fichier, et **la référence pointe le mauvais des deux**.

**Le pré-analyseur le dit — et il dit désormais faux.** Le module de reprise émet bien
l'anomalie `identifiant-duplique`, avec ce texte :

> `risques : l'identifiant « RISK-D » apparaît plusieurs fois. La clé primaire refusera le
> doublon ; l'import doit trancher avant insertion.`

La clé primaire ne refuse plus rien, et l'import ne tranche pas. C'est le motif du chantier
dans sa forme la plus nette : **le remède a rendu fausse la phrase d'un autre fichier.**

**Et le cas se multiplie à chaque reprise.** Quand un identifiant du fichier est pris par une
filiale invisible, chaque nouvelle reprise du même contenu crée un jumeau de plus :

```
reprise c1.json → crees 1     reprise c2.json → crees 1     reprise c3.json → crees 1
en base : trois lignes « clone », trois identifiants différents
```

La fusion cesse donc d'être idempotente exactement dans le cas où elle en aurait le plus
besoin.

**Pourquoi majeur et non bloquant** : il faut un fichier portant déjà un doublon
d'identifiant. Mais ce fichier existe : c'est un export produit par la version locale, dont
le générateur d'identifiants est **celui de T-1** — mille valeurs par milliseconde. Les deux
constats ont la même racine, et la corriger les ferme tous les deux.

**Remède** : dans `appliquerReprise`, tenir le compte des identifiants déjà écrits dans la
passe et refuser (ou fusionner) le second, au lieu de le renommer. La ré-émission doit rester
réservée au cas qu'elle vise — un identifiant pris **hors du fichier**.

---

#### **T-3 — `POST /api/reprise` travaille avant la barrière fail-closed**

Le constat N-6 a fermé `/api/modele`, qui répondait 200 là où les autres routes répondent 503.
La même faille subsiste sur la route la plus chère du produit, sous une autre forme : le
travail a lieu **avant** le refus.

`src/api/index.ts`, route `/api/reprise` : `reprendreExport(fichier.contenu, …)` est appelé en
premier ; `enEcriture(...)` — donc `resolveur.resoudre()`, donc la barrière — vient après.
Rejoué sur un serveur monté en `production` :

```
fichier VALIDE, 1 enregistrement                → 503 indisponible
fichier INVALIDE                                → 400 donnee_invalide
                                                  « Fichier non reconnu : ni enveloppe
                                                    grc-backup, ni ancien instantané… »
fichier de 4 588 Ko, 20 000 enregistrements     → 503, après 139 ms
GET /api/donnees (pour comparaison)             → 503, après 1 ms
```

Trois conséquences, toutes acquises sans la moindre authentification :

1. **139 ms de calcul bloquant par requête** sur un fichier de 4,5 Mo — soit, à la borne de
   20 Mo que la route admet, de l'ordre d'une demi-seconde d'événement bloqué. Node est
   mono-fil : quelques requêtes simultanées suffisent à figer le service, y compris
   `/api/sante`. Il n'y a **ni authentification ni limitation de rythme** (S11, lot L3).
2. **Une divulgation, petite mais réelle** : le code de retour distingue « ceci est un
   `grc-backup` exploitable » (503) de « ceci n'en est pas un » (400). Un appelant apprend
   donc, sur un serveur qui refuse tout le reste, si un fichier qu'il détient est un export du
   produit.
3. Le principe que la route énonce elle-même — *« une route vérifie un droit, elle ne se
   l'accorde pas »* — est respecté sur l'écriture, mais pas sur le **coût**.

**Remède** : une ligne d'ordre. Appeler `resolveur.resoudre()` (ou entrer dans `enEcriture`)
**avant** `reprendreExport`. Le lot L3 devra en outre couvrir cette route en priorité pour la
limitation de rythme.

---

#### **T-4 — Un fichier `grc-backup` ne peut être repris qu'une seule fois, définitivement**

`PLAN_SERVEUR` §2.6 fait de l'export `grc-backup` **le** format d'échange : reprise d'une
filiale, et remise de ses données à une filiale qui sort du groupe. L'écran Paramètres propose
« Fusionner » et « Remplacer tout ».

Le schéma porte `uq_imports_idempotence (filiale_id, entite, cle_idempotence) where statut =
'applique'`, et la route inscrit `entite = 'toutes'` et l'empreinte SHA-256 du **contenu du
fichier**. Conséquence : un fichier donné ne peut être appliqué à une filiale **qu'une fois,
pour toujours, quel que soit le mode**. Rejoué à l'octet près :

```
import 1 du même fichier    → 200
import 2 du même fichier    → 409 contrainte_base
import 3 du même fichier    → 409 contrainte_base
le MÊME fichier en « remplacer » → 409 contrainte_base
```

Et par le chemin du produit, dans le navigateur : après un « Fusionner », le « Remplacer tout »
avec le même fichier rend

> « Ce fichier a déjà été importé dans cette filiale. Rien n'a été modifié. Pour le
> réappliquer, demandez à votre exploitant de lever la trace de l'import précédent. »

Trois gestes ordinaires deviennent impossibles sans intervention de l'exploitant :

* fusionner pour voir, puis remplacer ;
* restaurer deux fois la même sauvegarde (le geste même de la reprise après incident) ;
* reprendre le fichier remis par une filiale qui sort du groupe, si on l'a déjà essayé.

**Ce n'est pas ce que le cadrage demande.** L'idempotence figure au `PLAN_SERVEUR` §7 comme
exigence du **lot L7** (« aperçu, transactionnel, idempotent »), et le sens usuel d'une clé
d'idempotence est « rejouer la même requête ne double pas l'effet », non « ce fichier est
consommé ». Or la reprise est déjà idempotente **par construction** : elle met à jour ce
qu'elle retrouve (vérifié : deuxième import d'un contenu équivalent → `crees: 0`).

**Remède, à arbitrer par SCHEMA et API ensemble** : borner l'unicité à une fenêtre de temps,
la porter sur (fichier, mode), ou l'abandonner puisque la reprise converge d'elle-même. À
défaut, offrir dans le produit le moyen de lever la trace — la phrase actuelle renvoie
l'utilisateur à quelqu'un d'autre.

---

#### **T-5 — Le plan de renommage n'est pas cloisonné par entité**

`appliquerReprise` tient **une seule** table de renommage, `Map<ancien, nouveau>`, partagée par
les vingt et une collections, et `appliquerRenommages` réécrit toute colonne de référence dont
la valeur y figure. Or `verifierIdentifiant` admet délibérément les identifiants anciens —
« sans suffixe aléatoire, sans préfixe » (`CONVENTIONS.md` §2, et un test du dépôt le
revendique). Deux entités d'un même export ancien peuvent donc porter le même identifiant.

Rejoué : la filiale voisine occupe l'identifiant `7` pour un risque ; le fichier apporte un
risque `7`, une exigence `7`, et une action qui vise **l'exigence** `7`.

```
POST /api/reprise → 409 contrainte_base
  « Opération refusée : l'enregistrement est encore référencé ailleurs, ou il désigne un
    élément qui n'existe pas dans votre périmètre. Déliez-le d'abord, ou — s'il s'agit d'un
    contrôle du socle commun — archivez-le au lieu de le supprimer. »
en base : rien. La reprise entière est refusée.
```

Ce qui s'est passé : le risque `7` a été renommé (il est pris ailleurs), le plan a enregistré
`7 → RISK-…`, et l'`exigence_id` de l'action — qui visait l'exigence `7`, restée `7` — a été
réécrit vers l'identifiant du **risque**. La clé étrangère refuse, et le message reproche à
l'utilisateur de ne pas avoir « délié » quelque chose.

**Pourquoi majeur** : le chemin touché est celui de la migration des vingt filiales depuis la
version locale, c'est-à-dire le moment où l'on ne veut pas d'un refus incompréhensible. Le
remède est d'une ligne : **clé du plan = entité + identifiant**, comme
`colonnesDeReference` l'est déjà.

---

### 6.3 Mineurs

| # | Constat |
|---|---|
| **T-6** | **`id` glissé dans `champs` est silencieusement ignoré.** `src/api/index.ts` explique longuement pourquoi `id` est *déclaré pour être refusé* — « une propriété simplement absente du schéma serait retirée en silence, et un client qui continue d'envoyer son identifiant ne l'apprendrait jamais ». Le garde ne vaut qu'au niveau de l'enveloppe : `{champs:{nom:'x', id:'RISK-CHOISI'}}` rend **201** et un identifiant du serveur, sans un mot. Un champ inconnu (`zzz`), lui, est refusé bruyamment. Aucune conséquence de sécurité — le verdict est le même que l'identifiant soit pris ou libre — mais c'est le seul champ traité en silence, et c'est celui du constat M-3. |
| **T-7** | **`valeursEquivalentes` n'est l'inverse de `versLeFrontend` que pour texte et date.** Le correctif N-4 définit le vide « comme il est rendu là-bas » — mais seulement pour ces deux familles. `convertirPourLaBase`, lui, convertit `''` en `NULL` pour **toutes** les familles non textuelles. Une valeur `''` proposée sur une colonne booléenne, entière, numérique ou d'horodatage est donc encore tenue pour un changement. Vérifié sur une entité de niveau Groupe : `aide` (texte, `NULL`) renvoyée à `''` → 200 ; `_deleted` (booléen) renvoyé à `''` → **403 hors_perimetre**. Le navigateur ne produit pas ce cas aujourd'hui ; le lot L2 livre une **API**, et L3/L4 le rencontreront. |
| **T-8** | **Deux octets NUL dans `backend/src/reprise/index.ts`** (positions 59 446 et 59 723, employés comme séparateur de jointure). `grep` déclare le fichier binaire et **n'y trouve plus une seule ligne** — je l'ai constaté en le cherchant. Dans un chantier dont plusieurs garanties sont annoncées « vérifiables en trois `grep` », un fichier de 2 026 lignes invisible à cet outil est un angle mort d'outillage. Les balayages du banc lisent par `readFileSync` et ne sont pas affectés ; la revue humaine et `git diff`, si. Remède : écrire le caractère nul en séquence d'échappement. |
| **T-9** | **L'oracle d'existence subsiste hors aperçu, à un coût plus élevé.** En `apercu:true`, le bilan est indistinct — c'est acquis. Hors aperçu, une reprise « fusionner » d'un enregistrement portant l'identifiant sondé, suivie d'un `GET /api/donnees`, dit si l'identifiant a été ré-émis, donc s'il était pris ailleurs. Le coût passe de « une requête, aucune trace » à « deux requêtes, une ligne dans `imports`, une ligne à supprimer ». S'y ajoute un écart de **temps** mesurable (médiane 9,1 ms contre 7,0 ms sur un identifiant libre, l'insertion étant tentée deux fois). Réduit, pas supprimé — et le dire vaut mieux que de l'appeler fermé. |
| **T-10** | **Deux messages désignent toujours la mauvaise cause** (N-5 et N-8, non fermés). Une reprise portant une référence morte rend « cet enregistrement, ou l'un des éléments qu'il désigne, n'existe pas dans votre périmètre — ou sort de la filiale où vous travaillez » : la cause est un fichier incohérent, le message envoie chercher un problème de droits. Et `applyImport` traduit encore **tout** `contrainte_base` par « Ce fichier a déjà été importé dans cette filiale » — donc aussi un `23503`. Les deux messages se rencontrent sur le même chemin, et se contredisent. |
| **T-11** | **L'écran Paramètres dit « en cours d'envoi » quand rien ne part.** `settings.js` affiche `info.enAttente ? (incidents ? "N refusée(s)" : "en cours d'envoi") : "Tout est enregistré"`. Dans l'état de T-1 — `enAttente: true`, `enCours: false`, `incidents: 0` — la seule information du produit sur un lot non écrit affirme qu'il est en vol. Corriger cette phrase est le minimum même si T-1 est corrigé par ailleurs. |
| **T-12** | **§5 point 6 — la documentation reste en retard, pour la troisième fois.** `backend/README.md` §8 affiche toujours « L2 — API et bascule de la persistance \| ⬜ à faire (vague 2) », `CHANGELOG.md` ne porte aucune entrée de vague 2, et `docs/DATA_MODEL.md` n'a pas bougé. La porte est donc jouée, une fois de plus, sur un lot dont l'état documenté est antérieur à la vague. Signalé au premier passage, au second, et ici. |
| **T-13** | **§5 point 7 — périmètre.** `cyber-gouvernance_V4/index.html` (**277 lignes modifiées**) n'appartient toujours à aucun rôle du §2 : c'est la lacune que le constat m-6 de S1 avait nommée, et qui a survécu à trois portes. `backend/.env.example`, lui, n'a plus bougé. Et un fichier du périmètre FRONT/MODULES a été **oublié** : `js/services/importExcel.js` n'a reçu aucune adaptation à la bascule — c'est là que vit T-1. |
| **T-14** | **Toujours aucun cassage de cache** (N-11). `index.html` charge **59 `<script>`, dont aucun ne porte de jeton de version**, sous `ExpiresByType application/javascript "access plus 7 days"`. Le lot L2 fait du client et du serveur un contrat ; après une montée de version, un poste peut faire tourner l'ancien `sync.js` contre la nouvelle API pendant sept jours — et **aucun correctif de ce rapport n'atteindrait ses utilisateurs dans ce délai**, T-1 compris. |

### 6.4 Ce que j'ai cherché et n'ai pas trouvé

Pour que le prochain passage ne repasse pas à l'identique :

* **une valeur cliente atteignant un réglage de session** — entêtes, cookie, paramètre d'URL,
  corps, sur `GET`, `POST`, `PUT`, `DELETE` et `/api/reprise` ;
* **une injection** par nom d'entité, nom de champ, identifiant, ou pollution de prototype ;
* **un oracle par le nouveau contrat « ce qui ne change rien n'exige pas le droit d'écrire »**
  — j'ai cherché à sonder le contenu d'une ligne illisible en comparant 200 et 403 : la
  lecture étant vide, l'écriture part et le diagnostic rend le **même 404** ;
* **une élévation par la ré-émission d'identifiant** : elle ne franchit ni la RLS, ni la
  frontière de filiale, et le bilan ne la révèle pas ;
* **un écrasement silencieux** sur l'une ou l'autre moitié de l'entité scindée ;
* **un état intermédiaire observable** après un échec de reprise, un aperçu, une propagation ;
* **une écriture de colonne de traçabilité ou réservée** (`version`, `cree_par`, `modifie_le`,
  `filiale_id`), y compris par le chemin de reprise ;
* **un secret** dans une réponse, un journal ou le dépôt ;
* **une régression de la CSP** : cinq sessions de navigateur, quatre modules pilotés par leurs
  vrais boutons, un import Excel réel — 0 violation, 0 erreur de script.

---

## 7. L'état du banc d'essai — mord-il ?

**Réponse courte : il mord fort sur le serveur, et il ne regarde pas là où le produit perd des
données.**

### Ce qui mord, et que j'ai vérifié

* **490 tests, dont 22 de navigateur** contre le serveur réel sous la CSP réelle : la
  couverture reprochée au premier passage est comblée.
* Le **verrou de la mise en œuvre** a désormais son propre fichier (331 lignes) — c'était le
  premier des deux trous du passage précédent.
* Le **garde-fou du socle Groupe** n'est plus une propriété du banc mais une propriété de la
  base : je l'ai contournée en retirant l'application du chemin, et la RLS a refusé
  (`42501`). C'était le second trou ; il est fermé par le bas, ce qui vaut mieux.
* Les **deux garde-fous de schéma** font échouer leur chemin : code de sortie 7 pour
  `migrate.mjs`, refus de démarrage pour le registre. Sabotages joués par moi.

### Ce qui ne mord pas

Un seul trou, et il est exactement celui de T-1 : **aucun test ne recompte ce qui est arrivé
en base après un geste de masse.**

`bascule.test.mjs` joue le geste complet « créer, voir, sélectionner, supprimer » — sur **un**
enregistrement — et vérifie la base. C'est excellent, et cela ne voit pas T-1 : le défaut
n'apparaît qu'à partir de deux créations dans le même cycle. Il suffirait d'un test :

> importer N lignes par le service réel, puis affirmer que la base en contient N — **sans
> pousser une seconde fois**.

Un tel test aurait aussi attrapé la collision d'identifiants, donc T-2.

Deux autres absences, moins graves : rien n'exerce `POST /api/reprise` en environnement
`production` (T-3 serait tombé), et rien ne relit un fichier `grc-backup` **deux fois** (T-4
serait tombé).

---

## 8. Ce que la grille ne couvre pas

* **Elle ne demande toujours pas de compter.** S18 exige que les gestes « aboutissent, et ne
  détruisent rien ». Les trois passages l'ont lu comme « le geste ne plante pas ». T-1 aboutit,
  ne plante pas, ne détruit rien de ce qui existait — et perd 9 % de ce qu'on lui confie. Je
  propose que S18 soit lu, désormais, comme : *ce que l'écran annonce est ce que la base
  contient*.
* **Elle ne remplace pas le test d'intrusion** prévu en L15, et ne protège ni contre un `root`
  sur la VM, ni contre le propriétaire de la base (`CONVENTIONS.md` §12).
* **Elle ne dit rien de la disponibilité du service** au sens de l'exploitation : sauvegardes,
  restauration, montée de version. T-14 (aucun cassage de cache) en est le symptôme.
* **Elle ne dit rien de l'ergonomie du refus.** T-4 et T-10 sont des messages qui renvoient
  l'utilisateur vers quelqu'un d'autre, ou vers la mauvaise cause. Aucun contrôle ne les
  attrape.

---

## 9. Ce que je n'ai pas pu vérifier

* **Apache**, donc les en-têtes réellement servis, la CSP réellement appliquée par le vhost,
  et la redirection TLS. J'ai extrait la CSP du fichier de configuration et l'ai appliquée
  moi-même ; ce n'est pas Apache qui l'a posée.
* **Debian 13** et **PostgreSQL 17** : tout a été joué sur **PostgreSQL 16.13**. La cible est
  17, et aucune fonctionnalité postérieure à 16 n'est employée à ma connaissance.
* **L'Active Directory**, **ClamAV**, **le relais SMTP** : hors périmètre du lot, et absents
  de la machine.
* **La montée en charge réelle** : mes mesures de coût (139 ms pour 4,5 Mo, ~8 ms par
  création) sont locales, sans latence de VPN. Sur le lien réel, le cycle d'écriture d'un
  import de 250 lignes durera nettement plus longtemps — ce qui **élargit** la fenêtre de T-1.
* **M-7 et N-10**, que j'ai vérifiés par lecture et non rejoués.
* **La validation du découpage Groupe/Filiale par le RSSI groupe** (risque P5) : toujours
  aucune trace dans le dépôt, et toujours attendue avant la mise en service pilote.

---

## 10. Ce qu'il faut faire, et quand

| # | Constat | Échéance |
|---|---|---|
| **T-1** | Import en lot : lignes perdues en silence | **avant de rejouer la porte.** Élargir l'espace aléatoire des trois générateurs d'identifiants, indexer `ordonnerCreations` sur le rang, et **ajouter le test qui recompte en base après un import de N lignes** — sans le test, le correctif ne compte pas |
| **T-2** | Jumeau silencieux à la reprise | **avant de rejouer la porte** — même racine que T-1, et le pré-analyseur affirme aujourd'hui le contraire de ce que le code fait |
| **T-3** | `/api/reprise` travaille avant le fail-closed | **avant de rejouer la porte** : une ligne d'ordre. La limitation de rythme de cette route revient à **L3** |
| **T-4** | Un fichier ne peut être repris qu'une fois | **avant la mise en service pilote** — arbitrage SCHEMA + API |
| **T-5** | Plan de renommage non cloisonné par entité | **avant la mise en service pilote** (chemin de migration des vingt filiales) |
| **T-6, T-7, T-11** | Contrat annoncé ≠ code | **vague 3** |
| **T-8** | Octets NUL dans une source | **vague 3** |
| **T-9, T-10** | Oracle résiduel, messages trompeurs | **vague 3**, avec le modèle de droits (L3) |
| **T-12, T-13** | Documentation et périmètre | **à la fermeture de la porte** — c'est la troisième fois qu'on le signale |
| **T-14** | Aucun cassage de cache | **L15 au plus tard**, mais à décider **avant** la première montée de version |

---

## 11. Ce qui est solide, et qu'il faut dire

Un rapport qui refuse une porte doit aussi dire ce qu'il n'a pas réussi à casser, sans quoi il
laisse croire que tout est fragile.

* **Le cloisonnement tient de bout en bout.** 106 contrôles au vert, et une dizaine d'attaques
  par entête, cookie, URL et corps qui ne bougent rien. La propriété est tenue par la **forme**
  (`resoudre()` sans argument, `avecTransaction` unique ouverture) et non par la discipline.
* **La barrière du socle Groupe est descendue au bon étage.** Elle est dans la RLS ; le
  contrôle applicatif au-dessus est une défense en profondeur. C'est la première fois de ce
  chantier qu'un correctif migre du code vers le schéma, et c'est la bonne direction.
* **Le verrouillage optimiste couvre les deux moitiés de l'entité scindée**, y compris le
  chemin muet que M-2 avait trouvé, et il a désormais son fichier de test.
* **Les opérations composites sont réellement tout-ou-rien**, aperçu compris — et l'aperçu ne
  laisse pas même une ligne de trace.
* **Le diagnostic à trois causes** est resté juste sous toutes mes sondes : la même phrase, le
  même code, le même statut pour « absente », « hors périmètre » et « valeur exacte d'une
  ligne voisine ».
* **La façade synchrone est intacte** : aucun module métier n'a été réécrit, et 490 tests le
  disent.

Le lot est proche. Il lui manque de compter ses lignes.
