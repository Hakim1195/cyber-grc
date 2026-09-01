# Porte de sécurité S2 (2ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-BIS**, agent indépendant. Je n'ai écrit aucune des lignes examinées,
> ni le rapport du premier passage. Travail en **lecture seule** sur le dépôt : le seul
> fichier que je crée est celui-ci.
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`,
> révision examinée **`8ff7d75`** (« Le chemin de migration, éprouvé dans les deux sens »).
>
> Référence : `docs/PLAN_EXECUTION.md` §4 (les **dix-huit** contrôles) et §5 (définition de
> « terminé ») ; `docs/PLAN_SERVEUR.md` §1.3, §1.4, §1.6, §1.9, §1.10, §2.4, §2.6, §5 ;
> `backend/db/CONVENTIONS.md` §15 à §20 ; `docs/securite/RAPPORT_S2.md` (1ᵉʳ passage) et les
> six rapports de la porte S1.
>
> Date : 01/09/2026.

---

## 1. Verdict

> ### ✅ **PORTE FRANCHIE** — 0 bloquant, 4 majeurs, 11 mineurs.

Les **trois bloquants du premier passage sont fermés, et je les ai rejoués moi-même** dans un
navigateur réel contre le serveur réel : la base héritée survit à l'ouverture même quand le
serveur est injoignable ; masquer le bandeau de conflit ne fait plus mentir l'application ;
l'import « Remplacer » tient dans **une** transaction serveur et n'émet plus un seul `DELETE`.
Les neuf majeurs sont fermés ou ramenés à un résidu, et deux d'entre eux — M-4 et M-8 — l'ont
été **au bon endroit**, dans la migration et dans la découverte du catalogue, pas dans un
contrôle applicatif de plus.

Aucun des quinze constats de ce passage ne remplit le critère de gravité employé depuis le
début du chantier : *un défaut est bloquant si le corriger maintenant coûte peu et le corriger
après la mise en service exige de réparer des données qu'on ne pourra plus distinguer des
légitimes.* Rien ici ne détruit de donnée : les quatre majeurs sont un **oracle d'existence
rouvert**, un **chemin de migration qui refuse le fichier que le produit lui-même produit**,
une **liste qui reste sur un identifiant périmé** et une **moitié de correctif qui ne
fonctionne pas**. Tous sont visibles, tous sont réparables sans toucher aux données, et trois
d'entre eux ne deviennent atteignables qu'avec le socle Groupe que le lot L4 apportera.

**Ce que ce passage confirme, et qui n'est pas un détail** : trois des quatre majeurs sont des
**défauts créés par les correctifs du premier passage**. Le remède à M-3 (l'identifiant vient
du serveur) casse la liste affichée juste après une création ; le remède à B-3 (la route de
reprise) rouvre l'oracle que M-3 venait de fermer ; le remède à M-1 (ne pas réécrire ce qui
n'a pas changé) ne fonctionne pas contre un `NULL`, c'est-à-dire contre M-8. La règle du
`CONVENTIONS.md` §20.3 — *« le remède crée son propre chemin »* — s'est vérifiée trois fois de
plus, et c'est la raison pour laquelle ce rapport a passé l'essentiel de son temps sur les
correctifs plutôt que sur le code d'origine.

| # | Majeur | Échéance proposée |
|---|---|---|
| **N-1** | La route de reprise **rouvre l'oracle d'existence inter-filiales** que M-3 avait fermé, en une requête, et en mode aperçu **sans laisser de ligne en base** | **avant l'ouverture de la vague 3** — le correctif est le même raisonnement que `src/entites/index.ts` §8.7, déjà écrit |
| **N-2** | **Le produit ne sait pas reprendre son propre export** : tout fichier `grc-backup` produit par l'application est refusé en 403 dès que le socle Groupe n'est pas vide | **avant la mise en service pilote**, et au plus tard avec **L4** qui crée ce socle |
| **N-3** | Après une création, la **liste affichée garde l'identifiant local** : cliquer la ligne ne fait rien, et « Supprimer sélection » confirme une suppression qui n'a pas lieu | **vague 3** — c'est le geste le plus courant du produit |
| **N-4** | La moitié serveur du correctif M-1 (`retirerLesInchangees`) **ne fonctionne pas quand la base contient `NULL`** : c'est l'asymétrie `''`/`NULL` de M-8 à l'intérieur du remède de M-1 | **vague 3** (une ligne dans `valeursEquivalentes`) ; c'est la cause directe de N-2 |

---

## 2. Comment cette porte a été jouée

Rien de ce qui suit ne repose sur la lecture seule du code, et rien ne repose sur la
démonstration de quelqu'un d'autre. Tout ce qui est affirmé ici, je l'ai rejoué.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2b`**, neuve, créée par `db/dev/preparer_base_dev.sh --recreer` (4 migrations, garde-fous du schéma : aucune anomalie). Une seconde base jetable, `grc_audit_s2b_sab`, pour les sabotages de schéma — supprimée depuis. **Aucune base existante n'a été touchée.** |
| Données | Deux filiales `FIL-A` / `FIL-B` à égalité, un socle de Groupe (`MESURE-G`, `DOC-G`, `PERS-G`, `MAP-G`), semées **par le compte applicatif sous périmètre**, sur le modèle de `semerJeuEssai` |
| Serveur | `dist/serveur.js` réel, monté par `construireServeur()`, sur `127.0.0.1:3911` en `developpement`, puis rejoué en `recette` (3912) et en `production` (3913) |
| Frontend | La SPA servie telle quelle par un relais maison portant **la CSP exacte extraite de `deploy/apache/cyber-grc.conf`**, avec `/api/*` relayé vers le serveur réel |
| Navigateur | Playwright / Chromium 1194, **onze scénarios**, dont un balayage des 25 routes du menu, un balayage des formulaires de 17 modules, et une campagne de 158 clics + 216 changements de contrôle |
| Banc d'essai | Copié dans le scratchpad, **saboté sept fois**, restauré à chaque fois ; le dépôt d'origine n'a jamais été modifié (`git status --porcelain` vide à la fin) |

Ce que j'ai fait tourner avant de commencer, pour ne pas confondre un défaut avec un
environnement cassé :

```
$ npm run verifier-types                         → aucune erreur
$ npm test                                       → tests 474 · pass 474 · fail 0   (23,8 s)
$ node --test "test/navigateur/*.test.mjs"       → tests  19 · pass  19 · fail 0
$ npm audit --omit=dev                           → found 0 vulnerabilities
$ psql -f db/verifier_cloisonnement.sql          → 106 contrôles · 106 réussis · 0 échoué
$ git status --porcelain                         → (vide)
```

Les scripts d'attaque, les journaux et les traces de navigateur sont restés dans le scratchpad
de session ; **aucun n'a été versé au dépôt**.

---

## 3. Le sort des vingt et un constats du premier passage

Chaque ligne porte la preuve **que j'ai rejouée**, pas celle qu'on m'annonce. Quand j'ai
seulement lu le code, je le dis.

### 3.1 Les trois bloquants

#### **B-1 — Ouvrir la nouvelle application détruisait la base héritée** → ✅ **fermé**

`purgerBaseHeritee()` n'est plus appelé au chargement du module ; `js/core/reprise.js`
**détecte** la base héritée sans y toucher et propose, dans cet ordre, d'exporter puis de
reprendre. Le bouton d'effacement n'apparaît qu'après.

Rejoué : j'ai fabriqué une base `cyber-grc-db` contenant un instantané et un point de
restauration, puis ouvert l'application **avec `/api/**` coupé** :

```
B-1 serveur INJOIGNABLE → {"bases":["cyber-grc-db"],"risquesHerites":1,
                           "ecran":"… Serveur indisponible …"}
B-1 serveur JOIGNABLE   → {"bases":["cyber-grc-db"],
   "bandeau":"Données de l’ancienne version encore présentes sur ce poste (1 enregistrement(s)).
              Exportez-les, ou reprenez-les dans cette filiale. Rien ne sera effacé sans votre
              accord. [Exporter dans un fichier] [Reprendre dans cette filiale]"}
```

L'écran de refus de démarrage est bien rendu (superposition « Serveur indisponible — vérifiez
votre connexion (VPN) »), et **la base est intacte dans les deux cas**. Contrôle de morsure :
en réintroduisant `indexedDB.deleteDatabase('cyber-grc-db')` au chargement de
`persistence.js`, les deux tests de `constats-s2.test.mjs` tombent (voir §6).

#### **B-2 — La croix « Masquer » éteignait la seule trace** → ✅ **fermé**

`calculerDifferentiel` ne saute plus les enregistrements bloqués : il les classe avec un
drapeau, et le blocage n'a d'effet qu'**au moment d'écrire**. `aDesModificationsEnAttente()`
compte `bloques`. Rejoué de bout en bout, avec un vrai conflit provoqué par une seconde
session :

```
après conflit         : {"enAttente":true,"incidents":1,"bloques":1}
bandeau               : « 1 modification(s) non enregistrée(s). Modifié entre-temps —
                          Risque « Version d’Alice » … »
après clic sur « × »  : {"enAttente":true,"incidents":0,"bloques":1}
bandeau               : « 1 enregistrement(s) non enregistré(s) — la saisie reste à l’écran
                          mais n’est pas partie au serveur. [Voir le détail] [Recharger] »
```

