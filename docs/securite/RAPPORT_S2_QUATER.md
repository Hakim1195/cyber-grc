# Porte de sécurité S2 (4ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-QUATER**, agent indépendant. Je n'ai écrit aucune des lignes
> examinées, ni aucun des trois rapports précédents. Travail en **lecture seule** sur le
> dépôt : le seul fichier que je crée est celui-ci, et `git status --porcelain` est resté
> vide du début à la fin.
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, révision
> examinée **`a4116b6`** (« Le banc mord partout, et un essai capricieux qui n'accusait pas
> le bon coupable »).
>
> Référence : `docs/PLAN_EXECUTION.md` §4 (les **dix-huit** contrôles) et §5 ;
> `backend/db/CONVENTIONS.md` §15 à §21 ; `docs/PLAN_SERVEUR.md` §0.1, §1.3, §1.4, §1.6,
> §1.9, §1.10, §2.4, §2.6, §5, §7 ; les rapports `RAPPORT_S2.md`, `RAPPORT_S2_BIS.md` et
> `RAPPORT_S2_TER.md`.
>
> Date : 01/09/2026.

---

## 1. Verdict

> ### ✅ **PORTE FRANCHIE** — 0 bloquant, 4 majeurs, 7 mineurs. **Aucun des dix-huit contrôles n'est en échec.**

Deux contrôles sont **passés avec une réserve écrite** (S13, S17) : une réserve n'est pas un
échec, et les deux réserves sont exactement celles que les trois passages précédents ont
posées — elles tiennent à la machine de développement, pas au code.

**Le bloquant du troisième passage est fermé, et il l'est deux fois.** J'ai rejoué l'import
qui perdait des lignes, par ses trois chemins réels, en comptant en base :

```
import Excel de 250 exigences  → écran « 250 importées »  → EN BASE : 250   (attendu 250)
boucle AirCyber, 234 réponses  → écran « 234 »            → EN BASE : 234   (attendu 234)
import « Analyse » de 120 risques par son vrai bouton     → EN BASE : 120   (attendu 120)
```

Et surtout — c'est le point qui distingue un correctif d'un pansement — **la seconde barrière
tient sans la première**. En sabotant le générateur d'identifiants du navigateur pour qu'il ne
rende plus que **trois** valeurs (40 créations, **6 identifiants distincts**), les **40 lignes
arrivent quand même en base**, et le produit affiche « Identifiants en double détectés ».
L'ancienne `Map` indexée par identifiant en aurait effondré 34. La propriété est désormais
tenue par la **forme** — un tableau indexé par rang ne perd rien, quoi qu'on lui donne — et
non par la qualité du hasard.

**Ce que je reproche au lot, et qui ne suffit pas à le refuser.** Le motif du chantier — *le
remède crée son propre chemin* — s'est vérifié une septième fois, et deux fois sur ce
passage-ci :

| # | Constat | Gravité |
|---|---|---|
| **Q-1** | **Le générateur d'identifiants corrigé, gardé et démontré n'est pas celui qui écrit.** `f_generer_id()` est passé de mille valeurs à 122 bits, a reçu un garde-fou de schéma, un contrôle de cloisonnement et deux tests de volume — et n'est employé, dans tout le schéma, que par `journal_audit.id`, table que le lot L2 n'écrit jamais. Tout identifiant réellement écrit vient de `engendrerIdentifiant()` en TypeScript : **un million de valeurs**, sans garde-fou | 🟠 majeur |
| **Q-2** | **La ré-émission d'identifiant n'est pas idempotente, et le correctif T-4 lui a ouvert le chemin.** Reprendre trois fois la même sauvegarde crée **trois clones** d'un enregistrement dont l'identifiant est occupé par une filiale invisible, et réoriente la référence vers le dernier. Avant T-4, l'unicité d'idempotence interdisait la seconde reprise ; elle ne l'interdit plus | 🟠 majeur |
| **Q-3** | **La moitié navigateur du correctif T-1 n'a aucun test.** Le rapport TER en faisait une condition explicite (« sans le test, le correctif ne compte pas »). Cinq comportements neufs — entropie de `UI.genId`, indexation par rang, canari de doublons, signalement de rétrécissement, sondage qui pousse — ne sont exercés par aucune des 505 assertions | 🟠 majeur |
| **Q-4** | **§5 point 6 — la documentation reste antérieure à la vague, pour la quatrième fois.** `backend/README.md` §8 : « L2 — API et bascule de la persistance ⬜ à faire (vague 2) ». `CHANGELOG.md` : « La bascule de la persistance de la SPA **n'est pas commencée** » | 🟠 majeur |

Aucun de ces quatre ne satisfait le critère de blocage retenu depuis le début du chantier —
*un défaut est bloquant si le corriger maintenant coûte peu et le corriger après la mise en
service exige de réparer des données qu'on ne pourra plus distinguer des légitimes.* Q-1 ne
perd aucune ligne en silence (une collision y est un refus bruyant, et je dis pourquoi
plus bas) ; Q-2 laisse une trace dans `imports` et des doublons comparables au contenu ;
Q-3 et Q-4 sont des manquements à la définition de « terminé », pas des défauts du produit.
Ils ont tous une échéance, elle est au §10.

**Ce qu'il faut dire avant le reste.** Le serveur est solide et je n'ai pas réussi à le
casser : cloisonnement au vert sur 107 contrôles, aucune valeur du navigateur n'atteint un
réglage de session, aucune injection, verrouillage optimiste effectif de bout en bout — deux
navigateurs réels, Alice écrit, Bob reçoit `GRC03`, sa saisie reste à l'écran et le travail
d'Alice survit. Les quatre correctifs livrés depuis le troisième passage (T-1 à T-5, T-10,
T-14) font ce qu'ils annoncent, et j'ai éprouvé chacun par son propre sabotage.

---

## 2. Comment cette porte a été jouée

Rien ici ne repose sur la lecture seule du code, ni sur la démonstration de quelqu'un
d'autre. Tout ce que j'affirme, je l'ai rejoué.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2q`**, neuve (`db/dev/preparer_base_dev.sh --recreer`, 4 migrations, garde-fous : aucune anomalie), **`grc_audit_s2q_sab`** pour les sabotages de schéma, plus une douzaine de bases jetables ouvertes par `ouvrirBaseEssai` et purgées à la fin |
| Données | Deux filiales `FIL-ESSAI-A` / `FIL-ESSAI-B` à égalité + socle Groupe, semées par le compte applicatif sous périmètre ; et une filiale « bien remplie » de **12 000 enregistrements** pour mesurer le client au volume |
| Serveur | `construireServeur()` réel, monté une vingtaine de fois, en `developpement`, `recette` et `production` |
| Frontend | **L'arborescence RÉELLEMENT DÉPLOYÉE** : une copie du frontend passée dans `jeton_frontend()` et `injecter_jeton_frontend()` d'`install.sh`, servie sous la **CSP exacte** du vhost, ses **sept en-têtes `Header always set`** et sa **politique de cache** (`no-cache` sur `.html`, `max-age` long sur `.js`/`.css`) |
| Navigateur | Playwright / Chromium, **dix scénarios**, dont un import Excel réel de 250 lignes et un import de 120 risques par le bouton « Importer Analyse » |
| Sabotages | Générateur d'identifiants ramené à mille valeurs (base) puis à trois valeurs (navigateur) ; garde-fou de schéma supprimé, puis re-signé ; RLS désactivée ; colonne de traçabilité retirée ; colonne métier renommée ; balise `<script>` réécrite en apostrophes |

Ce que j'ai fait tourner avant de commencer, pour ne pas confondre un défaut avec un
environnement cassé :

```
$ npm run verifier-types                      → aucune erreur
$ npm test                                    → tests 505 · pass 505 · fail 0   (41,5 s)
$ node --test "test/navigateur/*.test.mjs"    → tests  23 · pass  23 · fail 0   (32,1 s)
$ npm audit --omit=dev                        → found 0 vulnerabilities
$ psql -f db/verifier_cloisonnement.sql       → 107 contrôles · 107 réussis · 0 échoué
$ git status --porcelain                      → (vide, avant et après)
```