L'application ne dit plus jamais « tout est enregistré ». Le bandeau compact subsiste, le
bouton de remède reste accessible, et `beforeunload` avertit encore (il lit la même fonction).

#### **B-3 — L'import « Remplacer » détruisait la filiale hors transaction** → ✅ **fermé**

Rejoué dans le navigateur, en comptant les requêtes réellement émises :

```
DataStore.applyImport(charge, 'replace')
  → {"ok":true,"transactionnel":true,"crees":1,"misAJour":0,"supprimes":47}
  requêtes DELETE émises : 0
  risques : 7 avant → ["RISK-IMPORT-1"] après
```

Une seule requête `POST /api/reprise`, une seule transaction. Atomicité vérifiée en faisant
échouer le fichier **à la fin** (une personne sans nom, colonne `NOT NULL` + `<> ''`) :

```
reprise qui échoue : 400 « Le champ « nom » est obligatoire. »
   RISK-ATOMIQUE présent ? []   volumes : identiques à avant, au comptage près
```

Et le socle Groupe survit à un « Remplacer », comme la méthode le promet :

```
remplacer : 200  supprimés = {"risques":2,"mesure_mise_en_oeuvre":1,"history":1,"mesure_catalogue":1}
   socle Groupe survivant : MESURE-G=true DOC-G=true PERS-G=true MAP-G=true
```

Les deux phrases mensongères de l'écran Paramètres ont disparu : plus de « point de
restauration », plus de « vos données ne quittent jamais ce navigateur ». L'écran dit
maintenant : « Vos données sont enregistrées sur le serveur de votre filiale, qui les
sauvegarde. Cet écran sert aux échanges de fichier. »

**Ce que ce correctif laisse ouvert, et que je porte en réserve** : l'acte reste
**irréversible, d'un rayon égal à la filiale entière, et disponible pour tout utilisateur**
(il n'y a pas encore de modèle de droits). Il est en revanche **tracé** : la table `imports`
porte l'auteur, l'empreinte SHA-256 du fichier, sa taille et le bilan — voir N-9 pour ce que
cette trace ne dit pas.

### 3.2 Les neuf majeurs

| # | Constat du 1ᵉʳ passage | Sort | Preuve que j'ai rejouée |
|---|---|---|---|
| **M-1** | Une filiale ne peut pas évaluer un contrôle du socle Groupe | ✅ **fermé sur le chemin réel**, ⚠️ **résidu serveur (N-4)** | Voir ci-dessous |
| **M-2** | Le verrou de la mise en œuvre est facultatif | ✅ **fermé** (mais **non éprouvé** par le banc, voir §6) | Voir ci-dessous |
| **M-3** | Oracle d'existence par la route de création | ⚠️ **fermé sur la création, ROUVERT par la reprise (N-1)** | Voir §5 |
| **M-4** | `mappings` réécrivable par toute filiale | ✅ **fermé, et au bon endroit** | Voir ci-dessous |
| **M-5** | La barrière fail-closed ne couvrait pas la recette | ✅ **fermé** | Voir ci-dessous |
| **M-6** | 70 gestionnaires en ligne bloqués par la CSP | ✅ **fermé** | Voir ci-dessous |
| **M-7** | Le sondage peut perdre la modification d'un autre | ✅ **fermé** | Lecture + code : `transaction_timestamp()` − 60 s |
| **M-8** | Le `""` du navigateur refusé par les listes fermées | ✅ **fermé** | Voir ci-dessous |
| **M-9** | Le banc ne couvre ni les routes, ni le navigateur, ni 20 entités sur 21 | ✅ **largement fermé**, 2 trous résiduels | Voir §6 |

**M-1 — fermé là où l'utilisateur passe.** Le correctif est double, et c'est le second qui
fait le travail : `js/core/sync.js` n'envoie plus que **les champs réellement modifiés**
(`corpsModifieDe`). Rejoué dans le navigateur, sur `MESURE-G` (socle Groupe, `description` à
`NULL` en base — l'état que produit le semis du projet lui-même) :

```
PUT /api/entites/mesures/MESURE-G
   {"version":3,"champs":{"statut":"conforme","maturite":4,"responsable":"Alice"}}
→ 200, aucun bandeau, aucune erreur ; la filiale a évalué le contrôle du socle.
```

`nom` et `description` ne partent plus, la ligne de portée Groupe n'est pas touchée, la
branche « cas nominal » du serveur est enfin atteinte. **Le pivot fonctionne.**
La moitié serveur du correctif, elle, ne fonctionne pas — voir **N-4**.

**M-2 — fermé.** Fabriqué la course moi-même, par HTTP, sur une mesure locale :

```
Alice (vmo à jour)     → 200, vmo = 2
Bob   (MÊME vmo périmé) → 409 GRC03 « L’évaluation de ce contrôle a été modifiée entre-temps »
Bob   (SANS vmo)        → 409 GRC03
en base : statut « non conforme », maturité 1  ← le travail d’Alice survit
```

Les deux chemins sont arbitrés : l'`insert` par l'unicité `(filiale_id, mesure_id)`, l'`update`
par la clause de version. Il n'y a plus de chemin muet. **Mais le banc ne mord pas dessus**
(§6) : j'ai retiré la clause de version du chemin 2 et les 474 tests sont restés verts.

**M-4 — fermé, et au bon endroit.** Le correctif n'est pas resté en TypeScript : `mappings` et
`mapping_exigences` ont **changé de famille de politiques** dans `004_rls.sql` (famille
« configuration », écriture conditionnée à `f_administration_groupe()`). Vérifié à la base,
sans passer par l'application :

```
session de filiale ordinaire, insert into mappings → 42501 « new row violates row-level
                                                       security policy for table "mappings" »
```

et `verifier_cloisonnement.sql` porte trois contrôles neufs (C102 à C105) qui le démontrent
dans les deux sens. Le garde-fou applicatif `exigerDroitEcriture` subsiste au-dessus ; il est
désormais une défense en profondeur — non éprouvée, voir §6.

**M-5 — fermé.** Les trois environnements rejoués sur trois serveurs distincts :

```
production : sante=200  session=503  donnees=503  POST risques=503
recette    : sante=200  session=503  donnees=503  POST risques=503   ← la recette est fermée
developpement : ouvert
```

**M-6 — fermé.** Il ne reste **aucun** attribut `on…=` dans le frontend (seulement sept
commentaires qui en gardent la mémoire), aucun `eval`, aucun `new Function`, aucun
`javascript:`, y compris dans `js/lib/xlsx.full.min.js`. Servi derrière la CSP exacte du
vhost, j'ai parcouru les **25 routes du menu** puis exercé **158 boutons et 216 contrôles** :

```
violations CSP : 0
erreurs JS     : 0
```

**M-8 — fermé, et par la découverte.** `decouvrirVidesInterdits()` lit `pg_constraint` et
marque les colonnes texte dont le schéma refuse la chaîne vide ; `convertirPourLaBase` les
convertit en `NULL`. Rejoué en pilotant les **formulaires réels de 17 modules** : dans chaque
cas j'ai ouvert le formulaire d'ajout, rempli les seuls champs texte vides, laissé toutes les
listes déroulantes à leur valeur par défaut, et enregistré. **Quinze modules enregistrent sans
un seul incident** ; les deux autres (`clients`, `risques`) utilisent une fenêtre modale que mon
sélecteur générique n'a pas trouvée, pilotée séparément et enregistrée elle aussi. Décompte en
base après le balayage :

```
personnes 1 · actifs 1 · exigences 1 · mesure_catalogue 1 · incidents 1 · documents 1
traitements 1 · processus 1 · crise 1 · scenarios_pra 1 · mco_actions 1 · tests_pra 1
prestataires 1 · audits 1 · clients 1 · risques 1
```

Le champ manquant `traitements.notes` existe (vérifié en base, contrôle C106 du script de
cloisonnement). Le balayage de vocabulaire (`test/base/vocabulaire.test.mjs`) est neuf et
recoupe le jeu d'essai v12 contre le schéma.

### 3.3 Les neuf mineurs

| # | Constat | Sort | Ce que j'ai constaté |
|---|---|---|---|
| **m-1** | Les 4xx de Fastify devenaient des 500 avec pile | ✅ **fermé** | `JSON malformé → 400`, `corps 30 Mo → 413`, `route inconnue → 404` ; journal au niveau `warn`, sans pile |
| **m-2** | `API_FILIALE_PROVISOIRE` documentée et lue par personne | ✅ **fermé** | La variable est lue (`session.ts`), et `API_ADMINISTRATION_GROUPE_PROVISOIRE` est documentée dans `.env.example`. Réserve de périmètre : voir N-15 |
| **m-3** | Un message de déclencheur pouvait nommer une table | ✅ **fermé** | `messageSurEtRedige()` compare les jetons du message aux noms d'objets **découverts** et retombe sur un texte générique au moindre doute |
| **m-4** | Le §1 du registre promettait plus que le §6 | ⬜ **non revérifié** | Le garde-fou mord (voir S16) ; je n'ai pas rejugé la formulation du commentaire |
| **m-5** | Le point d'historique quotidien produisait un 409 visible | ✅ **fermé des deux côtés** | Le 409 porte `identifiant` et `version_actuelle` ; côté navigateur, `Sync.marquerDerive("history", …)` absorbe le refus |
| **m-6** | « Recharger » n'écrivait pas d'abord | ✅ **fermé** | Le bouton appelle `rechargerApresEcriture()`, qui pousse le différentiel avant de recharger |
| **m-7** | `settings.js` mentait encore | ✅ **fermé** | Écran relu dans le navigateur : plus de chiffrement local, plus de points de restauration, plus de « ne quittent jamais ce navigateur » |
| **m-8** | `DELETE` sans `?version` | ✅ **fermé** | `DELETE /api/entites/risques/<id>` sans version → **400** ; la version est exigée par le schéma de la route |
| **m-9** | Fichiers hors périmètre | ⚠️ **rouvert** | `.env.example` (réservé à l'orchestrateur) a de nouveau été modifié ; `cyber-gouvernance_V4/index.html` reste attribué à aucun rôle. Voir N-15 |

Et l'observation non classée du premier passage — **la documentation (§5 point 6)** — est
**toujours ouverte** : `backend/README.md` §8 affiche encore « L2 — API et bascule de la
persistance : ⬜ à faire (vague 2) », et `CHANGELOG.md` écrit encore « la bascule de la
persistance de la SPA n'est pas commencée (lot L2, vague 2) ». Voir **N-14**.

---

## 4. La grille §4 — dix-huit contrôles

Rappel de la règle : « sans objet » n'est jamais « passé ».

| # | Contrôle | Statut |
|---|---|---|
| S1 | Cloisonnement par filiale non contournable | ✅ **passé** |
| S2 | Le périmètre ne vient jamais du navigateur | ✅ **passé** |
| S3 | Journal d'audit inaltérable et complet | ⬜ **sans objet** (L5) — avec la conséquence dite ci-dessous |
| S4 | Verrouillage optimiste effectif | ✅ **passé** |
| S5 | Aucune injection SQL | ✅ **passé** |
| S6 | Droits vérifiés côté serveur | ⬜ **sans objet** (L3) — la barrière provisoire est fermée partout sauf en développement, **sauf `/api/modele`** (N-6) |
| S7 | Le droit d'export est distinct de la lecture | ⬜ **sans objet** (L3) |
| S8 | Secrets | ✅ **passé** |
| S9 | Chaîne de contrôle des pièces jointes | ⬜ **sans objet** (L6) |
| S10 | Sortie et en-têtes | ✅ **passé** (réserve de cache : N-11) |
| S11 | Limitation du rythme et verrouillage | ⬜ **sans objet** (L3) — la route de reprise en fait sentir l'absence (N-12) |
| S12 | Les erreurs ne renseignent pas l'attaquant | ❌ **échoué** (N-1) |
| S13 | Dénis de service applicatifs | ⚠️ **passé avec réserve** (N-12) |
| S14 | Intégrité des opérations composites | ✅ **passé** |
| S15 | Dépendances | ✅ **passé** |
| S16 | Les garde-fous sont branchés | ✅ **passé** (réserve : N-7) |
| S17 | Le chemin complet a été parcouru pour de vrai | ⚠️ **passé avec réserve** — parcouru, et c'est là que N-2 et N-3 ont été trouvés |
| S18 | Le produit fait ce qu'il doit faire | ❌ **échoué** (N-2, N-3) |

### S1 — Cloisonnement par filiale non contournable ✅

**Rejoué.** Deux filiales semées à égalité, session `FIL-A` :

```
GET /api/donnees          → la charge utile entière ne contient ni « FIL-B » ni « RISK-B »
PUT    …/risques/RISK-B   → 404 ressource_inconnue (même phrase qu’un identifiant inexistant)
DELETE …/risques/RISK-B   → refusé
POST /api/entites/risques {"champs":{"nom":"x","filiale_id":"FIL-B"}}
                          → 400 « Le champ « filiale_id » n’appartient pas à l’entité « risques » »
POST /api/entites/risques {"champs":{"nom":"x"},"portee":"groupe"}
                          → 403 hors_perimetre (fail-closed, administrationGroupe faux)
```

Et à la base, hors application, `db/verifier_cloisonnement.sql` rejoué en entier sur ma base :
**106 contrôles, 106 réussis, 0 échoué**, avec la réserve C22 explicitement criée en fin
d'exécution (la **lecture du journal d'audit n'est pas cloisonnée** — dérogation qu'impose le
chaînage par empreinte, resserrement ferme du lot L5). C'est la bonne manière de porter une
dérogation : le script la réclame au lieu de la taire.

**Ce que j'ai tenté en plus.** L'écriture de portée Groupe sur `mappings` depuis une session de
filiale — refusée par PostgreSQL lui-même (42501), et non plus seulement par le code. C'est le
constat M-4 fermé au niveau où il devait l'être.

**Ce qui reste ouvert et qui n'est pas une fuite de lecture** : la route de reprise permet à
une filiale d'**occuper un identifiant du domaine global** (la clé primaire porte `id` seul).
Une filiale peut donc, par un fichier forgé, créer `RISK-XYZ` et empêcher définitivement une
autre filiale de reprendre un export qui contient ce même identifiant. Exotique, mais réel, et
c'est la face intégrité du constat **N-1**.

### S2 — Le périmètre ne vient jamais du navigateur ✅

**Preuve structurelle, revérifiée exhaustivement.** `appliquerPerimetre()` (`src/db/pool.ts`)
est le seul endroit qui pose les quatre réglages de session ; il n'est appelé que par
`avecTransaction`, seul endroit qui ouvre une transaction. Les cinq appels de `avecTransaction`
hors du pool passent **le périmètre de la session tel quel** — je les ai tous relus :

```
src/api/index.ts:308  PERIMETRE_SYSTEME (découverte du catalogue, lecture seule)
src/api/index.ts:423  perimetre        (enLecture)
src/api/index.ts:433  perimetre        (enEcriture)
src/api/index.ts:504  perimetre        (enAdministrationGroupe — INCHANGÉ, c’est le correctif)
src/api/session.ts:261 PERIMETRE_SYSTEME (lecture de la table filiales)
```

`resoudre()` ne prend toujours aucun argument. **Rejoué quand même** : entêtes `X-Filiale-Id`,
`X-Grc-Filiales`, `X-Forwarded-User`, cookie, `?filiale=FIL-B`, `portee` dans le corps —
tous ignorés ou refusés, aucune ligne de `FIL-B` rendue.

Côté navigateur, `cyber-context` a **disparu du `localStorage`** : le filtre « donneur d'ordre »
vit en mémoire (`window.FiltreDonneurOrdre`), les six fichiers qui le lisaient ont été migrés,
et `js/services/exportExcel.js` a été corrigé au passage d'un défaut réel (il exportait
*toutes* les exigences en croyant filtrer). `Session.purgerRestesNavigateur()` efface encore la
clé au démarrage et à `pagehide`.

### S3 — Journal d'audit ⬜ sans objet (lot L5)

`journal_audit` est vide après toute ma campagne (`count(*) = 0`) et aucune ligne de `src/` ne
l'écrit — le seul `grep` positif est un commentaire qui dit que c'est L5. C'est conforme au
découpage, mais il faut en tirer la même conclusion que le premier passage : **tant que L5
n'est pas livré, une destruction n'est pas attribuable**. La route de reprise atténue cela sur
son propre chemin — la table `imports` porte l'auteur, l'empreinte du fichier et le bilan — et
c'est un vrai progrès ; mais elle ne dit pas ce qu'elle a détruit (N-9), et rien d'autre n'est
tracé.

### S4 — Verrouillage optimiste effectif ✅

C'est le risque projet **P1**, et je n'ai pas cru les tests du dépôt : j'ai refait les courses.

```
POST …/risques {"id":"RISK-FORGE","champs":…}       → 400  (le client ne choisit plus son id)
PUT  …/risques/<id> {"version":1,"champs":{"nom":"A"}} → 200
PUT  …/risques/<id> {"version":1,"champs":{"nom":"B"}} → 409  GRC03  version_actuelle = 2
PUT  …/risques/<id> {"version":2,"champs":{"version":99,…}} → 400  (version refusée en champ)
DELETE …/risques/<id>  (sans ?version)                → 400
```

Sur l'entité **scindée**, les deux verrous tiennent, y compris le chemin que le premier passage
avait trouvé muet (M-2, ci-dessus). Et dans le navigateur, à deux contextes simultanés, le
second écrivain reçoit son refus, le voit, et le travail du premier survit.

**Le client ne peut fixer ni `version`, ni `cree_le`, ni `cree_par`** — pas même par la route
de reprise, qui les range dans « champs sans destination » et les rapporte :

```
POST /api/reprise  … {"id":"RISK-TRACA", version:99, cree_le:"2024-01-01", cree_par:"Le DG",
                      modifie_par:"quelquun", filiale_id:"FIL-B"}
→ 200, champs sans destination : ["risques.cree_le","risques.cree_par","risques.filiale_id",
                                  "risques.modifie_par","risques.version"]
en base : filiale_id = FIL-A, version = 1, cree_par = « developpement », cree_le = maintenant
```

C'est le piège n°2 légué par la vague 1, fermé et **rapporté à l'appelant** plutôt qu'ignoré en
silence.

### S5 — Aucune injection SQL ✅

Toutes les valeurs sont paramétrées ; les seuls fragments interpolés sont des noms de table et
de colonne issus du registre (littéraux) ou de `pg_catalog`, repassés par `ident()`. Un nom
d'entité reçu sert de **clé** dans une `Map`.

**Ce que j'ai tenté.** `risques"; drop table risques; --` et variantes encodées → 400 au schéma
de route ; `pg_class` comme nom d'entité → 400 ; un nom de champ portant du SQL → 400 « Le champ
« inconnu » n'appartient pas à l'entité » (le message n'invente plus de nom de champ, c'était le
correctif annoncé) ; `__proto__` dans `champs` → **retiré par `secure-json-parse`** avant même
d'atteindre le code, `Object.prototype` intact. Les tables sont intactes.

### S6 — Droits vérifiés côté serveur ⬜ sans objet (L3), avec un trou nommé

Il n'y a pas de modèle de droits, et c'est dit franchement, y compris dans la réponse de
`/api/session`. La barrière provisoire est désormais fermée en production **et** en recette.

**Ce que j'ai trouvé de neuf** : `GET /api/modele` **n'appelle jamais le résolveur de
périmètre**. Il répond **200 en production et en recette**, là où toutes les autres routes de
données répondent 503, et rend le modèle complet du produit — les 21 entités, tous les noms de
champs, leurs types, leurs préfixes d'identifiant. Voir **N-6**.

### S7 — Droit d'export distinct ⬜ sans objet (L3)

Inchangé depuis le premier passage, et il faut le redire : `DataStore.exportSnapshot()` /
`BackupService.exportPlain()` sont disponibles **sans condition et sans trace**, et exportent
désormais le jeu de données de la filiale entière rapatrié du serveur. J'ai produit un tel
fichier en une ligne depuis la console du navigateur.

### S8 — Secrets ✅

`/api/sante` est volontairement avare (`statut, application, version, environnement, heure,
durée, base.ok, base.latence_ms`). `/api/modele` ne contient ni mot de passe, ni hôte, ni port,
ni nom de rôle — vérifié par expression régulière sur la réponse entière. Aucun corps d'erreur
ne porte de secret. Aucun secret dans le dépôt.

### S9 — Pièces jointes ⬜ sans objet (lot L6)

`pieces_jointes` existe au schéma, n'est pas au registre, n'est pas exposée. Rien à contrôler,
et rien n'a été anticipé de travers.

### S10 — Sortie et en-têtes ✅

L'API pose `x-content-type-options: nosniff` et `cache-control: no-store` sur toutes ses
réponses. Le vhost pose HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP/CORP,
`Permissions-Policy` et une CSP stricte, et **l'application fonctionne sous cette CSP** (M-6
fermé, 0 violation sur 25 routes et 374 interactions).