Les scripts d'attaque sont restés dans le scratchpad de session ; **aucun n'a été versé au
dépôt**.

### Ce que j'ai vérifié de mon propre outillage avant d'accuser le code

Le chantier m'avait averti, et il avait raison : **trois fois** mon instrument a menti, et
deux de ces mensonges auraient produit un constat spectaculaire et faux.

* **« Le magasin `kv` de la base héritée a DISPARU »** — B-1 réouvert, en apparence. En
  réalité `ouvrirPage()` crée un **contexte de navigateur neuf**, donc un stockage isolé : la
  base que j'avais posée dans le premier contexte n'existait pas dans le second, et mon
  `indexedDB.open` en créait une vide. Rejoué **dans un seul contexte**, la base héritée
  survit intégralement (§3.1).
* **« La création par le DataStore échoue en 400 »** — c'était `m_maitrise: 2`, une valeur
  que le modèle EBIOS n'admet pas (le facteur de maîtrise vaut 0,05 à 1). Le serveur avait
  raison de refuser ; c'est mon jeu d'essai qui était faux.
* **« La filiale voisine n'occupe pas l'identifiant que je viens d'y écrire »** — j'avais
  passé `{ valider: true }` à `avecPerimetre`, dont l'option de validation s'appelle
  `{ annuler: false }`. Mon semis était donc annulé, et le scénario T-5 que je croyais jouer
  ne se jouait pas. Rejoué avec la bonne option, il se joue — et il passe.

---

## 3. Le sort des constats des trois passages

### 3.1 Les trois bloquants du premier passage — fermés, et rejoués par moi

| # | Constat | Sort | Ce que j'ai constaté moi-même |
|---|---|---|---|
| **B-1** | Ouvrir l'application détruisait la base héritée | ✅ **fermé** | Base `cyber-grc-db` fabriquée à la main, **un seul contexte de navigateur**. API coupée : écran de refus, base **intacte**. API rétablie : base **toujours intacte**, et la page propose « …reprenez-les dans cette filiale. » Contenu relu à l'identique aux trois temps |
| **B-2** | La croix « Masquer » éteignait la seule trace | ✅ **fermé** | Conflit fabriqué par un `fetch` tiers. Avant la croix : `{enAttente:true, incidents:1, bloques:1}`. **Après** : `{enAttente:true, incidents:0, bloques:1}`, bandeau « 1 enregistrement(s) non enregistré(s) — la saisie reste à l'écran mais n'est pas partie au serveur », et **`Tout est enregistré` n'apparaît nulle part** |
| **B-3** | L'import « Remplacer » détruisait la filiale hors transaction | ✅ **fermé** | `applyImport(…, 'replace')` par le chemin du produit : `{ok:true, transactionnel:true, supprimes:23}`, requêtes émises **`{POST:1, GET:1}` — zéro `DELETE`**, et le socle Groupe survit (`mesure_catalogue` et `documents` de portée Groupe toujours à 1) |

### 3.2 Les cinq constats du troisième passage — quatre fermés, un partiellement

| # | Constat | Sort | Preuve que j'ai rejouée |
|---|---|---|---|
| **T-1** | Import en lot perdant des lignes en silence | ✅ **fermé, et par deux barrières indépendantes** | 250/250, 234/234, 120/120 comptés **en base** ; `UI.genId` : 250 tirages → 250 distincts, 20 000 → 20 000 distincts (3 ms et 64 ms, sur 3 et 56 millisecondes distinctes) ; **barrière de rang éprouvée par sabotage** : générateur ramené à 3 valeurs, 6 identifiants distincts sur 40 créations, **40 lignes en base** + bandeau « Identifiants en double ». Et le troisième reproche de T-1 — « rien ne repart tout seul » — est fermé : une saisie laissée en attente **part au sondage suivant**, vérifiée en base |
| **T-2** | Jumeau silencieux sur un identifiant répété dans le fichier | ⚠️ **fermé pour le cas visé, ouvert pour l'autre moitié** | Fichier portant deux fois `RISK-DBL` → **400**, « Le fichier porte deux fois l'identifiant… Rien n'a été modifié », **rien en base**. Mais la multiplication à chaque reprise subsiste, et elle est désormais atteignable : voir **Q-2** |
| **T-3** | `/api/reprise` travaillait avant la barrière fail-closed | ✅ **fermé** | En `production` et en `recette` : fichier valide → **503 en 2,9 ms** ; fichier **invalide** → **503** (l'oracle de forme est fermé : c'était un 400 auparavant) ; fichier de 4 Mo / 20 000 enregistrements → 503. Le coût résiduel est celui de l'analyse de corps de Fastify, **identique sur une route ordinaire** (162 ms contre 158 ms pour `POST /api/entites/risques` au même volume) : ce n'est plus un surcoût propre à la reprise. Voir **Q-10** |
| **T-4** | Un fichier ne pouvait être repris qu'une fois | ✅ **fermé** | Le même fichier, à l'octet près : `fusionner` → 200 (1 création), `fusionner` → 200 (1 mise à jour), **`remplacer`** → 200, `fusionner` → 200. La reprise converge, rien n'est dupliqué, et l'empreinte reste écrite dans `imports.sha256` |
| **T-5** | Plan de renommage non cloisonné par entité | ✅ **fermé** | Filiale voisine occupant `7` pour un risque ; fichier apportant un risque `7`, une exigence `7` et une action visant **l'exigence** `7` → **200**. Le risque est ré-émis (`RISK-1788…-82051`), l'exigence garde `7`, et `action.exigence_id` vaut toujours `7` — la référence n'a pas migré vers le risque |

### 3.3 Les mineurs du troisième passage