**Échappement conservé — rejoué avec une charge active.** J'ai créé un risque nommé
`<img src=x onerror="window.__xss=1">`, puis provoqué un conflit pour le faire remonter dans le
bandeau de synchronisation :

```
bandeau : … Risque « &lt;img src=x one… »      <img> injectés : 0    window.__xss : false
liste   :                                       <img> injectés : 0    window.__xss : false
```

**Réserve** : la mise en cache du frontend (N-11).

### S11 — Limitation du rythme ⬜ sans objet (L3)

Aucune limitation, aucune dépendance qui en fournirait une. La route de reprise en fait sentir
l'absence plus que les autres (N-12).

### S12 — Les erreurs ne renseignent pas l'attaquant ❌

**Ce qui tient, et qui tient bien.** `src/erreurs/` reste le seul chemin de sortie d'un échec.
La confusion « absente » / « hors périmètre » est rigoureusement tenue sur la modification et
la suppression :

```
PUT …/risques/RISK-B          → 404 ressource_inconnue, phrase identique
PUT …/risques/RISK-INEXISTANT → 404 ressource_inconnue, phrase identique
```

Le refus d'un `check` nommé rend un message générique ; le refus d'un déclencheur sans nom de
contrainte passe désormais par un **filtre de jetons** comparé aux noms d'objets découverts, et
retombe sur un texte générique au moindre doute (m-3 fermé). Un refus `42501` de la RLS ne
laisse fuir ni table, ni politique, ni SQL, ni pile.

**Ce qui échoue — N-1.** L'oracle que le premier passage avait fait fermer sur la route de
création est **rouvert par la route de reprise**, avec deux aggravations : une seule requête
suffit, et en mode `apercu: true` **rien n'est écrit, pas même la ligne de trace `imports`**.
Détail au §5.

**Deux imprécisions de message**, mineures : un refus de reprise peut nommer un identifiant
interne que l'utilisateur n'a jamais vu (`MMO-…`, N-10), et le navigateur traduit tout
`contrainte_base` par « Ce fichier a déjà été importé » — y compris quand la vraie cause est un
identifiant occupé par une autre filiale (N-8).

### S13 — Dénis de service applicatifs ⚠️ passé avec réserve

**Ce qui est posé, et vérifié.** Corps borné (30 Mo → **413**, sans être lu). Délais de garde à
la connexion (`statement_timeout` 15 s, `idle_in_transaction_session_timeout`, `lock_timeout`
5 s). Pool borné à 10. Plafonds applicatifs explicites et **bruyants**, tous rejoués :

```
valeur de 300 000 caractères            → 400 « dépasse 200000 caractères »
1 500 éléments dans une liaison         → 400 « maximum 1000 »
document JSON de profondeur 40          → 400 « imbriqué trop profondément »
200 champs dans un enregistrement       → 400
rafraichir?depuis=1970-…                → 200, tronque=false (le plafond de sondage tient)
rafraichir sans « depuis » / date invalide → 400
```

**Réserve, N-12.** La route de reprise est le premier point d'entrée coûteux du produit :
~1,45 ms par enregistrement, **dans une transaction unique**. Mesuré : 2 000 enregistrements en
2,9 s ; un fichier de 20 Mo (le plafond du schéma de route) représente donc une transaction de
plusieurs minutes tenant une connexion du pool, et en mode « remplacer » des verrous sur toute
la filiale. Dix requêtes simultanées de 3 000 enregistrements :

```
rafale : 200,503,200,503,503,503,200,503,200,503  en 16,4 s
pendant : GET /api/donnees → 200 en 2,8 s, puis 12 ms
```

Le comportement est **fail-safe** (503 sur `statement_timeout`, pas de blocage indéfini) et la
lecture reste servie — c'est pourquoi je ne compte pas cela comme un échec. Mais c'est un coût
qu'il vaut mieux avoir mesuré avant la mise en service, et la limitation de rythme du lot L3
devra couvrir cette route en priorité.

### S14 — Intégrité des opérations composites ✅

`avecTransaction` reste l'unique ouverture de transaction ; `appliquerReprise` n'en ouvre
aucune et le dit. Rejoué sur les trois opérations composites :

* **reprise** — un fichier qui échoue à la fin ne laisse **rien** (démontré ci-dessus, B-3) ;
* **propagation** — vérifiée par le banc, et son verrouillage `for update of e` relu ;
* **aperçu** — la sentinelle annule la transaction : `apercu: true` sur un « remplacer » rend
  le bilan exact des 21 collections purgées **et ne supprime rien** (vérifié en recomptant).

### S15 — Dépendances ✅

`npm audit --omit=dev` : *found 0 vulnerabilities*. Deux dépendances d'exécution seulement
(`fastify@5.12.1`, `pg@8.23.0`), aucune ajoutée par les correctifs de ce passage. La demande de
variable de configuration a été formulée à l'orchestrateur (et honorée, cf. m-2).

### S16 — Les garde-fous sont branchés ✅

Le garde-fou du registre est **appelé** (`onReady`) et **fait échouer le démarrage**. Éprouvé
par sabotage sur une base jetable, dans les deux sens :

```
RLS non forcée sur « risques »                → code de sortie 1, le service ne démarre pas
colonne visée par un alias renommée           → code de sortie 1
   anomalie : « revues : l’alias « date » vise une colonne inconnue (date_revue). »
```

Le garde-fou de schéma (`f_verifier_schema`, point d'appel unique) est branché sur
`migrate.mjs` : `node db/migrate.mjs --verifier` l'exécute et l'annonce. Il ne voit pas le
renommage de colonne ci-dessus — c'est **hors de sa portée revendiquée**, et c'est le garde-fou
du registre qui le rattrape, comme prévu.

**Réserve, N-7** : le balayage anti-drapeau ajouté à ce passage est **nominal**.

### S17 — Le chemin complet a été parcouru pour de vrai ⚠️ passé avec réserve

Le contrôle est satisfait au sens propre : j'ai parcouru le chemin complet — navigateur réel,
serveur réel, CSP réelle du vhost livré, base migrée depuis zéro — et c'est **là** que les deux
constats les plus lourds de ce passage ont été trouvés (N-2 et N-3), aucun des deux n'étant
visible depuis le code ni depuis le banc.

Ce qui manque au parcours et que je ne peux pas fournir : Apache lui-même, Debian 13,
PostgreSQL 17. Voir §8.

### S18 — Le produit fait ce qu'il doit faire ❌

C'est le contrôle qui échoue, et il échoue sur deux gestes ordinaires.

* **N-2** — le geste « j'exporte ma filiale, je réimporte le fichier » est **refusé en 403**
  dès que le socle Groupe n'est pas vide. C'est le chemin que `PLAN_SERVEUR` §2.6 désigne comme
  *le* chemin de reprise et de remise à un acquéreur.
* **N-3** — le geste « je crée un enregistrement, puis je clique dessus dans la liste » ne fait
  rien, et « je le coche et je le supprime » **confirme une suppression qui n'a pas lieu**.

Aucun des deux ne viole un contrôle de sécurité. C'est exactement pourquoi S18 a été écrit.

---

## 5. Constats neufs

### 5.1 Majeurs

---

#### **N-1 — La route de reprise rouvre l'oracle d'existence inter-filiales, et l'aperçu le rend muet**

Le constat M-3 du premier passage tenait en une phrase : *le client choisit son identifiant, et
l'unicité de la clé primaire ignore la RLS*. Le correctif a fermé la route de création — le
client ne propose plus d'identifiant, et l'envoyer produit un 400 explicite. **Il a en même
temps ouvert la seule route où le client choisit encore ses identifiants**, parce que le
round-trip exact d'un export l'exige : `POST /api/reprise`.

`src/entites/index.ts` §8.6 bis l'écrit lui-même : *« C'est aussi le seul chemin où les
identifiants du fichier redeviennent les clés primaires […] la route de création ordinaire ne
l'admet plus depuis M-3, et c'est ici que la propriété a été conservée plutôt que perdue. »*
La propriété a été conservée ; l'oracle avec elle.

**Le scénario, rejoué depuis une session de la filiale `FIL-A`.** Un fichier `grc-backup`
minimal, une seule collection, un seul enregistrement, dont je choisis l'identifiant. Et
`apercu: true`, pour que la transaction soit **annulée** :

```
POST /api/reprise {"mode":"fusionner","apercu":true,"fichier":{… payload.risques=[{id:X}] …}}

   X = RISK-B                 → 409 contrainte_base « l’une de ses clés est déjà utilisée »
   X = RISK2-B                → 409 contrainte_base
   X = RISK-CE-QUE-JE-VEUX    → 200 ok
   X = RISK-A                 → 200 ok    (le mien : il est mis à jour, pas créé)

   même sonde sur « mesures » :
   X = MESURE-B               → 409 contrainte_base
   X = MESURE-INEXISTANTE     → 200 ok
```

`RISK-B` et `RISK2-B` appartiennent à la filiale allemande. Je ne les lis pas, je ne les écris
pas — **mais j'apprends qu'ils existent, en une requête, pour n'importe quelle entité.**

**Trois aggravations, et c'est ce qui distingue ce constat de M-3.**

1. **L'aperçu ne laisse rien.** En mode `apercu`, la ligne de trace de la table `imports` n'est
   pas insérée (`if (!apercu)`) et la transaction est annulée par la sentinelle. Vérifié :
   `select count(*) from imports` = 0 après une campagne de sondes. Il ne reste qu'une ligne
   `warn` dans le journal technique, qui n'a pas valeur de preuve — le lot le dit lui-même.
2. **Le sondage est industrialisable.** Les identifiants du modèle portent l'horodatage de
   création (`RISK-<millisecondes>-<aléa>`) : un identifiant trouvé livre aussi **la date et
   l'heure** à laquelle la filiale voisine a créé la ligne.
3. **La face intégrité.** La même route permet d'**occuper** un identifiant : la clé primaire
   porte `id` seul. Une filiale peut donc, par un fichier forgé, rendre définitivement
   impossible la reprise, par une autre filiale, d'un export contenant ce même identifiant.

**Pourquoi majeur et non bloquant.** Aucune donnée n'est détruite ni rendue indiscernable. Ce
qui fuit est une existence et une date, pas un contenu. Le correctif est peu coûteux et il est
**déjà écrit** — au §8.7 du même fichier, qui explique pourquoi le diagnostic refuse de
construire cet oracle : faire passer un `23505` sur une unicité **qui ne porte pas
`filiale_id`** par le même verdict indistinct que le refus de la RLS. Le chemin de reprise doit
appliquer le raisonnement de la route qu'il remplace.

---

#### **N-2 — Le produit ne sait pas reprendre son propre export**

`PLAN_SERVEUR` §2.6 fait de l'export `grc-backup` **le** chemin de reprise, et `backup.js`
lui donne deux emplois : reprendre une filiale déjà équipée, et **remettre ses données à une
filiale qui sort du groupe**. L'écran Paramètres propose « Fusionner » et « Remplacer tout ».

Aucun des deux ne fonctionne sur un fichier produit par l'application elle-même, dès que le
socle Groupe n'est pas vide.

**Le scénario, rejoué dans un navigateur réel, sous la CSP réelle.** J'exporte par le chemin
du produit (`DataStore.exportSnapshot()`, ce que le bouton « Exporter » appelle), puis je
réimporte le fichier obtenu par le chemin du produit (`parseImport` → `applyImport`) :

```
export produit : 8 398 octets
collections de portée Groupe présentes : mappings=1  DOC-G=true  PERS-G=true  MESURE-G=true

IMPORT « fusionner » → 403 « Ce fichier apporte des données de portée Groupe (mappings).
                             Cette opération […] relève de l’administration Groupe. »
IMPORT « remplacer » → 403, même refus
risques après        : inchangés (rien n’a été appliqué)
```

Et le refus n'est pas unique : il y en a **quatre, en cascade**. En retirant `mappings` du
fichier, le refus se déplace sur `mesures` / `MESURE-G` ; en réglant celui-là, sur `documents`
/ `DOC-G` ; et `personnes` / `PERS-G` attend derrière.

```
sans mappings              → 403 entite=mesures    identifiant=MESURE-G
… puis (M-1 résiduel réglé) → 403 entite=documents  identifiant=DOC-G
```

**La cause est double, et les deux moitiés sont des correctifs de ce passage.**

* `GET /api/donnees` rend, à juste titre, **le socle Groupe** avec les données de la filiale :
  c'est ce qui permet à la filiale de le lire. L'export le contient donc.
* `appliquerReprise` traite chaque enregistrement du fichier par `creer` ou `modifier`, et
  envoie **l'enregistrement entier**. Pour une ligne de portée Groupe, cela réclame le droit de
  l'écrire, que la session de filiale n'a pas. Le garde-fou de M-4 refuse `mappings` à la
  porte ; la RLS refuse les autres, une par une.

Pour `mesures`, la protection existe pourtant : `retirerLesInchangees` est fait pour cela. Elle
ne fonctionne pas, et c'est **N-4**.

**Pourquoi majeur et non bloquant.** La transaction est unique : le refus ne détruit rien, et
l'utilisateur voit un message. Surtout, **le défaut n'est pas atteignable dans le produit tel
qu'il est livré** : au lot L2, aucun écran ne crée de ligne de portée Groupe. Il le devient le
jour où le socle est provisionné — c'est-à-dire au **lot L4**, qui est dans le périmètre du
jalon de mise en service pilote. À corriger avant, sans quoi la première filiale qui essaiera
de restaurer sa sauvegarde recevra un refus incompréhensible.

**Deux pistes, et le choix n'est pas le mien** : ne reprendre que ce dont la session a le
droit, en le disant au bilan (le mécanisme `champsIgnores` existe déjà et est exactement de ce
genre) ; ou ne pas exporter les lignes de portée Groupe dans un export de filiale, puisque ce
n'est pas la filiale qui les détient.

---

#### **N-3 — Après une création, la liste reste sur l'identifiant local : le clic ne fait rien, la suppression groupée non plus**

Depuis le correctif de M-3, l'identifiant est engendré par le serveur, et le navigateur
**adopte** celui qu'on lui rend en renommant toutes les références (`renommer`, dans
`sync.js`). Le mécanisme est bon et je l'ai cherché en défaut sans le prendre : les clés
étrangères textuelles du modèle — `action.risque_id`, `evaluation.mesure_ids[]`,
`actif.dependances[].to` — sont bien réécrites, y compris dans les objets imbriqués, et
`location.hash` est recalé.

**Ce que `renommer` ne peut pas atteindre, c'est le DOM déjà rendu.** Les modules retournent à
la liste après une création (`Router.navigateTo("/risques")`), la liste est rendue
immédiatement avec l'identifiant **local**, et le cycle d'écriture ne part que 400 ms plus tard.
Quand l'identifiant change, **rien ne réaffiche la liste**.

**Le scénario, rejoué dans un navigateur réel, par les vrais boutons :**

```
« Déclarer un risque » → nom = « Risque course id » → « Créer le risque »

id porté par la LIGNE affichée : RISK-1788230148970-451
id RÉEL après le cycle         : RISK-1788230149374-44164
id porté par la ligne, APRÈS   : RISK-1788230148970-451     <<< PÉRIMÉ

l’utilisateur clique sur la ligne :
   hash    → #/risques/RISK-1788230148970-451
   écran   → le registre des risques (la fiche est introuvable, le routeur rebrousse chemin)
```