| # | Sort | Ce que j'ai constaté |
|---|---|---|
| **T-6** | ✅ fermé | `{champs:{nom:'x', id:'RISK-B'}}` → **400** avec une phrase qui énonce la règle. Le champ n'est plus avalé en silence |
| **T-7** | ✅ fermé (par lecture ; **non observable** par l'API d'aujourd'hui) | `valeursEquivalentes` définit désormais le vide comme `null ∪ undefined ∪ ''` pour **toutes** les familles. Je n'ai trouvé, sur les entités de portée Groupe, **aucune colonne non textuelle nullable** exposée : le cas ne se produit pas encore par HTTP, ce que le rapport TER annonçait déjà |
| **T-8** | ✅ fermé | Balayage de `backend/src`, `backend/db`, `backend/test` et `cyber-gouvernance_V4/js` : **aucun fichier binaire pour `grep`**, aucun octet nul |
| **T-9** | ⚠️ **reporté à L3, et le report tient** — voir §6 | Mesuré : en aperçu, le bilan d'un identifiant **pris ailleurs** et celui d'un identifiant **libre** sont **strictement identiques** (même JSON, même statut, mêmes anomalies), l'écart n'étant que temporel (**médianes 14,23 ms contre 13,03 ms sur 60 sondes**, soit 1,2 ms) ; 120 aperçus ne laissent **aucune ligne** dans `imports`. Hors aperçu, le canal « reprendre puis relire » subsiste, au prix de deux requêtes et d'une trace |
| **T-10** | ✅ fermé | Référence morte → « **Reprise refusée** : le fichier renvoie vers un enregistrement qu'il n'apporte pas et qui n'est pas dans vos données. » Référence vers une ligne d'une filiale voisine → **exactement la même phrase** : la cause est dite sans que les deux cas se distinguent |
| **T-11** | ✅ fermé (par lecture) | `settings.js` distingue quatre états — « N refusée(s) », « serveur injoignable », « envoi en cours », « non enregistrées » — et s'abonne à `Sync.surChangementEtat` au lieu de photographier l'état au rendu |
| **T-12** | ❌ **toujours ouvert, 4ᵉ passage** | Voir **Q-4** |
| **T-13** | ✅ fermé côté plan | `PLAN_EXECUTION.md` §2 porte désormais un rôle **MODULES** (`js/modules/**`, `js/app.js`) et attribue `index.html` à **DÉPLOIEMENT**. `backend/.env.example` a bougé deux fois dans la vague, mais pour documenter `API_ADMINISTRATION_GROUPE_PROVISOIRE`, que `session.ts` lit réellement : la variable documentée et morte du constat m-2 n'existe plus |
| **T-14** | ✅ **fermé, et son garde-fou mord** | `jeton_frontend()` rend `0.1.0.3968eb30b7da` ; un octet changé dans `js/app.js` donne `0.1.0.868927a15cd2`. `injecter_jeton_frontend()` versionne **61 URL sur 61**, et dans un vrai navigateur **61 requêtes sur 61 portent `?v=`**. Sabotages : une balise écrite en apostrophes, puis une sans guillemets → **l'installation échoue**, avec le message qui dit quoi corriger |

### 3.4 Les constats des passages 1 et 2 restés ouverts au 3ᵉ

| # | Sort |
|---|---|
| **m-4** (le registre promettait plus qu'il n'attrape) | ✅ **fermé** — le §1 de `src/entites/index.ts` dit maintenant « il attrape des **noms et des formes**, et rien de plus : la disparition d'une colonne métier ordinaire lui échappe », en citant m-4 et le §17.5. J'ai vérifié les deux sens : `risques.nom` renommée → le serveur **démarre** (portée revendiquée) ; RLS retirée ou colonne `version` supprimée → **démarrage refusé** |
| **N-5 / N-8** (messages désignant la mauvaise cause) | ✅ fermés par T-10, rejoués ci-dessus |
| **N-11 / T-14** (aucun cassage de cache) | ✅ fermé |
| **N-12** (coût de la reprise, absence de frein) | ⚠️ **réduit, pas fermé** — voir **Q-9** |
| **N-15 / T-13** (périmètre) | ✅ fermé |
| **N-14 / T-12** (documentation) | ❌ **toujours ouvert** — voir **Q-4** |

---

## 4. La grille §4 — les dix-huit contrôles

Rappel de la règle : « sans objet » n'est jamais « passé ». Et pour lever toute ambiguïté de
lecture : **aucun contrôle ci-dessous n'est en échec**. Deux sont passés avec une réserve
nommée, ce qui est un passage.

| # | Contrôle | Statut |
|---|---|---|
| S1 | Cloisonnement par filiale non contournable | ✅ **passé** |
| S2 | Le périmètre ne vient jamais du navigateur | ✅ **passé** |
| S3 | Journal d'audit inaltérable et complet | ⬜ **sans objet** (L5) |
| S4 | Verrouillage optimiste effectif | ✅ **passé** |
| S5 | Aucune injection SQL | ✅ **passé** |
| S6 | Droits vérifiés côté serveur | ⬜ **sans objet** (L3) — la barrière provisoire couvre désormais **toutes** les routes |
| S7 | Le droit d'export est distinct de la lecture | ⬜ **sans objet** (L3) |
| S8 | Secrets | ✅ **passé** |
| S9 | Chaîne de contrôle des pièces jointes | ⬜ **sans objet** (L6) |
| S10 | Sortie et en-têtes | ✅ **passé** |
| S11 | Limitation du rythme et verrouillage | ⬜ **sans objet** (L3) |
| S12 | Les erreurs ne renseignent pas l'attaquant | ✅ **passé** (résidu T-9, reporté à L3 par écrit) |
| S13 | Dénis de service applicatifs | ⚠️ **passé avec réserve** (Q-9, Q-10) |
| S14 | Intégrité des opérations composites | ✅ **passé** |
| S15 | Dépendances | ✅ **passé** |
| S16 | Les garde-fous sont branchés | ✅ **passé** (résidu Q-5) |
| S17 | Le chemin complet a été parcouru pour de vrai | ⚠️ **passé avec réserve** (ni Apache, ni Debian 13, ni PostgreSQL 17 sur cette machine) |
| S18 | **Le produit fait ce qu'il doit faire** | ✅ **passé** |

---

### S1 — Cloisonnement par filiale non contournable ✅

`db/verifier_cloisonnement.sql` sur `grc_audit_s2q` : **107 contrôles, 107 réussis,
0 échoué**, sous la seule réserve documentée du contrôle **C22** (la lecture du journal
d'audit n'est pas cloisonnée — dérogation qu'impose le chaînage par empreinte, resserrement
ferme du lot L5).

*Ce que j'ai tenté :* depuis une session `FIL-ESSAI-A`, lire les données de `FIL-ESSAI-B` par
`GET /api/donnees`, par `GET /api/rafraichir`, par une lecture unitaire (`GET
…/risques/RISK-B` → 404), par une écriture ciblée (`PUT …/risques/RISK-B` → 404), par une
suppression (`DELETE …/risques/RISK-B?version=1` → 404), et par une reprise apportant une
référence vers `RISK2-B` (→ 409, message indistinct de celui d'une référence morte). Aucune
ligne de la filiale voisine n'a franchi la frontière, dans aucun sens.

Un contrôle que je signale parce qu'il est neuf et qu'il porte sur la vague : **C107 —
« Identifiants engendrés : 250 tirages d'un import, sur 4 milliseconde(s) → 250 distincts »**.
Il est juste, et il mesure `f_generer_id()` — c'est-à-dire, comme le dit **Q-1**, le
générateur que l'API n'appelle jamais.

---

### S2 — Le périmètre ne vient jamais du navigateur ✅

La propriété est tenue par la **signature** : `ResolveurPerimetre.resoudre()` ne prend aucun
argument, et aucune route ne construit `administrationGroupe`.

*Ce que j'ai tenté*, avec `FIL-ESSAI-B` comme cible, sur `GET /api/donnees` :

```
{"x-filiale-id":"FIL-ESSAI-B"}                                   200 · risques vus : RISK-A,RISK2-A
{"x-grc-filiale":"FIL-ESSAI-B"}                                  200 · risques vus : RISK-A,RISK2-A
{"cookie":"grc_filiale=FIL-ESSAI-B"}                             200 · risques vus : RISK-A,RISK2-A
{"x-forwarded-for":…,"x-grc-administration-groupe":"oui"}        200 · risques vus : RISK-A,RISK2-A
{"grc.filiale_id":"FIL-ESSAI-B"}                                 200 · risques vus : RISK-A,RISK2-A
{"authorization":"Bearer FIL-ESSAI-B"}                           200 · risques vus : RISK-A,RISK2-A
?filiale=…&filiale_id=…  (paramètres d'URL)                      200 · risques vus : RISK-A,RISK2-A
POST /api/entites/risques {champs:{filiale_id:"FIL-ESSAI-B"}}     400 donnee_invalide
POST /api/entites/risques {portee:"groupe"}                       403 hors_perimetre
```

Rien ne bouge. Le champ `filiale_id` n'est pas seulement ignoré : il est **refusé
bruyamment**, ce qui vaut mieux.

---

### S3 — Journal d'audit ⬜ sans objet (lot L5)

Aucune écriture de journal d'audit dans le lot L2, et le lot le dit lui-même. La conséquence
mérite d'être répétée à chaque passage : **tant que L5 n'est pas livré, aucun des gestes de
la vague 2 ne laisse de preuve** — ni une reprise « Remplacer » qui vide une filiale, ni un
import de 250 lignes. La seule trace d'une reprise est la ligne d'`imports`, et je l'ai
relue : elle porte le mode, la version d'origine, le nombre de lignes supprimées, de liaisons
et de champs sans destination. C'est une trace d'exploitation, pas une preuve d'audit.

---

### S4 — Verrouillage optimiste effectif ✅

*À l'API*, deux écritures concurrentes sur la même version : `200` et `409`. Le client ne peut
pas fixer `version` (`champs:{version:99}` → 400, « n'appartient pas à l'entité »).
`DELETE` sans `?version` → 400 ; avec une version fausse → 409 `conflit_version` / `GRC03`.

*Dans deux navigateurs réels*, ce qui n'avait jamais été rejoué de bout en bout :

```
Alice : updateRisque(…) puis Sync.pousser()   → en base : « Écrit par Alice »
Bob   : updateRisque(…) puis Sync.pousser()   → { ok: false, echecs: 1 }
        état  : { enAttente: true, incidents: 1, bloques: 1 }
        écran : « Modifié entre-temps — Risque « Écrit par Bob » : Cet enregistrement a été
                  modifié entre-temps par quelqu'un d'autre… »
        la saisie de Bob reste À L'ÉCRAN, et la base porte celle d'Alice
```

C'est le risque projet **P1**, et il est tenu : une écriture perdue est vue, dite, et la
saisie n'est pas effacée sous les doigts de son auteur.

---

### S5 — Aucune injection SQL ✅

Le nom d'entité reçu n'est **qu'une clé de registre**, jamais du SQL ; les noms de colonnes
viennent du catalogue PostgreSQL découvert ; toutes les valeurs sont paramétrées.

*Ce que j'ai tenté :* `risques; drop table risques`, `risques'--`, `RISQUES`, `pg_class`,
`../risques`, `risques%00` en nom d'entité → **400** dans tous les cas, dont deux refusés par
le motif du schéma avant même d'atteindre le code. En nom de champ :
`nom", version) values (1,1) --`, `__proto__`, `constructor`, `nom; drop table risques` →
**400**, et le message reformule le nom illisible en « inconnu » plutôt que de le réfléchir.
Pollution de prototype dans l'enveloppe (`{champs:{…}, __proto__:{pollue:1}}`) → 201 et
`Object.prototype.pollue === undefined`.

---

### S6 — Droits vérifiés côté serveur ⬜ sans objet (L3), barrière provisoire **désormais complète**

Il n'y a pas de modèle de droits : c'est le lot L3. La barrière provisoire est le refus
fail-closed hors `developpement`, et **c'est le point que le troisième passage avait trouvé
percé**. Mesuré sur `production` et `recette`, sur toutes les routes :

```
                     production            recette
GET  /api/sante        200                   200      (point de santé, à dessein)
GET  /api/session      503  1,7 ms           503
GET  /api/modele       503  0,7 ms           503
GET  /api/donnees      503  0,7 ms           503
GET  /api/rafraichir   503  1,1 ms           503
POST /api/entites/…    503  3,2 ms           503
POST /api/reprise      503  2,9 ms           503     ← le trou de T-3, fermé
POST /api/operations…  503  1,5 ms           503
```

Le seul trou nommé par le troisième passage est donc comblé, et le fichier **invalide**
reçoit lui aussi 503 : le code de retour ne distingue plus « ceci est un `grc-backup` » de
« ceci n'en est pas un ».

---

### S7 · S9 · S11 — ⬜ sans objet (L3, L6, L3)

Aucun droit d'export distinct, aucune chaîne de pièces jointes, aucune limitation de rythme
dans ce lot. **T-9 et Q-9 rendent l'absence de S11 coûteuse** : la route de reprise est la
plus chère du produit et n'a aucun frein. Le lot L3 devra la couvrir en priorité.

---

### S8 — Secrets ✅

`GET /api/sante` rend `{statut, application, version, environnement, heure,
duree_fonctionnement_s, base:{ok, latence_ms}}` — aucun secret, aucun nom d'objet de base.
`GET /api/session` rend l'identité, la filiale, le périmètre et une description honnête de
l'authentification provisoire. Aucun secret dans le dépôt (le mot de passe `dev` est celui
du poste de développement, et le script qui le pose refuse de tourner sous `NODE_ENV=production`).

---

### S10 — Sortie et en-têtes ✅

*Posés par le serveur*, sur toutes les réponses, y compris les 404 :

```
content-type: application/json; charset=utf-8   cache-control: no-store   x-content-type-options: nosniff
```

*Posés par le vhost*, et servis tels quels au navigateur pendant mes essais :
`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
`Permissions-Policy`, et la CSP `default-src 'self'; script-src 'self'; …; frame-ancestors
'none'; base-uri 'self'; form-action 'self'`.

*Ce que j'ai tenté :* servir l'arborescence **déployée** (index.html versionné) sous cette CSP
et ces en-têtes, ouvrir les **25 routes du menu**, créer un risque par son formulaire, cliquer
une ligne, modifier depuis la fiche, supprimer par sélection, importer 120 lignes par le
bouton réel, recharger. **0 violation de CSP, 0 erreur de script, 0 requête en échec,
0 refus HTTP.** Aucune route ne rend une vue vide.

Le cache est désormais sûr : `.js` et `.css` versionnés (61/61), `.html` en
`no-cache, must-revalidate`. C'était la condition de validité du cache long, et elle est
posée dans le même changement que lui.

---

### S12 — Les erreurs ne renseignent pas l'attaquant ✅

*Ce que j'ai tenté :* onze sondes destinées à faire dire au serveur quelque chose qu'il ne
devrait pas.

```
GET    …/risques/RISK-B                 404  « Aucune ressource ne répond à GET … »
PUT    …/risques/RISK-B                 404  « Cet enregistrement n'existe pas dans votre périmètre… »
PUT    …/risques/RISK-INEXISTANT        404  … MÊME phrase, MÊME code
DELETE …/risques/RISK-B?version=1       404  … MÊME phrase
DELETE …/risques/RISK-INEXISTANT        404  … MÊME phrase
POST   …/risques {champs:{id:'RISK-B'}} 400  la règle, sans dire si l'identifiant est pris
POST   …/risques {id:'RISK-B',…}        400  la règle, sans dire si l'identifiant est pris
POST   …/history (doublon de clé)       409  identifiant + version_actuelle — de SA filiale
PUT    …/mesures/MESURE-G               403  « appartient au socle commun du Groupe »
POST   …/mappings                       403  « … le même pour toutes les filiales »
```

Aucune pile d'appel, aucun nom de table, aucun nom de contrainte. Le `409` de doublon
n'expose l'identifiant occupant que sur une unicité **cloisonnée** — les unicités portent
`filiale_id` depuis la porte S1 (§19.1), donc l'enregistrement nommé est toujours lisible par
l'appelant.

Résidu : **T-9**, l'oracle d'existence par la reprise, réduit et **reporté à L3 par écrit**
(`CONVENTIONS.md` §21). Je discute ce report au §6, et je l'accepte.

---

### S13 — Dénis de service applicatifs ⚠️ passé avec réserve

Ce qui est borné, et que j'ai vérifié : corps à **26 Mio** (`SERVEUR_TAILLE_MAX_CORPS`),
`contenu` de la reprise à 20 Mo par le schéma, `LimitRequestBody` du vhost aligné,
`statement_timeout = 15 s`, `idle_in_transaction_session_timeout`, `lock_timeout`,
pool borné à 10, **20 000 lignes par collection au chargement** avec un refus explicite
`volume_excessif` au-delà, 2 000 par sondage, 80 champs par enregistrement, 1 000 éléments par
liaison, profondeur JSON 12, 20 000 nœuds.

Deux réserves, mesurées :

* **Q-9** — une reprise de 12 000 enregistrements s'exécute en **20 s dans une seule
  transaction d'écriture**, immobilisant une des dix connexions du pool. `statement_timeout`
  borne chaque instruction, pas la transaction : rien ne plafonne la durée totale.
* **Q-10** — un corps de 18,6 Mo coûte **~160 ms d'analyse** avant que la moindre décision ne
  soit prise. Le surcoût propre à la reprise a disparu (162 ms contre 158 ms pour une route
  ordinaire au même volume) : c'est désormais l'analyse de corps de Fastify, générique, et le
  remède est un contrôle en `onRequest` — donc L3.

---

### S14 — Intégrité des opérations composites ✅

*Ce que j'ai tenté :* une reprise en mode `remplacer` portant un risque valide **et** une
action visant un risque inexistant, sur une filiale peuplée.

```
volumes avant : {risques:4, actions:1, clients:1, imports:1}
POST /api/reprise → 409
volumes après : {risques:4, actions:1, clients:1, imports:1}   identiques : true
```

Rien n'est à moitié détruit, et la trace d'import n'est pas écrite non plus. L'aperçu, lui,
applique vraiment puis annule : **120 aperçus ne laissent aucune ligne** dans `imports`.

---

### S15 — Dépendances ✅

`npm audit --omit=dev` → **0 vulnérabilité**. Deux dépendances d'exécution seulement
(`fastify`, `pg`), trois de développement. Les intervalles sont en `^`, mais `install.sh`
déploie par `npm ci` : c'est le fichier de verrouillage qui fixe les versions installées.

---

### S16 — Les garde-fous sont branchés ✅

*Chemin de déploiement* — `migrate.mjs --verifier`, qui appelle le point d'appel unique
`f_verifier_schema()` :

```
base saine                                   exit 0   « aucune anomalie »
générateur ramené à mille valeurs            exit 7   « entropie_identifiants »
RLS désactivée sur « risques »               exit 7   « couverture_rls »
```

`install.sh` appelle la même fonction, en transaction **lecture seule** avec délai de garde,
et refuse de lister les contrôles à la main — le commentaire explique pourquoi, et il a
raison.

*Chemin d'exécution* — le garde-fou du registre, au démarrage du serveur :

```
RLS retirée sur « risques »            → démarrage REFUSÉ (ErreurRegistre)
colonne « version » supprimée          → démarrage REFUSÉ
colonne métier « nom » renommée        → le serveur démarre   ← portée revendiquée (m-4)
```

Le troisième cas n'est pas un défaut : c'est la portée que le §6 du registre revendique et que
son §1 énonce désormais correctement.

Résidu, et il est neuf : **Q-5** — un garde-fou qui *cesse d'être découvert* disparaît en
silence.

---

### S17 — Le chemin complet a été parcouru pour de vrai ⚠️ passé avec réserve

Ce que j'ai réellement parcouru, et qui va plus loin que les trois passages précédents :
l'arborescence **produite par `install.sh`** — pas celle du dépôt —, avec ses 61 URL
versionnées, servie sous la CSP, les sept en-têtes et la politique de cache du vhost, dans
Chromium, contre le serveur Fastify réel, contre PostgreSQL réel.

Ce que je n'ai pas pu parcourir, et qui reste la réserve de ce chantier : **Apache** n'est pas
installé sur cette machine (`which apache2` : rien), qui tourne sous **Ubuntu 24.04** et non
Debian 13, avec **PostgreSQL 16.13** et non 17. La CSP et les en-têtes que j'ai appliqués sont
extraits du fichier de configuration ; ce n'est pas Apache qui les a posés.

---

### S18 — Le produit fait ce qu'il doit faire ✅

Le troisième passage a proposé de lire S18 comme : *ce que l'écran annonce est ce que la base
contient*. C'est la lecture que j'ai appliquée, et elle passe.

| Geste, par son vrai bouton | Ce que l'écran annonce | Ce que la base contient |
|---|---|---|
| « Déclarer un risque » → formulaire → « Créer le risque » | la fiche s'ouvre | 1 ligne, `f=3 g=4 m=0.3 score_residuel=3,6 niveau=élevé` |
| clic sur la ligne de la liste | fiche « Risque par le formulaire » | l'identifiant affiché **est** celui du serveur |
| modification depuis la fiche | retour à la liste | « Risque renommé » |
| « Supprimer sélection » | la ligne disparaît | la ligne **est** supprimée |
| « Importer Analyse », 120 risques | « 120 importés » | **120 lignes** |
| import Excel de 250 exigences | « 250 importées » | **250 lignes** |
| boucle AirCyber, 234 réponses | 234 | **234 lignes** |
| rechargement de la page | l'écran se reconstitue | identique |
| écran Paramètres | « Enregistré sur : Serveur — Essai Toulouse » | plus de chiffrement local, plus de point de restauration, plus de « ne quittent jamais ce navigateur » |

Les 25 routes du menu rendent toutes quelque chose. **0 erreur de script, 0 refus HTTP,
0 violation de CSP** sur l'ensemble du parcours.

---

## 5. Constats neufs

### 5.1 Bloquants

**Aucun.**

### 5.2 Majeurs

---

#### **Q-1 — Le générateur d'identifiants corrigé n'est pas celui qui écrit**

C'est le motif du chantier dans sa forme la plus pure : le remède a été appliqué, gardé,
mesuré et démontré — **à côté de sa cible**.

Le constat bloquant du troisième passage nommait deux générateurs faibles : celui du
navigateur (`UI.genId`) et celui du serveur. Le premier a été corrigé et je l'ai vérifié
(52 bits d'aléa + compteur de session, 20 000 tirages tous distincts). Pour le second, la
correction a porté sur **`f_generer_id()`**, la fonction SQL : passée de `floor(random()*1000)`
à `gen_random_uuid()` sans tirets, soit 122 bits ; dotée d'un garde-fou de schéma dédié
(`f_verifier_entropie_identifiants()`), branché sur le point d'appel unique ; dotée d'un
contrôle de cloisonnement (**C107**) ; dotée de deux tests de volume dans
`test/base/socle.test.mjs` (250 tirages, 20 000 tirages) et d'un test de morsure.

Or, dans tout le schéma, `f_generer_id()` n'est la valeur par défaut que d'**une seule
colonne** :

```
$ select … from pg_attrdef … where pg_get_expr(…) like '%f_generer_id%';
journal_audit.id = f_generer_id('LOG'::text)
```

`journal_audit` est la table du **lot L5**, que le lot L2 n'écrit jamais. Et dans
`backend/src/`, `f_generer_id` n'apparaît que dans **un commentaire**.

**L'identifiant que le serveur écrit réellement** vient de `engendrerIdentifiant()`
(`src/entites/index.ts` §10), appelé à quatre endroits : la création ordinaire, la ré-émission
de la reprise, et deux fois la création d'une ligne `mesure_mise_en_oeuvre`. Son aléa :

```ts
function aleaEntier(): number {
  … source.getRandomValues(tampon); return (tampon[0] ?? 0) % 1_000_000;
}
```

**Un million de valeurs.** Mesuré sur le module compilé :

```
   250 tirages ·    250 distincts · collisions 0 · millisecondes distinctes  3
 1 000 tirages ·  1 000 distincts · collisions 0 · millisecondes distinctes  7
20 000 tirages · 19 997 distincts · collisions 3 · millisecondes distinctes 75
```

**Pourquoi ce n'est pas bloquant**, et je tiens à le dire aussi nettement que le reste : sur
la route de création ordinaire, `creer()` ne ré-émet un identifiant que si
`identifiantImpose` est renseigné — c'est-à-dire **uniquement sur le chemin de reprise**.
Ailleurs, une collision de clé primaire remonte en refus (`enrichirDoublon`), donc en
enregistrement bloqué + bandeau côté navigateur : **bruyante, jamais silencieuse**. Et une
requête HTTP par identifiant étale les tirages sur des millisecondes distinctes. Sur le
chemin de reprise, la boucle serre les tirages dans la même milliseconde, mais la transaction
est unique : une collision annule tout et le dit.

**Pourquoi c'est majeur quand même.** Trois artefacts du dépôt — un garde-fou de schéma, un
contrôle de cloisonnement, deux tests de volume — affirment une propriété d'entropie que le
produit ne tient pas là où il écrit. Le prochain lecteur croira le problème réglé. Et
l'ironie mérite d'être écrite : **le générateur du navigateur est désormais plus fort que
celui du serveur**.

**Remède** : une ligne — `aleaEntier()` rend 122 bits (ou `randomUUID()` sans tirets, comme la
fonction SQL). Budget de longueur : `MESURE-` + 13 + 32 = 53 caractères, le domaine
`id_metier` en admet 64. Et pendant qu'on y est, faire porter le garde-fou d'entropie sur
**le générateur qui écrit**, pas sur celui qui dort.

---

#### **Q-2 — La ré-émission d'identifiant n'est pas idempotente, et le correctif T-4 lui a ouvert le chemin**

Le correctif de **T-2** ferme le cas d'un identifiant répété *dans le fichier* — vérifié, il
refuse bruyamment. Il laisse délibérément la ré-émission au cas qu'elle vise : un identifiant
occupé **hors** du fichier, par une filiale invisible. C'est cohérent avec le constat, et je ne
le rouvre pas.

Ce que je rouvre, c'est ce que le correctif de **T-4** a rendu atteignable. Rejoué, même
fichier à l'octet près, même mode :

```
reprise 1 de « c.json » → 200  crees {risques:1, actions:1}
reprise 2 de « c.json » → 200  crees {risques:1}   maj {actions:1}
reprise 3 de « c.json » → 200  crees {risques:1}   maj {actions:1}

en base : RISK-1788248459739-154017 :: clone
          RISK-1788248459762-103657 :: clone
          RISK-1788248459780-762357 :: clone      ← trois là où le fichier en décrit un
action  : ACT-CLONE.risque_id = RISK-1788248459780-762357   ← elle vise le DERNIER
```

**Avant le correctif T-4**, l'unicité `uq_imports_idempotence` refusait la seconde application
du même fichier : ce chemin n'existait pas. Il existe maintenant, et c'est bien le geste que
T-4 a été corrigé pour **permettre** — restaurer, constater, restaurer encore.

**Le scénario réel**, et il n'est pas théorique. Vingt filiales migrent depuis la version
locale. L'espace des identifiants est **de niveau Groupe** (`CONVENTIONS.md` §21 : 33 tables
sur 47 portent `primary key (id)`), et les exports anciens portent des identifiants « sans
suffixe aléatoire, parfois réduits à un nombre » (§2). Deux filiales issues de la même version
ancienne portent donc des identifiants communs. La seconde à migrer voit les siens ré-émis —
c'est voulu, les références suivent. Mais si l'exploitant rejoue le même fichier « pour être
sûr », il obtient un jeu de doublons silencieux, et les références pointent vers le dernier
lot. Rien ne le dit : le bilan annonce des créations, ce qui est vrai.

**Pourquoi majeur et non bloquant** : il faut une collision d'identifiant inter-filiales, que
les générateurs actuels rendent improbable ; les doublons restent comparables par leur
contenu, et `imports` porte deux lignes datées. Ce n'est pas de la donnée indistinguable des
légitimes — c'en est proche.

**Remède, et il est peu coûteux** : rendre la ré-émission **déterministe** — un identifiant
dérivé de `(filiale_id, identifiant du fichier)` par une empreinte, plutôt qu'un tirage neuf.
L'issue reste indistincte pour l'appelant (§20.1 : *fermer un oracle demande de rendre
l'issue indistincte*), et la fusion redevient idempotente : la seconde reprise **retrouve** le
clone au lieu d'en fabriquer un autre.

---

#### **Q-3 — La moitié navigateur du correctif T-1 n'a aucun test**

Le rapport du troisième passage était explicite, et il en faisait une condition :

> « **T-1** … Élargir l'espace aléatoire des trois générateurs d'identifiants, indexer
> `ordonnerCreations` sur le rang, et **ajouter le test qui recompte en base après un import
> de N lignes** — sans le test, le correctif ne compte pas. »

Le correctif est fait, et il est bon : je l'ai éprouvé, y compris par sabotage. **Le test
n'existe pas.**

```
$ grep -rn "importExigences\|ImportExcelService" test/            → aucun résultat
$ grep -rn "genId\|ordonnerCreations\|doublons" test/navigateur/  → 6 emplois de UI.genId,
                                                                    aucune assertion sur lui
```

Aucun test ne crée plus d'**un** enregistrement dans un même cycle (`bascule.test.mjs` en crée
deux, et seulement pour éprouver le tri par dépendances). Cinq comportements neufs, tous
introduits par le remède du seul bloquant du passage précédent, ne sont exercés par aucune
des 505 assertions :

1. l'entropie de `UI.genId` ;
2. l'indexation par rang d'`ordonnerCreations` — la barrière qui, à elle seule, sauve un lot ;
3. le canari « identifiants en double » de `calculerDifferentiel` ;
4. `signalerRetrecissement()` et ses deux messages ;
5. le sondage qui pousse ce qui attend (le troisième reproche de T-1).

Le contraste est frappant : le banc porte **vingt tests « LE … MORD »**, tous côté serveur, et
un test d'entropie de 250 puis 20 000 tirages — sur le générateur SQL, qui n'écrit rien
(**Q-1**). Le côté qui a produit le bloquant est le seul qui n'a pas été instrumenté.

**§5 point 3** : « C'est prouvé — les tests passent, et la sortie est collée dans le rapport.
Une affirmation sans sortie de commande n'est pas une preuve. » Ici la preuve existe : c'est
la mienne, et elle est dans ce rapport. Elle ne se rejouera pas toute seule au prochain
changement.

**Remède** : trois tests, tous courts, et le premier est celui que TER a écrit noir sur blanc.
Ils tiennent dans `test/navigateur/`, qui existe déjà.

---

#### **Q-4 — §5 point 6 : la documentation est toujours antérieure à la vague, pour la quatrième fois**

`backend/README.md` §8, ligne 407 :

```
| L2 — API et bascule de la persistance | ⬜ à faire (vague 2) |
```

`CHANGELOG.md`, lignes 100-101 :

```
… le serveur n'expose toujours que son point de santé. La bascule de la
persistance de la SPA n'est pas commencée (lot L2, vague 2).
```

Les deux fichiers, comme `docs/DATA_MODEL.md`, n'ont pas bougé depuis `9f2a5c8`
(31/08 16 h 38) — **avant le premier commit de la vague 2**. Pendant ce temps le dépôt a reçu
10 500 lignes de serveur, 1 458 lignes de `sync.js`, sept fichiers de tests d'API et deux de
navigateur.

Ce n'est pas un défaut de style. `CLAUDE.md` §8 dit au lecteur d'aller chercher l'état réel
dans `backend/README.md` §8 ; un agent qui ouvrira la vague 3 y lira que L2 est à faire.
Signalé au premier passage (N-14), au deuxième, au troisième (T-12), et ici.

**Remède** : c'est le geste de fermeture de la porte (`PLAN_EXECUTION` §1, « commit par
vague »). Il appartient au rôle DOC, et il n'a jamais été fait.

---

### 5.3 Mineurs

| # | Constat |
|---|---|
| **Q-5** | **Un garde-fou de schéma qui cesse d'être découvert disparaît en silence.** `f_verifier_schema()` découvre ses contrôles dans le catalogue — c'est la parade du §19.5, et elle est juste. Mais il ne refuse que s'il n'en découvre **aucun** (`v_joues = 0`). Rejoué sur `grc_audit_s2q_sab` : `drop function f_verifier_entropie_identifiants()` → `migrate.mjs --verifier` **exit 0, « aucune anomalie »**. Pire, le cas réaliste : je change la **signature** de `f_verifier_couverture_rls` (un argument par défaut ajouté), puis je désactive la RLS sur `risques` → **exit 0, « aucune anomalie »**. Aucune malveillance n'est requise : une migration qui renomme ou re-signe une fonction suffit. Remède sans liste écrite à la main : consigner, à chaque application de migration, le **nombre** de contrôles découverts, et faire d'une diminution une anomalie. |
| **Q-6** | **Trois textes rendus faux par les correctifs T-2 et T-4, et laissés tels quels.** (a) `datastore.js`, en-tête d'`applyImport` : « l'empreinte porte l'idempotence : réimporter deux fois le même fichier est **refusé par la base** » — le correctif T-4 a précisément retiré ce jeton. (b) `001_socle.sql` : le commentaire de `uq_imports_idempotence` et celui de `imports.cle_idempotence` décrivent une idempotence que le seul écrivain de la table n'utilise plus (il laisse la colonne à `NULL`). (c) `src/reprise/index.ts`, anomalie `identifiant-duplique` : « **La clé primaire refusera le doublon** ; l'import doit trancher avant insertion » — c'est désormais l'application qui refuse, et l'import ne tranche pas, il rejette le fichier. C'est exactement ce que T-2 reprochait au remède précédent : *le remède a rendu fausse la phrase d'un autre fichier*. |
| **Q-7** | **`imports.id` est engendré avec `Math.random()` sur un million de valeurs** (`src/api/index.ts`, `IMP-${Date.now()}-${Math.floor(Math.random()*1000000)}`), sur une clé primaire, et sans passer par `engendrerIdentifiant()`. Conséquence bruyante (la reprise entière échoue), mais c'est un quatrième clone de la convention d'identifiant, et le §2 en demande **un seul**. |
| **Q-8** | **Le différentiel complet est recalculé plusieurs fois par battement.** `sonder()` appelle `aDesModificationsEnAttente()` — donc `calculerDifferentiel()`, donc `canonique()` sur **chaque enregistrement de chaque collection** — puis `cycle()` le refait, puis `collectionsAuVolumeIncertain()`, puis `etat()` à chaque notification d'observateur. Mesuré sur une filiale de 12 000 enregistrements (3,1 Mo) : `Sync.etat()` **54 ms**, un sondage complet **608 ms**, une création ordinaire **166 ms**. Confortable ici ; le plafond documenté est de 20 000 lignes **par collection**. Le correctif T-1 (« le sondage pousse ») a ajouté un de ces recalculs, toutes les 20 s, y compris quand rien n'attend. Un résultat mémorisé le temps d'un cycle suffirait. |
| **Q-9** | **Une reprise de 12 000 enregistrements tient une connexion du pool 20 s** (mesuré : 20 052 ms, statut 200), et 20 000 enregistrements en tiennent 38 s. `statement_timeout = 15 s` borne chaque **instruction**, jamais la transaction ; rien ne plafonne la durée totale ni le nombre d'enregistrements d'une reprise. Dix reprises simultanées épuisent le pool. Résidu de N-12, à traiter avec l'idempotence du lot **L7**. |
| **Q-10** | **Coût d'analyse avant toute décision : ~160 ms pour un corps de 18,6 Mo**, sans authentification. Ce n'est plus propre à la reprise — `POST /api/entites/risques` au même volume coûte 158 ms —, c'est l'analyse de corps de Fastify. Le remède est un contrôle en `onRequest`, avant l'analyse : il appartient à **L3**, avec la limitation de rythme. |
| **Q-11** | **Le repli d'`applyImport` réintroduit un renommage global.** Si le serveur ne porte pas `/api/reprise` (404/405), le navigateur fusionne enregistrement par enregistrement, en poussant **les identifiants du fichier** par la route de création. Le serveur les remplace par les siens, et `renommer()` réécrit alors **toute chaîne égale à l'ancien identifiant, dans toutes les collections et tous les champs**. Sans danger avec les identifiants d'aujourd'hui ; avec un export ancien portant `"7"`, tout champ texte valant `"7"` est réécrit. Le chemin n'est atteignable que contre un serveur plus ancien que le client — donc lors d'un retour arrière. À défaut de le fermer, le dire dans le code. |

Une observation qui ne mérite pas de numéro : le bandeau « Identifiants en double détectés »
n'est vidé qu'au rechargement complet (`doublons.clear()` n'est appelé que par
`reinitialiser()`). C'est cohérent avec la règle « le bandeau ne s'efface jamais tout seul »,
mais il survit à la disparition du doublon.

### 5.4 Ce que j'ai cherché et n'ai pas trouvé

Pour qu'un cinquième passage, s'il a lieu, aille chercher ailleurs :

* **une valeur cliente atteignant un réglage de session** — entêtes (six formes), cookie,
  paramètres d'URL, corps, sur toutes les routes ;
* **une injection** par nom d'entité, nom de champ, identifiant, ou pollution de prototype ;
* **une écriture qui franchit la frontière de filiale**, par la création, la modification, la
  suppression, la propagation ou la reprise ;
* **une destruction du socle Groupe par une filiale** : un « Remplacer » supprime 23 lignes
  locales et laisse le socle intact (`mesure_catalogue` et `documents` de portée Groupe
  toujours présents) ;
* **un état intermédiaire observable** après une reprise refusée, un aperçu, une propagation ;
* **un écrasement silencieux** — deux navigateurs réels, la version périmée reçoit `GRC03` et
  la saisie reste à l'écran ;
* **une trace d'aperçu** : 120 aperçus, zéro ligne dans `imports` ;
* **un secret** dans une réponse, un journal technique ou le dépôt ;
* **une régression de la CSP** sur l'arborescence déployée : 25 routes, cinq gestes réels,
  deux imports — 0 violation ;
* **une modification du dépôt par mes propres essais** : `git status --porcelain` vide.

---

## 6. Le report de T-9 à L3 — je l'ai lu, et il tient

`CONVENTIONS.md` §21 reporte au lot L3 le fait que **33 tables sur 47 portent
`primary key (id)`**, si bien qu'une reprise révèle indirectement qu'un identifiant est occupé
dans une filiale invisible. Il faut juger le report, pas seulement le constater.

**Ce que j'ai mesuré.** En aperçu, les deux issues sont **strictement indistinguables** :
même statut, même bilan JSON, mêmes anomalies, aucune trace. Sur 60 sondes de chaque, l'écart
n'est que temporel — **médianes 14,23 ms contre 13,03 ms**, soit 1,2 ms, sous le bruit d'un
réseau VPN. Hors aperçu, le canal subsiste : reprendre puis relire dit si l'identifiant a été
ré-émis, au prix de deux requêtes, d'une ligne dans `imports` et d'une ligne à supprimer.

**Les trois raisons écrites du §21, jugées une à une.**

1. *La clé globale achète le round-trip et les références polymorphes* (`journal_audit.entite_id`,
   le rattachement des pièces jointes). **Exact et vérifiable** : le journal est chaîné par
   empreinte, et rendre sa référence composite touche ce que le produit a de plus coûteux à
   reprendre. L'argument est le bon.
2. *Le remède déplacerait le signal au lieu de l'éteindre* — deux filiales pouvant alors porter
   le même identifiant, c'est la **collision** qui deviendrait observable. **Juste**, et c'est
   la formulation du §20.1 : fermer un oracle demande de rendre l'issue indistincte, pas de
   changer l'index.
3. *La vraie barrière est le droit d'appeler la route, et il appartient à L3.* **Juste, et
   c'est le point décisif** : aujourd'hui il n'y a aucun droit, donc aucun oracle exploitable
   par personne — la barrière fail-closed refuse tout hors développement, ce que j'ai vérifié.

**Ma conclusion** : le report est honnête, daté, et sa condition d'entrée est écrite (« le
modèle de droits doit décider qui peut appeler la reprise **avant** que ce report ne soit
reconduit »). Je l'accepte, avec une réserve : le §21 raisonne sur la *confidentialité* de
l'existence d'un identifiant, et ne dit rien de la face **intégrité** du même mécanisme, qui
est le constat **Q-2**. Le remède déterministe que je propose en Q-2 sert les deux : il rend
la fusion idempotente sans rendre l'issue distinguable.

---

## 7. L'état du banc d'essai — mord-il ?

**Réponse courte : il mord fort, et partout sauf là où le bloquant du passage précédent a été
corrigé.**

### Ce qui mord, et que j'ai vérifié moi-même

* **505 tests, dont 23 de navigateur**, tous verts, en 41,5 s. C'est +15 depuis le troisième
  passage.
* **Vingt tests « LE … MORD »** : chacun neutralise la propriété qu'il défend et exige que le
  banc devienne rouge. C'est la discipline que le chantier a mis six passages à acquérir, et
  elle est réelle : j'ai rejoué quatre de ces sabotages à la main (garde-fou d'entropie, RLS,
  colonne de traçabilité, colonne métier) et ils se comportent comme annoncé.
* **`attendreQuiescence`** est un ajout utile, et il est **lui-même testé** — le banc éprouve
  son propre instrument d'attente, ce qui répond au deuxième avertissement de méthode de ce
  chantier. Il ferme une classe d'essais capricieux réels : le tableau de bord inscrit son
  point d'historique au chargement, donc un envoi part sans geste de l'utilisateur.
* **`db/verifier_cloisonnement.sql`** est passé de 106 à **107 contrôles**, tous verts.

### Ce qui ne mord pas

**Un seul trou, et c'est exactement celui du correctif du dernier bloquant** : rien, dans les
505 tests, n'exerce la moitié navigateur de T-1 (constat **Q-3**). Le banc n'a jamais recompté
en base après un geste de masse, alors que le rapport précédent en faisait la condition du
correctif.

Deux absences moindres : rien n'éprouve `f_verifier_schema()` **par la disparition** d'un
contrôle (Q-5), et rien ne mesure le client au volume (Q-8) — le banc travaille sur des jeux
de quelques dizaines d'enregistrements.

---

## 8. Ce que la grille ne couvre pas

* **Elle ne demande pas que le correctif du dernier bloquant soit testé.** S18 exige que le
  produit fasse ce qu'il doit faire ; il le fait, je l'ai vérifié. Rien n'exige que la
  vérification soit **rejouable** par quelqu'un d'autre que l'auditeur du jour. Q-3 ne viole
  aucun des dix-huit contrôles : il viole §5 point 3.
* **Elle ne demande nulle part que le correctif porte sur le chemin réellement emprunté.**
  Q-1 est un remède complet, gardé et démontré — sur une fonction que rien n'appelle. Un
  contrôle « le garde-fou surveille ce qui écrit » manque à la grille, et ce serait le pendant
  naturel de S16.
* **Elle ne dit rien de l'exploitation** : sauvegardes, restauration, montée de version. T-14
  a été fermé parce qu'un auditeur l'a relevé trois fois, pas parce qu'un contrôle
  l'exigeait.
* **Elle ne dit rien du coût côté navigateur.** Le lot déplace tout le calcul de différentiel
  dans une page, et aucun contrôle ne regarde ce que cela coûte à volume réel (Q-8).
* **Elle ne remplace pas le test d'intrusion** prévu en L15, et ne protège ni contre un `root`
  sur la VM ni contre le propriétaire de la base (`CONVENTIONS.md` §12). Q-5 vit précisément
  dans cet angle mort, et c'est pourquoi je le classe mineur.

---

## 9. Ce que je n'ai pas pu vérifier

* **Apache** : absent de la machine (`which apache2` ne rend rien). J'ai extrait la CSP, les
  sept en-têtes `Header always set` et la politique de cache du fichier de configuration et
  les ai appliqués moi-même ; ce n'est pas Apache qui les a posés. `LimitRequestBody`,
  `ProxyTimeout`, la redirection TLS, les `DirectoryMatch` d'interdiction et le
  `<FilesMatch>` qui refuse `.json`/`.sql`/`.md` restent non éprouvés.
* **Debian 13** et **PostgreSQL 17** : tout a été joué sur **Ubuntu 24.04** et
  **PostgreSQL 16.13**. Je n'ai relevé aucun emploi de fonctionnalité postérieure à 16.
* **L'Active Directory**, **ClamAV**, **le relais SMTP** : hors périmètre du lot et absents de
  la machine.
* **La montée en charge réelle** : mes mesures (20 s pour 12 000 enregistrements, 160 ms pour
  18,6 Mo, 608 ms de sondage à 12 000 enregistrements) sont locales, sans latence de VPN. Sur
  le lien réel, tout ce qui est réseau s'allonge.
* **L'installation complète** : je n'ai exécuté d'`install.sh` que ses deux fonctions de
  versionnement du frontend, sur une copie, dans mon scratchpad. Le reste du script — unité
  systemd, privilèges, création du service — n'a pas été joué.
* **La validation du découpage Groupe/Filiale par le RSSI groupe** (risque P5) : toujours
  aucune trace dans le dépôt, et toujours attendue **avant la mise en service pilote**.

---

## 10. Ce qu'il faut faire, et quand

| # | Constat | Échéance |
|---|---|---|
| **Q-1** | Le générateur qui écrit n'a pas été corrigé | **à la fermeture de cette porte** — une ligne dans `aleaEntier()`, et faire porter le garde-fou d'entropie sur `engendrerIdentifiant()` |
| **Q-3** | La moitié navigateur du correctif T-1 n'a aucun test | **à la fermeture de cette porte** — c'était déjà la condition posée par le passage précédent |
| **Q-4** | Documentation antérieure à la vague, 4ᵉ signalement | **à la fermeture de cette porte** — c'est le geste de fermeture lui-même (`PLAN_EXECUTION` §1) |
| **Q-2** | Ré-émission non idempotente, clones à chaque reprise | **avant la mise en service pilote** — c'est le chemin de migration des vingt filiales. Ré-émission déterministe |
| **Q-9** | Aucun plafond de durée ni de volume sur une reprise | **lot L7** (import), avec l'idempotence portée par la requête |
| **Q-10** | Coût d'analyse avant authentification | **lot L3**, avec la limitation de rythme, en `onRequest` |
| **Q-5** | Un garde-fou disparu ne dit rien | **vague 3** |
| **Q-6** | Trois textes rendus faux par les correctifs T-2 et T-4 | **vague 3** |
| **Q-7** | `imports.id` : quatrième clone de la convention | **vague 3**, avec Q-1 |
| **Q-8** | Différentiel recalculé plusieurs fois par battement | **vague 3** ou L15 — à décider quand une filiale réelle sera chargée |
| **Q-11** | Renommage global sur le chemin de repli d'`applyImport` | **L15** — ou une ligne de commentaire dès maintenant |
| **T-9** | Oracle résiduel par la reprise | **L3**, report accepté (§6) |

---

## 11. Ce qui est solide, et qu'il faut dire

Un rapport qui franchit une porte doit dire ce qu'il a essayé de casser sans y parvenir, sans
quoi son verdict ne vaut rien.

* **Le bloquant est fermé deux fois, et la seconde barrière est une propriété de forme.**
  Générateur saboté à trois valeurs, 40 créations, 6 identifiants distincts : **40 lignes en
  base**. Un correctif qui survit à la destruction de sa propre prémisse est un correctif.
* **Le cloisonnement tient de bout en bout.** 107 contrôles au vert, et une quinzaine
  d'attaques par entête, cookie, URL, corps et reprise qui ne bougent rien. La propriété est
  tenue par la signature de `resoudre()`, pas par la discipline.
* **Le verrouillage optimiste marche là où il compte : dans deux vrais navigateurs.** C'est
  le risque projet P1, et c'est la première fois qu'il est éprouvé au niveau de l'utilisateur
  plutôt qu'à celui de l'API.
* **La barrière fail-closed ne laisse plus rien passer** — la route de reprise, dernier trou
  du passage précédent, refuse désormais avant de travailler, et un fichier invalide reçoit le
  même 503 qu'un fichier valide.
* **Les opérations composites sont réellement tout ou rien**, aperçu compris, et l'aperçu ne
  laisse pas même une ligne de trace sur 120 tentatives.
* **La livraison au poste est enfin sûre** : 61 URL sur 61 versionnées, `index.html` en
  `no-cache`, et un garde-fou d'installation qui refuse une balise écrite autrement. Un
  correctif d'urgence atteindra désormais les vingt filiales le jour où il est posé.
* **Le produit fonctionne, dans sa configuration de déploiement.** 25 routes, cinq gestes
  réels par leurs vrais boutons, deux imports, un rechargement : zéro erreur, zéro violation
  de CSP, et ce que l'écran annonce est ce que la base contient.

Le lot est fini. Ce qu'il lui reste à faire tient en trois gestes courts — corriger le
générateur qui écrit, écrire les trois tests qui manquent, et mettre la documentation à
l'heure — et ces trois gestes sont la fermeture de la porte, pas un cinquième passage.