Le même essai sur `actifs` et `incidents` donne le même résultat. Et le geste destructeur est
pire :

```
« Déclarer un risque » → « Sonde suppression » → on coche sa ligne → « Supprimer sélection »
   DIALOGUE : « Confirmer la suppression définitive de 1 risque(s) ? »   → OK
   risques avant : 6   |   après : 6      <<< RIEN N’A ÉTÉ SUPPRIMÉ
```

`DataStore.deleteRisque(<identifiant périmé>)` filtre un tableau et ne trouve rien : aucun
message, aucun bandeau, aucune erreur de console. L'application **confirme une suppression
définitive et ne fait rien**. C'est la famille exacte du constat B-2 — l'interface qui affirme
autre chose que ce qu'elle a fait — réintroduite par le remède de M-3.

De la même façon, une référence reconstruite depuis une liste déroulante rendue avant le
renommage produit un lien mort. Rejoué : une dépendance d'actif construite sur l'identifiant
local est refusée par la base — et le message est faux (voir N-5).

**Pourquoi majeur et non bloquant.** Rien n'est détruit ; la ligne reste visible, donc l'échec
est constatable. Mais la fenêtre est ouverte **après chaque création, sur chaque module**, et
elle dure jusqu'au prochain rendu de la liste. Le correctif est peu coûteux : faire réafficher
la vue courante après un renommage (`reafficher` existe et sait ne pas voler un formulaire en
cours de saisie), ou recaler les attributs `data-id` du document.

---

#### **N-4 — La moitié serveur du correctif M-1 ne fonctionne pas contre un `NULL`**

`retirerLesInchangees` est présenté, dans le fichier même, comme le principe du correctif M-1 :
*« un enregistrement qui ne change pas la définition ne doit pas exiger le droit de
l'écrire »*. Il retire du lot les colonnes dont la valeur en base est déjà celle proposée.

Il ne le fait pas quand la base contient `NULL`. `versLeFrontend` rend `NULL` sous la forme
`''` pour les familles texte et date — c'est délibéré, le modèle navigateur ne porte pas de
`null`. Mais `valeursEquivalentes` déclare `NULL` et `''` **différents** :

```js
const videA = stockee === null || stockee === undefined;
const videB = proposee === null || proposee === undefined;
if (videA || videB) return videA && videB;      // NULL vs ''  →  false  →  « a changé »
```

Les deux conversions ne sont donc pas inverses l'une de l'autre : **le client ne peut pas
renvoyer une valeur qui compare égale**. C'est l'asymétrie `''`/`NULL` du constat M-8, revenue
à l'intérieur du remède de M-1.

**Rejoué, avec le corps exact que le navigateur détenait avant le second correctif** (et que la
route de reprise envoie toujours), sur `MESURE-G` dont `description` vaut `NULL` — l'état que
produit `semerJeuEssai`, c'est-à-dire le semis du projet lui-même :

```
PUT …/mesures/MESURE-G {"version":1,"versionMiseEnOeuvre":null,
   "champs":{"statut":"conforme","maturite":4,"responsable":"","commentaire":"",
             "nom":"Chiffrement des postes","description":""}}
→ 403 « Cet élément appartient au socle commun du Groupe. »

… puis, description passée de NULL à '' en base, la MÊME requête :
→ 200  {"statut":"conforme","maturite":4,…}
```

Instrumenté, le mécanisme est sans ambiguïté :

```
principales proposées : [ ['nom','Chiffrement des postes'], ['description',''] ]
après retirerLesInchangees : [ ['description',''] ]      ← 'nom' retiré, 'description' gardée
```

**Pourquoi cela compte alors que le navigateur ne l'exerce plus.** Le second correctif
(`corpsModifieDe`) fait que la SPA n'envoie que la différence, et masque donc ce défaut sur le
chemin ordinaire — je l'ai vérifié, l'évaluation d'un contrôle du socle fonctionne dans le
navigateur. Mais :

* **la route de reprise, elle, envoie l'enregistrement entier** — et c'est par là que N-2 se
  manifeste sur `mesures` ;
* le lot L2 livre une **API**, pas seulement une SPA : le lot L3, le lot L4 et tout appelant
  qui enverrait un enregistrement complet heurteraient le même mur ;
* et surtout la propriété que le fichier revendique est fausse telle qu'elle est écrite, ce qui
  est la faute que six passages de la porte S1 ont apprise : *« une convention n'est pas une
  preuve »*.

Correctif : aligner `valeursEquivalentes` sur `versLeFrontend` — pour les familles `texte` et
`date`, `NULL` et `''` désignent la même chose. Une ligne, et elle referme aussi une partie de
N-2.

### 5.2 Mineurs

| # | Constat |
|---|---|
| **N-5** | **Un message faux sur une référence morte.** Une liaison qui vise un identifiant périmé (N-3) échoue en `42501` et devient : « Écriture refusée : cet enregistrement sort du périmètre de votre session (filiale active, ou portée Groupe réservée à une administration Groupe). » La cause réelle est une référence qui ne pointe nulle part ; le message envoie l'utilisateur chercher un problème de droits. Et `revenirALaValeurServeur` **efface sa saisie de l'écran** au passage. |
| **N-6** | **`GET /api/modele` échappe à la barrière fail-closed.** La route n'appelle jamais `resolveur.resoudre()`. Elle répond **200 en production et en recette**, où `/api/session` et `/api/donnees` répondent 503, et rend le modèle complet : 21 entités, tous les noms de champs, leurs types, les préfixes d'identifiant. Ce n'est pas une donnée métier, mais c'est une divulgation de structure sur une route qui devrait suivre le sort des autres — et le lot L3 doit se souvenir de la fermer. |
| **N-7** | **Le balayage anti-drapeau est nominal.** `routes.test.mjs` balaie `src/**.ts` à la recherche d'une écriture de `administrationGroupe`, et il mord (sabotage n°3, §6). Mais le privilège n'est pas ce champ TypeScript : c'est le réglage de session `grc.administration_groupe`. Démontré à la base : une transaction ouverte en session de filiale ordinaire, puis `set_config('grc.administration_groupe','oui',true)` **plus loin dans la même transaction**, écrit dans `mappings`. Aucun contrôle ne cherche ce motif-là. Rien de tel n'existe aujourd'hui dans `src/` ; la parade est d'étendre le balayage au nom du réglage, pas seulement au nom du champ. |
| **N-8** | **Le navigateur diagnostique à tort un doublon d'import.** `applyImport` traduit **tout** `contrainte_base` par « Ce fichier a déjà été importé dans cette filiale. […] demandez à votre exploitant de lever la trace de l'import précédent. » Or ce code recouvre aussi la collision de clé primaire avec une ligne d'une **autre** filiale (N-1). Vérifié : un fichier portant `RISK-B` produit ce message, qui est faux et envoie l'exploitant chercher une trace qui n'existe pas. |
| **N-9** | **La trace d'import ne dit pas ce qu'elle a détruit.** Après un « Remplacer » qui supprime 47 lignes, la ligne `imports` porte `lignes_lues=1, lignes_creees=1, lignes_mises_a_jour=0` et le message « reprise « remplacer » depuis un export v1 » — **le volume supprimé n'apparaît nulle part**, alors que `bilan.supprimes` le connaît. Par ailleurs `lignes_ignorees` est renseignée avec le nombre de **champs** sans destination, pas de lignes. Tant que L5 n'existe pas, cette ligne est la seule trace d'un acte destructeur : elle mérite d'être exacte. |
| **N-10** | **Un refus de reprise peut nommer un identifiant interne.** Un fichier portant `mesures[].statut = "archivee"` est refusé avec : « La valeur du champ « statut » n'est pas admise pour cet enregistrement. » — `identifiant: "MMO-1788231328821-147732"`, un identifiant de mise en œuvre engendré par le serveur, que l'utilisateur n'a jamais vu et qui n'existe plus (la transaction est annulée). Le message devrait désigner l'enregistrement du fichier. |
| **N-11** | **Aucun cassage de cache sur 59 balises `<script>`.** Le vhost pose `ExpiresByType application/javascript "access plus 7 days"` et `ExpiresDefault "access plus 1 hour"`, et `index.html` charge 59 fichiers sans jeton de version. Le lot L2 fait du client et du serveur un **contrat** (versions, noms de champs, adoption d'identifiant) : après une montée de version, un poste peut faire tourner l'ancien `sync.js` contre la nouvelle API pendant sept jours — et aucun correctif de ce rapport n'atteindrait ses utilisateurs dans ce délai. |
| **N-12** | **Le coût de la reprise, et l'absence de frein.** ~1,45 ms par enregistrement dans une transaction unique (2 000 enregistrements → 2,9 s mesurées) : un fichier au plafond de 20 Mo est une transaction de plusieurs minutes tenant une connexion sur dix et, en « remplacer », des verrous sur toute la filiale. Le comportement est fail-safe (503 sur `statement_timeout`), mais la limitation de rythme du lot L3 doit couvrir cette route en priorité, et l'exploitation doit savoir que l'import est l'opération la plus lourde du produit. |
| **N-13** | **Deux propriétés que le banc n'éprouve pas** (détail au §6) : le verrou de version de la mise en œuvre (chemin `update`, le correctif de M-2) et le garde-fou de portée Groupe du chemin de reprise. Les retirer laisse 474 tests verts. |
| **N-14** | **§5 point 6 — la documentation reste en retard.** `backend/README.md` §8 affiche toujours « L2 — API et bascule de la persistance : ⬜ à faire (vague 2) », et `CHANGELOG.md` écrit encore « la bascule de la persistance de la SPA n'est pas commencée ». La porte est donc jouée, pour la seconde fois, sur un lot dont l'état documenté est antérieur à la vague. C'était déjà signalé au premier passage. |
| **N-15** | **§5 point 7 — périmètre.** `backend/.env.example`, réservé à l'orchestrateur (`PLAN_EXECUTION` §2), a de nouveau été modifié (commit `6a9de92`) ; l'intention est bonne — la variable de sécurité `API_ADMINISTRATION_GROUPE_PROVISOIRE` devait être documentée — mais la règle dit de la demander, pas de la prendre. Et `cyber-gouvernance_V4/index.html`, modifié lui aussi, **n'appartient toujours à aucun rôle** du tableau §2. C'est la lacune que le constat m-6 de S1 avait déjà nommée : « un rôle absent du tableau est une lacune, pas une permission ». |

### 5.3 Ce que j'ai cherché et n'ai pas trouvé

Pour que le lecteur sache où il est inutile de repasser à l'identique :

* **une valeur cliente atteignant un réglage de session** — les cinq appels de
  `avecTransaction` passent le périmètre inchangé, et j'ai relu les cinq ;
* **une injection** par nom d'entité, nom de champ, identifiant, ou pollution de prototype ;
* **un écrasement silencieux** sur l'une ou l'autre moitié de l'entité scindée ;
* **une fuite de lecture** vers la filiale voisine, par entête, cookie, URL ou corps ;
* **un XSS** par le nom d'un enregistrement, dans le bandeau de synchronisation comme dans les
  listes ;
* **un état intermédiaire observable** après un échec de reprise, de propagation ou de cascade ;
* **une écriture de colonne de traçabilité ou de colonne réservée**, y compris par le chemin de
  reprise ;
* **un secret** dans une réponse, un journal ou le dépôt ;
* **une régression de la conversion des gestionnaires en ligne** : 25 routes, 158 boutons,
  216 changements de contrôle, 0 erreur, 0 violation de CSP — et les formulaires réels de
  17 modules enregistrent.

---

## 6. L'état du banc d'essai — mord-il encore ?

**Réponse courte : il mord, et il a énormément grandi. Deux propriétés lui échappent encore, et
ce sont toutes deux des correctifs du premier passage.**

Le constat M-9 est largement fermé. Là où le premier passage écrivait « aucune route, une seule
entité, aucun test frontend », le banc porte maintenant :

* **`test/aide/serveur.mjs`** — monte le **vrai** serveur (`construireServeur`), donc aussi les
  en-têtes, le gestionnaire de route inconnue et le plafond de corps ; et un montage du greffon
  seul avec un résolveur fourni par le test, qui **respecte le contrat** (`resoudre()` sans
  paramètre — un résolveur de test qui lirait une entête aurait donné le mauvais exemple) ;
* **`test/aide/navigateur.mjs`** — un vrai navigateur, derrière la CSP du dépôt ;
* **quatre fichiers de routes** (`routes`, `entites-familles`, `operations`, `reprise-route`) ;
* **deux suites de navigateur** (`bascule`, `constats-s2`), qui couvrent nommément B-1, B-2,
  B-3 et M-6 ;
* **les 21 entités**, sans échantillonnage, et un balayage de vocabulaire qui recoupe le jeu
  d'essai v12 contre `/api/modele`.

### Le contrôle de morsure, fait par moi

J'ai copié le dépôt dans mon scratchpad, saboté **sept propriétés** une à une, et exécuté la
suite entière à chaque fois. Le dépôt d'origine n'a jamais été touché.

| # | Propriété sabotée | Verdict |
|---|---|---|
| 1 | `and version = $2` retiré de `majAvecVersion` (le cœur de P1) | ✅ **6 tests tombent**, sur trois couches : base, HTTP et navigateur |
| 2 | `and version = $n` retiré de `majMiseEnOeuvre` (**le correctif de M-2**) | ❌ **474 / 474 verts** |
| 3 | Une route se déclare `administrationGroupe: true` (**le correctif de M-4**) | ✅ 1 test tombe, et il nomme la ligne fautive |
| 4 | `indexedDB.deleteDatabase('cyber-grc-db')` remis au chargement (**B-1**) | ✅ 2 tests tombent |
| 5 | La conversion `''` → `NULL` retirée des colonnes texte énumérées (**M-8**) | ✅ **5 tests tombent**, dont la reprise d'un vieil export |
| 6 | Un gestionnaire `onclick=` réintroduit dans le tableau de bord (**M-6**) | ✅ 1 test tombe |
| 7 | `exigerDroitEcriture` retiré du chemin de **reprise** (**le correctif de M-4 bis**) | ❌ **474 / 474 verts** |

Extraits, pour que ce ne soit pas une affirmation :

```
### SABOTAGE 1
✖ version périmée → motif « conflit_version », et la version réelle est rendue
✖ la seconde reçoit « conflit_version », et le travail de la première survit
✖ 409 — conflit de version : « GRC03 » ET la version réelle
✖ deux navigateurs sur la même fiche : le second est REFUSÉ, et il le voit
✖ après la croix « Masquer », l’application ne dit JAMAIS « rien en attente »
✖ la saisie faite APRÈS le masquage n’est pas silencieusement perdue

### SABOTAGE 2 — verrou de la MISE EN ŒUVRE neutralisé
ℹ tests 474 · pass 474 · fail 0

### SABOTAGE 7 — garde-fou du socle Groupe retiré du chemin de REPRISE
ℹ tests 474 · pass 474 · fail 0
```

### Ce que les deux trous signifient

**Sabotage 2.** Le correctif de M-2 a deux chemins, et le banc n'en exerce qu'un. `grep
versionMiseEnOeuvre test/` ne rend que cinq lignes, et **aucune n'envoie une version périmée** :
les tests transmettent toujours celle qu'ils viennent de lire. Le chemin `version = null` →
`insert` est arbitré par l'unicité et se voit ; le chemin `version = n` → `update … and version
= $n` n'est éprouvé par rien. La propriété est vraie — je l'ai vérifiée à la main, le refus
`GRC03` sort bien — mais **rien ne la retiendra si elle se défait**. C'est exactement la règle
du `CONVENTIONS.md` §20.3 : *« les correctifs passaient avec une suite verte, parce que rien
n'exerçait le chemin corrigé »*, et elle se vérifie ici sur le correctif qui portait le risque
projet P1 sur la moitié comparable du modèle.

**Sabotage 7.** Le garde-fou ajouté dans `appliquerReprise` est présenté comme *« LE MÊME
GARDE-FOU QUE LA ROUTE ORDINAIRE, ET C'EST LE POINT »*. Il est en réalité **inatteignable** :
le contrôle de la route (`entitesDePorteeGroupeApportees`) emploie le même critère et refuse
d'abord. C'est de la défense en profondeur légitime — mais elle est muette, et si le contrôle
de la route change un jour de critère, rien ne dira que le second filet ne couvre plus rien.

### Ce qui reste hors du banc

* **N-2 et N-3** — les deux constats S18 de ce passage. Aucun test ne fait l'aller-retour
  « export du produit → import du produit », et aucun ne vérifie qu'après une création la liste
  affichée porte l'identifiant réel. Ce sont deux assertions courtes à écrire, et elles
  auraient trouvé les deux défauts.
* **L'oracle N-1** — le fichier `reprise-route.test.mjs` couvre la transaction, l'aperçu, le
  bilan et l'habilitation Groupe, mais il ne sonde pas un identifiant d'une autre filiale.
* Un **essai de charge** : rien ne mesure le coût de la reprise ni la contention du pool.

Le reste est du très bon travail : les fichiers de test disent ce qu'ils prouvent, énoncent
leur propre contrôle de morsure (« LA CLAUSE MORD », « LE ZÉRO MORD », « LE DÉTECTEUR MORD »),
et la suite de navigateur est écrite contre les constats qu'elle doit fermer, nommément.

---

## 7. Ce que la grille ne couvre pas

* **La grille ne dit rien de la réversibilité d'un acte destructeur.** S14 exige l'atomicité, et
  elle est tenue ; elle n'exige nulle part qu'un acte irréversible d'un rayon égal à la filiale
  entière soit réservé, confirmé côté serveur, ou récupérable. Entre L2 et L3, **tout
  utilisateur d'une filiale peut la vider en une requête**. Le geste est atomique, il est tracé
  dans `imports` (auteur, empreinte du fichier, horodatage), et la restauration se demande à
  l'exploitant (`PLAN_SERVEUR` §1.8) : c'est acceptable, mais c'est un arbitrage, et il devrait
  être écrit comme tel plutôt que découlant du fait qu'il n'y a pas encore de droits.
* **La grille ne couvre pas la cohérence entre ce que l'écran affiche et ce que la mémoire
  contient.** N-3 est un défaut de synchronisation entre le DOM et le modèle ; aucun des
  dix-huit contrôles ne le regarde, et S18 ne l'attrape que parce qu'il finit par produire une
  action qui ne fait rien.
* **Elle ne couvre pas le vieillissement du client.** N-11 — un poste peut faire tourner un
  client de la semaine précédente contre l'API du jour. Dès qu'un produit est client/serveur,
  la version du client fait partie de sa surface.
* **Elle ne couvre pas le coût.** S13 borne les entrées ; elle ne demande à personne d'avoir
  mesuré ce que coûte une opération légitime (N-12).
* Les limites déjà connues restent, et elles sont assumées : la grille ne remplace pas le test
  d'intrusion du lot L15, et elle ne protège ni d'un `root` sur la VM, ni du propriétaire de la
  base (`CONVENTIONS.md` §12).

---

## 8. Ce que je n'ai pas pu vérifier

* **La VM cible.** Debian 13, **Apache réel**, **PostgreSQL 17** (j'ai travaillé sur 16.13),
  systemd durci, ClamAV, Active Directory, relais SMTP. La CSP a été éprouvée telle qu'elle est
  **écrite** dans `deploy/apache/cyber-grc.conf`, servie par un relais maison — pas par Apache.
  Le constat N-11 (cache) est lu dans le même fichier et n'a pas été observé sur un Apache réel.
* **Le comportement sous charge réelle** : dix utilisateurs par filiale, vingt filiales, liaison
  VPN internationale. Mes mesures de reprise et de sondage valent pour un poste et une base
  quasi vide de contention.
* **Le volume réel.** Le plafond de 20 000 lignes par collection n'a pas été atteint ; je n'ai
  pas éprouvé le comportement d'une filiale qui le franchit (le serveur refuse alors de servir
  la collection entière, ce qui est l'arbitrage voulu mais se présente comme une panne totale).
* **La reprise d'un vrai export `grc-backup` de production.** J'ai éprouvé la chaîne complète
  avec des exports que j'ai fabriqués et avec l'export que le produit lui-même produit ; je n'ai
  pas de fichier d'une installation réelle de plusieurs années.
* **L'exhaustivité fonctionnelle des 26 modules.** J'ai piloté les formulaires d'ajout de
  17 modules et exercé 158 boutons et 216 contrôles sur 25 routes, en cherchant les erreurs de
  script et les violations de CSP. **Aucune erreur n'est apparue** — mais « aucune erreur » ne
  vaut pas « même comportement » : la conversion de 64 gestionnaires en ligne dans 23 fichiers
  peut avoir changé l'ordre d'exécution ou la propagation d'un événement sans rien casser de
  visible. Une relecture fonctionnelle par quelqu'un qui connaît le produit reste souhaitable,
  et notamment sur la matrice EBIOS, la cartographie et les référentiels, dont les rendus sont
  les plus riches en interactions.
* **Le lot L5 et le lot L3**, par construction : ni journal d'audit, ni droits, ni limitation de
  rythme n'existent, et les contrôles S3, S6, S7 et S11 restent donc « sans objet » — ce qui
  n'est pas « passé ».

---

## 9. Ce qui est solide, et qu'il faut dire

Refuser de le dire fausserait la lecture de ce rapport.

* **Les trois bloquants sont fermés, et fermés par le bon geste.** Aucun n'a été rattrapé par un
  pansement : la purge de la base héritée est devenue un dispositif de reprise avec export
  préalable ; le blocage d'un enregistrement est devenu un état que le différentiel porte au
  lieu de l'escamoter ; l'import « Remplacer » est devenu une route serveur transactionnelle,
  qui est aussi le seul endroit du produit où le round-trip exact des identifiants est conservé.
* **M-4 a été corrigé là où il fallait.** Le premier réflexe — un contrôle applicatif — a été
  posé, puis explicitement désigné comme insuffisant dans son propre commentaire, et la vraie
  correction est descendue dans `004_rls.sql`. `mappings` est aujourd'hui refusé par PostgreSQL
  lui-même, et trois contrôles neufs du script de cloisonnement le démontrent dans les deux
  sens. C'est la leçon du §17.9 appliquée par ceux qui l'avaient écrite.
* **M-8 a été corrigé par la découverte, pas par une liste.** Le fait qu'une colonne refuse la
  chaîne vide est lu dans `pg_constraint`. Une colonne ajoutée demain sera couverte sans que ce
  code change. C'est la parade que quatre défauts distincts de la porte S1 avaient réclamée.
* **Le drapeau d'administration Groupe ne se fabrique nulle part.** La règle — *une route
  vérifie un droit, elle ne se l'accorde pas* — est tenue par la forme, elle est écrite en
  toutes lettres, et un balayage automatique la retient. Le raisonnement qui a conduit à la
  rédiger, tel qu'il est consigné dans `enAdministrationGroupe`, est le meilleur passage de code
  de cette vague.
* **Le banc d'essai a répondu au reproche qui lui était fait**, et il y a répondu en montant le
  vrai serveur et un vrai navigateur plutôt qu'en ajoutant des assertions au niveau où il était
  déjà à l'aise. Les deux suites de navigateur sont écrites contre les constats nommés, avec
  leur propre contrôle de morsure.
* **L'application fonctionne sous sa propre politique de sécurité de contenu**, ce qui n'avait
  jamais été vrai. Tous les attributs `on…=` ont disparu du frontend — je n'en trouve plus un seul —
  et le parcours complet ne produit ni violation de CSP ni erreur de script. Les deux
  correctifs XSS annoncés au passage n'ont pas été revérifiés un par un ; ce que j'ai
  éprouvé, c'est que l'échappement tient aujourd'hui, charge active comprise.
* **Les correctifs disent ce qu'ils ne ferment pas.** `sync.js` écrit que la moitié serveur de
  M-2 « ne peut pas être fermée d'ici » ; `session.ts` écrit que sa variable d'échappement n'est
  pas documentée et qu'il faut la documenter ; `entites/index.ts` écrit que son garde-fou de
  portée Groupe est « en TypeScript, et c'est une faiblesse assumée, pas une solution ». Ces
  trois aveux ont chacun été suivis d'effet dans la même vague. C'est la bonne manière de
  travailler, et c'est ce qui rend cette porte franchissable.

Le lot ne casse plus là où il cassait. Il casse aux endroits que ses propres correctifs ont
créés — et c'est, au fond, le meilleur signe qu'on puisse donner d'un travail de reprise :
il n'y avait plus rien à trouver ailleurs.

---

## 10. Ce qu'il faut faire, et quand

1. **Avant l'ouverture de la vague 3** — fermer **N-1** : le `23505` sur une unicité qui ne
   porte pas `filiale_id` doit rendre, sur le chemin de reprise, le même verdict indistinct que
   le diagnostic de la route ordinaire (`src/entites/index.ts` §8.7, le raisonnement y est déjà
   écrit). Et **écrire le test qui échoue sans le correctif** : une sonde `RISK-B` contre une
   sonde `RISK-INEXISTANT`, avec la même réponse attendue.
2. **Dans la vague 3** — fermer **N-4** (une ligne dans `valeursEquivalentes`) et **N-3**
   (réafficher après un renommage). Chacun avec son test : un `PUT` d'enregistrement entier sur
   un contrôle du socle dont la définition contient `NULL` ; et une assertion qui compare le
   `data-id` de la ligne affichée à l'identifiant en mémoire après un cycle d'écriture.
3. **Avant la mise en service pilote, et au plus tard avec L4** — fermer **N-2**, avec un test
   d'aller-retour : exporter par le chemin du produit, réimporter par le chemin du produit, sur
   une base **portant un socle Groupe**. C'est le test qui manque le plus.
4. **Combler les deux trous du banc (N-13)** en même temps que les correctifs ci-dessus, et
   refaire le contrôle de morsure : un correctif que rien n'exerce ne compte pas.
5. **Reporter explicitement aux lots qui les portent** : N-6 et N-12 à **L3** (barrière et
   limitation de rythme), N-9 à **L5** (le journal d'audit rendra la trace d'import
   secondaire), N-11 à **L14 / exploitation** (versionner les ressources statiques).
6. **Mettre la documentation à jour (N-14)** avant de déclarer la vague close, et **arbitrer la
   lacune de périmètre (N-15)** : attribuer `cyber-gouvernance_V4/index.html` à un rôle, ou dire
   que l'orchestrateur le porte.

---

*Fin du rapport S2 bis. Les scripts d'attaque, les journaux de serveur, les traces de navigateur
et la copie sabotée du dépôt sont restés dans le scratchpad de session et n'ont pas été versés au
dépôt. Aucune base existante n'a été modifiée : `grc_audit_s2b` a été montée pour cet audit, et
`grc_audit_s2b_sab` — la base des sabotages de schéma — a été supprimée après usage. Le dépôt est
inchangé à l'exception de ce fichier (`git status --porcelain` le confirme), et aucun `git add`,
`commit` ou `push` n'a été fait.*
