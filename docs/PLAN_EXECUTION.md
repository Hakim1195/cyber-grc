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

## 0 bis. Arbitrages de l'utilisateur — 03/09/2026

Trois décisions rendues par l'utilisateur, qui **priment sur ce que ce document disait avant** :

| Sujet | Décision |
|---|---|
| **Branche** | Le travail se fait sur `claude/backend-plan-serveur-hj46fs`. **Dès qu'une chose est définitive et terminée, elle est poussée sur `main`.** |
| **Historique git** | La purge des données réelles encore présentes dans l'historique est **écartée**. Conséquence assumée et écrite une fois ici : ces fichiers restent accessibles à quiconque a accès au dépôt. |
| **Curseur qualité** | **Objectif V1 complète, toutes fonctionnalités, avant le 21/09/2026.** La perfection n'est pas demandée : ce qui compte est que le produit **fonctionne et fasse ce qu'il doit faire**. L'amélioration viendra ensuite, avec un vrai versionnage `Vx.x.x`. |

### Ce que le curseur qualité change concrètement

Le dispositif de portes reste, mais **il cesse de viser le zéro constat**. Le lot L2 a coûté
neuf passages ; à ce rythme, il resterait trois lots livrés au 21/09 sur les treize qui restent.

**Une porte par vague, et un tri au lieu d'un grinçage.** Chaque constat est classé :

| Classe | Traitement |
|---|---|
| **Bloque le fonctionnement** — le produit ne fait pas ce qu'il doit faire | corrigé avant la fin de la vague |
| **Fuite ou perte de données** — une filiale voit une autre, une saisie disparaît | corrigé avant la fin de la vague, sans négociation : c'est la promesse centrale du produit |
| **Tout le reste** | inscrit au registre, marqué **`V1.1`**, et la vague continue |

La troisième classe est celle qui change : elle n'arrête plus rien. Les deux premières restent
fermes, non par exigence de qualité mais parce qu'un outil qui montre à une filiale les données
d'une autre, ou qui perd une saisie, **ne fonctionne pas** — c'est le critère de l'utilisateur,
pas un critère de perfection.

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
| **Séquencement** | Une vague ne démarre pas tant que la porte précédente n'a pas **rendu son verdict**, et que les constats des deux premières classes du §0 bis ne sont pas fermés. ⚠️ **Cette ligne exigeait un passage *franchi* jusqu'au 03/09/2026** ; l'arbitrage du §0 bis l'a remplacé par un tri, et c'est à ce titre que la vague 3 s'est ouverte sur une porte S2 refusée au 9ᵉ passage sans bloquant. Le chemin critique (L0→L1→L2→L3→L4) impose l'ordre de toute façon. |
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

**Six** fichiers sont **partagés et donc réservés à l'orchestrateur** : ce document,
`backend/db/CONVENTIONS.md`, `backend/package.json`, `backend/.env.example`,
**`backend/src/erreurs/**`** et **`backend/src/serveur.ts`** (constat **Q-71** : c'est là que
les couches se relient, et le trou n'était visible d'aucun périmètre). Un agent qui a besoin d'une dépendance, d'une variable de
configuration ou d'un code d'erreur la demande dans son rapport ; il ne l'ajoute pas lui-même.

> ⚠️ **`src/erreurs/**` a été ajouté à cette liste le 03/09/2026, après coup — et le retard s'est
> vu dans le code avant de se voir ici.** Ce fichier porte `CodeApi`, le vocabulaire d'erreur
> auquel *le frontend se branche* : il est lu par tous les agents et n'appartenait à aucun. L'agent
> A2 a buté dessus et a écrit, dans `src/api/droits.ts`, qu'il « n'appartient pas au périmètre
> d'écriture » — puis a contourné le manque plutôt que d'y toucher, ce qui est exactement la
> discipline demandée. C'est le **quatrième** rappel du même motif (§2, « un rôle absent de ce
> tableau est une lacune, pas une permission »), et le premier où l'agent a eu raison **contre**
> le plan. Les deux codes qui manquaient — `non_authentifie` (401) et `droit_insuffisant` (403) —
> ont été posés par l'orchestrateur, à qui les corrections d'un ou deux fichiers reviennent.

### `backend/test/**` est partitionné à partir de la vague 3

Le tableau ci-dessus donne **tout** `backend/test/**` au rôle OUTILLAGE. C'était tenable tant
qu'un seul agent écrivait des essais ; ça devient un goulet dès que quatre agents doivent
**prouver** leur travail au sens du §5.3 — et la vague 2 en a payé le prix exact avec le constat
**Q-3** : la moitié navigateur d'un correctif livrée **sans un seul essai**, alors qu'un rapport
de porte en faisait une condition explicite. La règle « c'est prouvé » et la règle « on n'écrit
pas chez le voisin » se contredisaient ; c'est la propriété qui cède, pas la preuve.

À partir de la vague 3, **chaque famille d'essais suit le code qu'elle éprouve** :

| Famille | Propriétaire, vague 3 |
|---|---|
| `test/auth/**`, `test/droits/**` | **A1** — socle d'authentification |
| `test/api/**` | **A2** — application des droits |
| `test/navigateur/**` | **A3** — connexion et interface conditionnelle |
| `test/annuaire/**`, `test/modules/**`, `test/aide/**`, `test/base/**`, `test/depot/**`, `test/documentation/**`, `test/deploiement/**` | **A4** — annuaire simulé et filets |
| `test/reprise/**` | personne cette vague — **gelé**, aucun agent n'y écrit |

Deux garde-fous, parce qu'une partition d'essais est aussi une façon de laisser chacun se noter :

1. **`test/aide/**` reste à A4, et lui seul.** C'est l'aide partagée : deux agents qui la
   modifient en parallèle cassent le banc des trois autres.
2. **Un agent n'écrit pas l'essai qui juge le composant qu'il n'a pas écrit.** Le corollaire
   opérant est celui de l'annuaire simulé (§3) : A4 l'écrit, A1 le consomme.

---

## 2 bis. Quand déléguer, quand faire soi-même — dosage mesuré sur la vague 2

Procédure arrêtée le 03/09/2026, tirée de ce que la vague 2 a réellement coûté. Elle vaut pour
toutes les vagues suivantes.

### La règle de bascule

> **Déléguer pour la largeur et pour le regard extérieur. Faire soi-même pour la profondeur et
> les petits gestes.**

Point de bascule : **plus de trois fichiers, dans deux domaines, découpables en périmètres
disjoints → un agent.** Sinon, l'orchestrateur le fait directement.

| Situation | Qui |
|---|---|
| Un changement cohérent dans des fichiers que personne d'autre ne touche | **l'orchestrateur**, directement |
| Une correction d'un ou deux fichiers | **l'orchestrateur** — un aller-retour d'agent coûte plus que le geste |
| Trois fronts indépendants à mener de front | **des agents**, périmètres disjoints (§2) |
| Éprouver ce qui vient d'être écrit | **un agent** — voir ci-dessous, c'est le point non négociable |
| Un arbitrage | **l'orchestrateur**, jamais délégué |

### Protocole de lancement — la passe de préparation, avant tout agent

**Avant de créer le moindre sous-agent, l'orchestrateur fait une passe de préparation.** Elle
n'est pas optionnelle, et elle est presque toujours plus rentable qu'un agent : écrire un contrat
coûte quelques minutes, un agent coûte 300 000 à 600 000 jetons et une heure.

**La question, posée pour chaque agent envisagé, et dont la réponse s'écrit :**

> *De quoi cet agent a-t-il besoin qui n'existe pas encore dans le dépôt ?*

- « rien » → il peut partir ;
- « X » → **l'orchestrateur écrit X lui-même, avant de lancer**. X est presque toujours un
  **contrat**, pas une implémentation : une interface, une signature, un nom de réglage, un
  format de message, une liste de colonnes. Un agent qui devrait deviner **inventera, puis
  refera** — c'est le double coût, et il est évitable.

**Le contrat va dans le dépôt, pas dans le brief.** Un contrat qui ne vit que dans le message
d'un agent est perdu pour le suivant, qui le réinventera autrement.

**Le test de lancement — trois réponses écrites, ou on ne lance pas :**

| | Question |
|---|---|
| **Fichiers** | quels fichiers écrit-il exactement, et la liste est-elle **disjointe** de celle de tous les agents en vol ? |
| **Dépendances** | a-t-il besoin de la **sortie** d'un autre agent ? si oui, son contrat s'écrit d'abord, ou il attend |
| **Vérifiabilité** | peut-il **prouver** son travail avec ce qui existe ? sinon, l'outillage manquant est le vrai premier agent |

**Ce qui s'affiche avant de lancer** — un tableau `agent | fichiers écrits | ce dont il a besoin
et où c'est écrit | comment il prouve`. **Une case vide signifie que l'agent n'est pas prêt.**

**Pendant que les agents tournent** : ne modifier aucun fichier qu'un agent possède, et
**attendre le rapport complet** avant de dispatcher la suite — lancer des correctifs pendant
qu'un agent termine fait bouger l'arbre sous lui et rend son travail faux (mesuré au 7ᵉ passage).

### Disjoint ne suffit pas : regarder aussi les dépendances

Le §2 exige des **périmètres de fichiers disjoints**. C'est nécessaire et **ce n'est pas
suffisant** — deux agents peuvent n'avoir aucun fichier en commun et l'un attendre pourtant la
sortie de l'autre. Lancés ensemble, ils ne travaillent pas en parallèle : le second **invente le
contrat** qui n'existe pas encore, puis refait quand le vrai arrive. Une file d'attente déguisée,
payée au prix d'un agent.

**Avant de lancer un lot d'agents, poser trois questions :**

1. les périmètres sont-ils disjoints **au fichier près** ?
2. l'un d'eux a-t-il besoin de ce qu'un autre produit ? si oui, il **n'est pas** parallèle ;
3. l'outillage dont les autres ont besoin pour s'éprouver existe-t-il déjà ? un banc absent rend
   tout le lot invérifiable.

**Le remède n'est pas de sérialiser, c'est de publier le contrat d'abord.** L'agent du chemin
critique livre **en premier** son interface — types, signatures, codes d'erreur — sans
implémentation. Les dépendants démarrent contre elle. C'est ce qui a fonctionné en vague 2 avec
`ResolveurPerimetre` : l'interface existait avant le lot qui la remplira.

**Cas de la vague 3**, à titre d'exemple : AUTH, OUTILLAGE (l'annuaire simulé, qui est un
*prérequis* d'AUTH et non un parallèle), SCHEMA et DÉPLOIEMENT peuvent démarrer ensemble ; API,
FRONT et MODULES attendent que le modèle de droits et la forme de session soient publiés.

### Le point qui ne se négocie pas : l'audit indépendant

Ce n'est pas une question de vitesse, c'est une question de ce qui est **structurellement
visible**. Sur la vague 2 : l'orchestrateur a validé le lot neuf fois ; **tous les bloquants sont
venus d'auditeurs qui n'avaient écrit aucune des lignes examinées**. Le document normatif de
l'orchestrateur s'est trompé **onze fois**, et *aucune* de ces erreurs n'a été trouvée par lui.
Deux constats inscrits « corrigé » ne l'étaient pas.

On juge son travail avec les angles morts qui l'ont produit. **Un audit indépendant par vague,
minimum, quel que soit le calendrier.**

### Économiser sans perdre en qualité — ce qui se règle, et ce qui ne se touche pas

Le poste dominant du chantier n'est pas le travail des agents, ce sont les **passages de porte** :
un cycle complet — un auditeur, puis les trois à cinq agents de correctifs qu'il déclenche —
coûte environ **2 millions de jetons**, et le lot L2 en a consommé **neuf**. L'arbitrage du §0 bis
(une porte par vague) divise donc le coût d'une vague par **cinq à huit**. C'est l'économie
principale, et elle est déjà acquise.

Ce qui suit règle le reste. **Chaque ligne dit aussi ce qu'elle ne doit pas abîmer.**

#### 0. Le modèle agit sur le PRIX du jeton, jamais sur leur NOMBRE — mesuré le 04/09/2026

⚠️ **Ce point manquait, et son absence rend le tableau ci-dessous trompeur** : on peut lire
« sonnet pour les tâches mécaniques » comme « sonnet consomme moins ». **C'est faux, et la
vague L5 le mesure** :

| Modèle | Jetons consommés |
|---|---|
| `opus` × 4 (J1, J2, J3, SECU) | 346 615 · 411 768 · 317 678 · 336 063 → **moyenne 353 031** |
| `sonnet` × 1 (J4) | **412 041 — le plus cher de la vague** |

**Pourquoi** : le nombre de jetons est piloté par la **surface de lecture** et le nombre de
boucles d'outil, pas par le modèle. J4 devait confronter l'état des lots au réel, donc lire
les quatre plus gros documents du dépôt — **574 ko, environ 150 000 jetons de pure
acquisition** avant d'écrire une ligne :

| Document | Taille |
|---|---|
| `docs/PLAN_EXECUTION.md` | 195 ko |
| `CHANGELOG.md` | 151 ko |
| `backend/db/CONVENTIONS.md` | 115 ko |
| `backend/README.md` | 113 ko |

**Deux leviers distincts, qu'il ne faut pas confondre — et qui se cumulent :**

| Levier | Sur quoi il agit | Comment |
|---|---|---|
| **le modèle** | le **prix** du jeton | `sonnet` là où la réflexion est déjà dans la spécification |
| **le brief** | le **nombre** de jetons | nommer les fichiers ET les sections ; **extraire** dans le brief plutôt qu'envoyer lire |

> **Règle : ne jamais écrire « lis le §7 » dans un brief.** Le registre porte 129 constats ;
> un agent qui a besoin de cinq d'entre eux paierait 50 000 jetons pour en utiliser 2 000.
> L'orchestrateur **recopie les lignes utiles dans le brief** — il les a déjà sous les yeux.
> Le même raisonnement vaut pour le `CHANGELOG` et le `README` : ce sont des documents
> d'**écriture**, pas de lecture d'agent.

**Conséquence sur le choix du modèle, qui reste vrai mais pour la bonne raison** : dégrader
le modèle économise **le prix**, à qualité égale seulement si le brief est précis. Un brief
vague sur un modèle léger produit du travail à refaire, et l'économie s'inverse — ce que le
paragraphe suivant disait déjà, et que J4 illustre : sa prose a été **entièrement réécrite**
(constat **Q-124**).

#### 1. Le modèle se choisit par agent, pas par habitude

| Travail | Modèle | Pourquoi |
|---|---|---|
| **Audit adversarial**, revue de sécurité | **opus** — *jamais dégradé* | il doit trouver ce que personne n'a vu ; c'est le seul instrument qui voit les angles morts de l'orchestrateur |
| **Décision de conception**, arbitrage, interface | **opus** | une erreur ici se paie en réécriture, pas en correctif |
| **Code dans un domaine à pièges** — SQL et RLS, concurrence, authentification, cryptographie | **opus** | les défauts y sont silencieux : un cloisonnement faux ne se voit pas à l'exécution |
| **Essais contre une spécification précise** | **sonnet** | la réflexion est dans la spécification ; l'agent l'exécute |
| **Balayage mécanique, mesure et comptage** | **sonnet** | tâches où la justesse se vérifie par relecture immédiate |
| **Tâche étroite, spécifiée au geste près, avec un essai qui mord** | **haiku** | à réserver aux gestes dont l'échec est bruyant ; ce chantier a déjà produit deux balayages mécaniques *faux et verts* (l'entonnoir aveugle à deux fichiers, Q-114) — un modèle léger n'y change rien, mais un essai qui mord, si |
| ~~**Documentation d'état**~~ | **ne se délègue plus** | voir « le rendement au jeton » : 412 041 jetons perdus. C'est la tâche dont le coût est maximal pour un agent et quasi nul pour l'orchestrateur |

**Le garde-fou** : on ne dégrade **jamais** le modèle d'un agent dont le travail porte sur le
**cloisonnement, la perte de données, ou l'authentification**. Ces trois-là sont la promesse
centrale du produit ; économiser dessus revient à économiser sur le produit.

**La condition pour que ça marche** : un modèle plus léger n'est fiable **que si le brief est
précis**. Le protocole de lancement (ci-dessus) l'impose déjà — contrat écrit, périmètre nommé,
critère de preuve. Un brief vague sur un modèle léger produit du travail à refaire, et l'économie
s'inverse.

#### 2. Le contrôle de morsure se réserve, il ne se supprime pas

Chaque sabotage coûte une compilation, une exécution du banc et une restauration. C'était juste
quand on visait le zéro constat ; sous le curseur V1, il se **réserve** :

| Ce que l'essai protège | Morsure |
|---|---|
| cloisonnement, perte de données, authentification | **obligatoire** — c'est ce qui distingue un essai d'un décor |
| tout le reste | **facultative**, à la main de l'agent s'il a un doute |

**Ce qui ne change pas** : un essai qui ferme un constat des deux classes dures **n'est pas
accepté sans sa morsure**. Ce chantier a inscrit deux constats « corrigé » qui ne l'étaient pas,
et un banc vert à 43 sur 43 masquait un détecteur neutralisé.

#### 3. Le brief porte la liste de lecture

Un agent qui démarre à froid explore le dépôt pour se situer : **100 000 à 200 000 jetons de pure
ré-acquisition**. Le brief doit donc nommer **les fichiers exacts et les sections à lire**, pas
inviter à explorer. C'est aussi une amélioration de qualité : un agent qui lit ce qu'il faut ne
réinvente pas ce qui existe.

#### 4. Moins d'agents, périmètres plus larges

Trois agents corrigeant chacun deux constats dans le même domaine paient **trois fois** la
ré-acquisition. Un seul agent sur tout le domaine la paie une fois — et voit les interactions
entre les deux corrections, ce que trois agents séparés ne voient pas.

#### 5. Le rapport dit ce qui a été mesuré, pas le chemin parcouru

Un rapport doit porter **trois choses, denses** :

1. **ce qui a été mesuré** — commande et sortie, jamais une affirmation sans preuve ;
2. **ce que l'agent a cru et qui était faux**, et comment il s'en est aperçu ;
3. **ce qu'il n'a pas pu vérifier**, en distinguant *impossible ici* de *non tenté*.

**Ce qui s'élague** : la chronologie pas à pas. **Ce qui ne s'élague jamais : le point 2.** Les
aveux de méthode de ce chantier — un banc mesuré à travers une doublure morte, un essai vert
avec la moitié d'un bloquant rouverte, une mesure lue à travers un tube qui rendait le code de
`sed` — ont chacun évité un défaut. C'est la partie la plus dense en information de tout le
rapport.

#### Ce qui ne s'économise jamais, quel que soit le calendrier

- **l'audit indépendant, un par vague**, sur le modèle le plus fort ;
- **la morsure sur les deux classes dures** ;
- **prouver en exécutant, pas en lisant** — un chiffre sans sa commande n'est pas un chiffre ;
- **un constat ne se ferme pas sur la foi d'un rapport** : il se ferme rejoué.

### Ce que la délégation coûte, et qu'il faut budgéter

Mesuré sur la vague 2 : **300 000 à 660 000 jetons par agent**, vingt minutes à deux heures. À
quoi s'ajoutent des coûts que le compteur ne montre pas :

- **le briefing** — un périmètre mal écrit produit un travail hors sujet, et le brief de
  l'orchestrateur **propage ses propres erreurs** à qui l'exécute ;
- **les courses** — un agent écrit pendant que l'orchestrateur commite ; le correctif de l'un
  casse l'essai de l'autre ;
- **la fraîcheur** — des correctifs lancés quatre minutes avant qu'un auditeur ait fini ont rendu
  fausse une phrase de son rapport. **On attend le rapport complet avant de dispatcher.**

### Le rendement au jeton — mesuré sur la vague L5, 04/09/2026

> **L'objectif arbitré par l'utilisateur : le maximum de travail de QUALITÉ à parité de
> jetons, et le temps optimisé avec.** Ce qui suit n'est pas de l'intuition : c'est la
> décomposition réelle d'une vague de **1 824 165 jetons**.

| Agent | Jetons | Livrable | Ce qu'il est devenu |
|---|---|---|---|
| J1 | 346 615 | émission du journal, 14 actions | ✅ tient |
| J2 | 411 768 | E6 + 3 routes + 61 essais | ✅ tient |
| J3 | 317 678 | écran `/journal` + filet Q-92 | ✅ tient |
| **J4** | **412 041** | **documentation d'état** | ❌ **invalidée le jour même** (constat **Q-124**) |
| SECU | 336 063 | audit S4, 10 constats | ✅ 5 corrigés le jour même |

#### 1. La documentation ne se délègue JAMAIS en parallèle de ce qu'elle décrit

**Le plus gros gaspillage mesuré du chantier : 412 041 jetons, 23 % de la vague, perdus.**

J4 a été lancé **en même temps** que les agents L5, avec l'instruction — juste en soi — de
ne pas décrire un lot en cours. Il a donc écrit fidèlement l'état d'**avant** L5, et ce
texte a été commité avec le lot qui le rendait faux. L'orchestrateur a tout réécrit à la
clôture, en une dizaine de minutes et **quelques milliers de jetons**, parce qu'il avait
déjà le contexte.

> **Règle : la documentation d'état appartient à l'orchestrateur, à la clôture.** Elle est
> la seule tâche dont le coût marginal est quasi nul pour lui et maximal pour un agent —
> un agent doit **acquérir** ce que l'orchestrateur a déjà. Ce qui reste délégable en
> documentation : ce qui se **mesure** (compter, confronter des chiffres au réel, écrire
> un garde-fou), jamais ce qui se **raconte**.

#### 2. Le seuil de délégation est un nombre : 200 000 jetons

Un agent paie **100 000 à 200 000 jetons de pure ré-acquisition** avant de produire une
ligne. La conséquence est arithmétique, et elle rend le §2 bis (« la règle de bascule »)
chiffrable :

- travail estimé **< 200 k** → l'orchestrateur, toujours. Un aller-retour d'agent coûte
  plus que le geste ;
- travail estimé **> 200 k**, découpable en périmètres disjoints → un agent ;
- **dix constats indépendants → deux ou trois agents groupés PAR DOMAINE**, jamais un par
  constat : dix agents paieraient dix fois la ré-acquisition pour le même dépôt.

#### 3. Un contrat écrit coûte 5 000 jetons et en économise 300 000

Mesuré en vol sur cette vague : le §29.8 figeait les chemins et les filtres, **mais ni le
curseur ni la forme de l'enveloppe**. Le serveur rendait `{pagination:{suivant}}`, l'écran
lisait `corps.suivant`. Un écran qui reçoit `undefined` **cesse de feuilleter et affiche
une page en croyant les avoir toutes** — rien ne casse, il manque seulement des lignes
dans un registre qui sert de preuve en audit.

Complété à chaud pour ~3 000 jetons ; sans cela, l'un des deux agents refaisait sa moitié.
**C'est le meilleur rendement de tout le dispositif**, et c'est ce que la passe de
préparation achète.

#### 4. On travaille PENDANT que l'auditeur tourne

L'audit a duré **38 minutes**, passées à ne rien faire. La règle *« attendre le rapport
complet avant de dispatcher »* a été écrite pour des agents **de construction**, dont
l'arbre bougerait sous eux. **L'auditeur n'écrit que dans `docs/securite/`** : tout le
reste du dépôt est disponible. Pendant qu'il tourne, on traite les constats déjà ouverts,
on écrit les contrats de la vague suivante — jamais un fichier qu'il pourrait citer comme
mesuré, ce qui est traité par un simple message l'avertissant de rejouer sa mesure.

#### 5. Le banc complet se réserve au pré-commit

Un banc complet coûte **140 secondes**. Huit exécutions sur cette vague, **trois
suffisaient**. Pendant le travail : les familles touchées (`node --test "test/<famille>/*.test.mjs"`).
Le banc entier : une fois, avant de commiter — c'est là qu'il sert, puisque *« vert »
qualifie une révision, jamais un répertoire de travail*.

#### 6. Ce qui, à l'inverse, était le bon usage et ne doit pas être rogné

**Les quatre agents de construction en parallèle** : 4 × 40 minutes de travail rendus en
40 minutes. C'est le poste le plus rentable du dispositif, et il ne se réduit pas.
**L'audit indépendant non plus** : 336 063 jetons qui ont sorti une fuite de données que
trois agents et l'orchestrateur n'avaient pas vue. Économiser là reviendrait à économiser
sur le produit.


### Le dosage retenu pour les vagues 3 à 8

1. **Construire en parallèle**, 3 à 5 agents par vague, périmètres disjoints — c'est ce qui tient
   le calendrier.
2. **Un seul audit indépendant par vague.** Son verdict est un **tri**, plus un veto (§0 bis).
3. **L'orchestrateur seul** sur les arbitrages, les corrections courtes, et tout ce qui tient en
   un ou deux fichiers.

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
| SCHEMA | `007_*.sql` — politiques d'écriture du substrat de session adossées au réglage `grc.authentification` (**E1**), corrections `comment on` des textes rendus faux (**E5**), et ce que le modèle de droits exige en base | Une session applicative ordinaire ne peut plus écrire dans `sessions`, `session_filiales`, `session_domaines` ; la transaction d'ouverture le peut. `migrate.mjs` ne sort pas en code 4. |
| AUTH | Liaison LDAPS, **résolution récursive des groupes imbriqués**, provisionnement à la première connexion, déprovisionnement qui invalide les sessions actives, sessions serveur, **trois axes** périmètre × profil × niveau, **droit d'export distinct**, compte de secours, limitation du rythme (`PLAN_SERVEUR` §1.5 et §3) | Une appartenance **indirecte** ouvre l'accès ; le retrait du groupe le coupe **et invalide les sessions en cours**, pas seulement la connexion suivante. Le compte de secours est journalisé à chaque usage. |
| API | Application des droits à chaque requête, contrôle d'authentification et limitation de rythme en **`onRequest`, avant l'analyse du corps** (**E4**), droit d'appel de la reprise (**E3**), alimentation de l'annuaire `personnes` depuis l'AD | Un corps volumineux non authentifié est refusé **sans que son analyse ait été payée** : la mesure de ~160 ms pour 18,6 Mo relevée à S2 doit s'effondrer. Aucune route ne pose le drapeau d'administration sans l'avoir décidé d'après la session (**E2**). |
| FRONT | Écran de connexion dans la **porte de démarrage existante** — `Vault.boot` établit déjà la liaison au serveur avant l'affichage —, traitement des `401`/`403`, expiration de session sans perte de saisie | Une session expirée pendant une saisie ne détruit pas la saisie. L'application **ne démarre pas** sur un jeu vide si le serveur refuse : la règle posée en vague 2 tient. |
| MODULES · OUTILLAGE | **Le filet de non-régression des 26 modules** (constat **Q-16**) — il n'en existe aucun, et vingt-trois entrées du journal affirment le contraire | Le protocole est **comportemental**, pas textuel : afficher chaque route de liste, forcer un renommage d'un enregistrement affiché, cliquer la première ligne, exiger que la navigation atteigne le **nouvel** identifiant. Une expression régulière rendrait des faux négatifs — distinguer un identifiant capturé en fermeture d'un identifiant lu dans le DOM demande une analyse de portée. Épingle du même geste la convention du DOM et l'affirmation non vérifiée de `recalerBalisage` |
| MODULES | Ce que les droits rendent conditionnel dans l'interface : entrées de menu, boutons d'écriture, **bouton d'export** | Un profil *Direction* (lecture, Groupe) ne se voit proposer aucune action d'écriture — et l'interface n'est **pas** la barrière : le serveur refuse aussi. |
| OUTILLAGE | Annuaire LDAP simulé pour la recette (aucun AD réel en développement), et le banc qui exerce les trois axes | Chaque profil du `PLAN_SERVEUR` §3.2 est exercé sur ses domaines **et sur ceux qu'il ne doit pas voir**. Un garde-fou se vérifie dans les deux sens (§20.2). |
| DÉPLOIEMENT | Variables de configuration LDAPS, autorité de certification interne, procédure de création des groupes AD **prête à exécuter** (`PLAN_SERVEUR` §3.4) | La liste des groupes est engendrée depuis la configuration des filiales, pas écrite à la main (§19.5). |

> ⚠️ **Le numéro de migration de ce tableau disait `005` ; il dit `007` depuis l'ouverture de la
> vague.** `005_controles_schema.sql` et `006_entropie_et_commentaires.sql` ont été écrites
> *pendant* la porte S2, pour fermer des constats, et elles sont **appliquées** — le §23 interdit
> de les réécrire. C'est le motif que ce chantier traque depuis dix occurrences : une décision
> prise ailleurs rend fausse la phrase d'un autre document, et personne ne relit celle-ci parce
> qu'elle décrit un travail qui n'a pas commencé. Une session neuve aurait écrit `005_`, et
> `migrate.mjs` serait sorti en **code 4** sur l'empreinte du fichier existant.

### Le découpage en cinq agents — arbitrage d'ouverture

Le tableau ci-dessus énumère **neuf lignes de livrable pour sept rôles**, ce qui n'est pas un
découpage d'agents : le §2 bis en veut trois à cinq, avec des périmètres disjoints. Les voici,
avec ce qui a décidé chaque regroupement — un regroupement se justifie par le **défaut qu'il
évite**, jamais par la commodité.

| Agent | Rôles | Périmètre d'écriture | Pourquoi ce regroupement |
|---|---|---|---|
| **A1 — Socle d'authentification** | AUTH + SCHEMA | `backend/src/auth/**`, `backend/src/droits/**`, `backend/db/migrations/007_*.sql`, `backend/test/auth/**`, `backend/test/droits/**` | **E1 est une propriété qui vit entre deux fichiers** : les politiques d'écriture du substrat de session (SQL) et la transaction qui pose `grc.authentification` (TypeScript) n'ont de sens qu'ensemble. Les confier à deux agents, c'est reproduire délibérément le défaut du 5ᵉ passage de S2 — *deux fichiers dont aucun n'a tort seul* |
| **A2 — Application des droits** | API | `backend/src/api/**`, `backend/src/entites/**`, `backend/src/db/**`, `backend/test/api/**` | E2, E3, E4 sont toutes des propriétés **du point d'entrée**, pas du modèle de droits : elles se tiennent là où la requête arrive. A2 *consomme* l'interface `ResolveurPerimetre` qu'A1 implémente ; il ne l'écrit pas |
| **A3 — Connexion et interface conditionnelle** | FRONT + MODULES | `cyber-gouvernance_V4/js/core/**`, `js/services/**`, `js/modules/**`, `js/app.js`, `backend/test/navigateur/**` | L'écran de connexion (FRONT) et ce que les droits rendent conditionnel (MODULES) partagent le **même objet de session** et le même traitement des `401`/`403`. Séparés, les deux moitiés divergent sur ce que « non autorisé » veut dire à l'écran |
| **A4 — Annuaire simulé et filets** | OUTILLAGE | `backend/test/annuaire/**`, `backend/test/modules/**`, `backend/test/aide/**`, `backend/test/base/**`, `backend/test/depot/**`, `backend/test/documentation/**`, `backend/test/deploiement/**`, `backend/db/migrate.mjs`, `backend/db/verifier_*.sql`, `backend/db/dev/**` | **L'annuaire simulé ne va pas chez A1, et c'est le point.** Un agent qui écrit son client LDAP *et* le serveur qu'il interroge se trompe deux fois de la même façon, et le banc reste vert : c'est le défaut mesuré en **Q-61**, où un essai éprouvait sa propre réécriture |
| **A5 — Déploiement LDAPS** | DÉPLOIEMENT | `backend/deploy/**`, `cyber-gouvernance_V4/index.html` | Périmètre déjà disjoint, et la seule famille d'essais que le dépôt joue contre un Apache réel |

**Le modèle, par agent — décision manquante du lancement, écrite le 03/09.** Les cinq de la
vague 3 ont été lancés en héritant `opus`, sans que le choix soit fait : c'est le §2 bis
(« Économiser sans perdre en qualité ») non appliqué, et la session a fini par atteindre sa
limite d'utilisation, coupant quatre agents en pleine écriture. Pour la suite :

| Agent | Modèle | Motif |
|---|---|---|
| **A1** socle d'authentification · **A2** application des droits | `opus`, **jamais dégradé** | authentification et droits — deux des trois domaines intouchables |
| **A3** connexion et interface | `opus` | la perte de saisie est le troisième |
| **A4** filets · **A5** déploiement | `sonnet` | essais contre une spécification précise, balayage, comptage, documentation |
| **SECU** audit | `opus`, **jamais dégradé** | seul instrument qui voit les angles morts de l'orchestrateur |

⚠️ **Un agent déjà en vol se reprend, il ne se relance pas** : une reprise garde son contexte,
un relancement repaie 100 000 à 200 000 jetons de ré-acquisition. Le choix du modèle se fait donc
**au lancement**, et nulle part ailleurs.

**L'audit indépendant (SECU) n'est pas un sixième agent de construction** : il est lancé après,
sur l'arbre commité, et il n'écrit que dans `docs/securite/` (§2 bis, « le point qui ne se
négocie pas »).

**Ce que l'orchestrateur garde** : les arbitrages, `docs/PLAN_EXECUTION.md`,
`backend/db/CONVENTIONS.md`, `backend/package.json`, `backend/.env.example`, et les corrections
qui tiennent en un ou deux fichiers (§2 bis).

**L'ordre de dépendance, et comment il est levé.** A1 a besoin de l'annuaire simulé qu'écrit A4.
Plutôt que de sérialiser les deux, **le contrat de l'annuaire est figé par l'orchestrateur avant
le lancement** (`CONVENTIONS.md` §25) : les deux agents codent contre le même contrat écrit, et
aucun n'attend l'autre. A2 dépend de l'interface `ResolveurPerimetre`, qui **existe déjà** et ne
change pas (`backend/src/api/session.ts`).

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

### Vague 3, second tour — la table de lancement du 03/09/2026 (soir)

**Pourquoi un second tour, et pas une vague 4.** Les cinq agents du premier tour ont livré
`src/auth/`, `src/droits/`, l'application des droits et l'annuaire simulé ; quatre d'entre eux
ont été coupés par la limite d'utilisation de la session. Le lot L3 n'est donc pas terminé, et
**il ne l'est pas au sens le plus dur du terme** : mesuré sur une installation réelle le soir du
03/09, *personne ne peut ouvrir le produit* (constats **Q-72**, refermé, et **Q-78**, ouvert).
Ce tour-ci ferme L3 pour de bon, puis ouvre L5.

**La passe de préparation, jouée avant de créer le moindre agent** (§2 bis). Question posée pour
chacun — *de quoi a-t-il besoin qui n'existe pas encore dans le dépôt ?* — et réponse écrite :

| Agent envisagé | Ce qui lui manquait | Traitement |
|---|---|---|
| **B1** droits et authentification | rien : `DroitsSession.niveaux` **existe déjà** (`src/api/droits.ts:166`) et le consommateur le lit (`:283`) | part |
| **B2** installateur | rien : l'installateur est éprouvé sur la cible réelle depuis ce soir, constats Q-74 à Q-77 | part |
| **B3** filets navigateur | **ni Playwright ni Chromium** sur la machine — il n'aurait rien pu prouver | ⚠️ **posés par l'orchestrateur avant le lancement** : `playwright` global, Chromium 151 sous `/opt/pw-browsers` |
| **B4** documentation | les chiffres réels du banc **sur cette machine** ; ceux du dépôt viennent d'un conteneur qui n'existe plus | ⚠️ **banc rejoué par l'orchestrateur avant le lancement**, chiffres fournis dans le brief |

C'est le point du §2 bis — *« l'outillage manquant est le vrai premier agent »* — et il a mordu :
deux agents sur quatre auraient travaillé contre un décor.

| Agent | Modèle | Périmètre d'écriture | Ce qu'il ferme | Comment il prouve |
|---|---|---|---|---|
| **B1 — Droits, secours, connexion** | `opus`, **jamais dégradé** | `backend/src/droits/**`, `backend/src/auth/**`, `backend/src/config/index.ts`, `backend/test/droits/**`, `backend/test/auth/**` | **Q-66** (bloquant), **Q-79**, **Q-70**, **Q-73**, **Q-85** — plus **les essais des trois correctifs de la nuit du 03 au 04/09** (**Q-83** contextes de nommage, **Q-84** session provisoire, **Q-72** garde du compte de secours) : ils sont mesurés en vol contre un AD réel et **n'ont aucun essai**, ce que le dépôt refuse depuis le 3ᵉ passage de S2 | `groupes_ad` cesse d'être vide après une installation ; un profil **Qualité** est refusé en écriture sur `conformite` et accepté en contribution sur `audits` **dans la même session** ; `POST /api/connexion` rend **401** pour tout identifiant inconnu, comme pour le compte de secours. **Morsures obligatoires** — droits et authentification sont deux des trois domaines que le §2 bis ne négocie pas |
| **B2 — L'installateur ne ment plus** | `sonnet` | `backend/deploy/**`, `backend/test/deploiement/**` | **Q-75**, **Q-76**, **Q-58** | un contrôle **qui n'a pas pu être joué** cesse d'être indiscernable d'un contrôle réussi ; `SERVEUR_URL_PUBLIQUE` et le `ServerName` du vhost sont confrontés **en interrogeant**, pas en comparant deux chaînes. Mutation : désaligner le nom d'hôte doit faire parler l'installation |
| **B3 — Le filet des 26 modules** | `sonnet` | `backend/test/navigateur/**`, `backend/test/modules/**`, `backend/test/aide/**`, `backend/test/depot/**` | **Q-16**, **Q-64**, **Q-60**, **Q-61**, **Q-62** | protocole **comportemental**, jamais textuel : afficher chaque route de liste, forcer un renommage, cliquer la première ligne, exiger que la navigation atteigne le **nouvel** identifiant. Les deux sous-essais de course rendent le **même verdict sur 20 exécutions** |
| **B4 — Les chiffres redeviennent vrais** | `sonnet` | `backend/README.md`, `CHANGELOG.md`, `backend/test/documentation/**` | **Q-77**, **Q-53**, **Q-4** (7ᵉ signalement) | plus aucun nombre du `README` ne diverge du réel, et `test/documentation/` le **garde** au lieu de compter sur la discipline d'un agent |
| **SECU — audit indépendant** | `opus`, **jamais dégradé** | `docs/securite/` **uniquement** | — | lancé **après** les quatre, sur l'arbre commité. Son verdict **trie** (§0 bis) ; il n'écrit aucune ligne de produit |

> ⚠️ **Table révisée dans la nuit du 03 au 04/09/2026, après la recette sur machine réelle.**
> Cinq constats qu'elle confiait aux agents ont été **fermés par l'orchestrateur** entre-temps —
> **Q-72**, **Q-74**, **Q-78**, **Q-83**, **Q-84** —, tous des bloquants ou des majeurs que seul
> un bout-en-bout réel pouvait montrer, et trois d'entre eux découverts contre un **Active
> Directory Samba** monté pour l'occasion. Un agent qui les rouvrirait paierait deux fois : la
> ré-acquisition, puis la réécriture. Ce qui reste à B1 est donc **plus étroit et plus dur** —
> le sur-octroi par domaine, et les essais des correctifs de la nuit.

**Dépendances vérifiées, une par une.** Aucun des quatre n'attend la sortie d'un autre : B1
consomme une interface **déjà publiée** et ne l'écrit pas ; B2, B3 et B4 ne touchent ni `src/`
ni les mêmes familles d'essais. Les seules dépendances réelles étaient les deux prérequis
d'outillage ci-dessus, et ils sont levés. Les périmètres sont disjoints **au fichier près** —
`src/api/**` n'appartient à personne ce tour-ci, et `src/serveur.ts` reste à l'orchestrateur
(constat **Q-71**).

### Vague 3, troisième tour — L5, le journal d'audit — table du 04/09/2026

**Ce tour-ci ouvre L5 et rien d'autre.** L3 est construit, mesuré de bout en bout contre un
Active Directory réel, et la porte S3 a trié ses constats. Ce qui reste de L3 au registre relève
de la troisième classe du §0 bis, ou de reports datés.

#### La passe de préparation, jouée AVANT de créer le moindre agent (§2 bis)

Question posée pour chacun — *de quoi a-t-il besoin qui n'existe pas encore dans le dépôt ?* —
et réponse écrite. **Cinq réponses sur cinq n'étaient pas « rien ».**

| Agent envisagé | Ce qui lui manquait | Traitement — **fait par l'orchestrateur avant le lancement** |
|---|---|---|
| **J1** couverture | le **vocabulaire d'émission** : quelle opération émet quelle action, ce qu'on met dans `valeurs_avant`/`valeurs_apres`, et dans quelle transaction | ⚠️ **contrat écrit** — `CONVENTIONS.md` §29.2 à §29.6. Sans lui, J1 invente une convention que J2 et J3 réinventeront autrement |
| **J2** lecture et cloisonnement | le **contrat HTTP** des trois routes, et surtout **qui lit quoi** après le resserrement E6 — un arbitrage, pas un détail d'implémentation | ⚠️ **contrat écrit** — §29.7 (le tableau des trois cas, dont `filiale_id is null`) et §29.8 |
| **J2** et **J3** ensemble | une **couture** dans `src/api/index.ts` : sans elle, les deux agents écrivent dans le même fichier, ce que le §2 interdit | ⚠️ **`src/api/journal.ts` créé et enregistré** — greffon vide, contrat en entête. Le motif `ResolveurPerimetre` de la vague 2 |
| **J2** et **J3** ensemble | le **domaine** sous lequel la consultation se décide. `journal` se projetait sur `administration` : un profil chargé des paramètres aurait lu trois ans d'identités | ⚠️ **arbitrage pris et mordu** — quatorzième domaine de décision, `src/api/droits.ts` + `src/droits/passerelle-api.ts`. La morsure est dans `test/droits/vocabulaire.test.mjs` |
| **tous** | des **chiffres de banc vrais sur cette machine** | ⚠️ **banc rejoué deux fois** — voir ci-dessous, et la première exécution a démenti la documentation |

**Ce que la passe a coûté et rapporté, mesuré.** Elle a pris moins de temps qu'un aller-retour
d'agent, et elle a sorti **trois défauts que personne ne cherchait** :

1. `TOUS_LES_DOMAINES` portait le commentaire *« dérivés du type — jamais recopiés »* et était
   une **liste recopiée à la main**, typée `readonly DomaineFonctionnel[]` — un type qui admet
   tout sous-ensemble. Une omission y était **silencieuse**. Passée en `Record` exhaustif : elle
   fait désormais échouer la compilation (`CLAUDE.md` §3, premier cas du tableau).
2. Le banc n'est **pas** à 1030/1030 en toutes circonstances : la première exécution a rendu
   **1029 passés, 1 échec** sur `test/api/bornes-reprise.test.mjs` (« POOL SATURÉ »), verte au
   rejeu isolé trois fois de suite et verte à la seconde exécution complète. C'est un essai
   **instable**, et un essai instable est pire qu'un essai absent : il apprend à rejouer jusqu'au
   vert, ce qui est exactement la façon dont un vrai défaut se fait congédier. Inscrit **Q-105**.
3. Le garde-fou écrit pour Q-91 a mordu **son propre auteur, deux fois** — voir le constat.

#### La table de lancement — aucune case vide (§2 bis)

| Agent | Modèle | Périmètre d'écriture | Ce dont il a besoin, et **où c'est écrit** | Comment il prouve |
|---|---|---|---|---|
| **J1 — Chaque geste laisse une trace** | `opus`, **jamais dégradé** | `backend/src/auth/journal.ts`, `backend/src/entites/index.ts`, `backend/src/api/index.ts`, `backend/src/serveur.ts`, `backend/test/journal/**` | vocabulaire et transaction : `CONVENTIONS.md` **§29.2 à §29.6**. Les coutures existent déjà : chaque route porte un `requete.log.info` disant « le journal d'audit est le lot L5 » | le compte d'actions **réellement émises** passe de 4 à 16 sur 20, mesuré en base et non en lisant le code. L'essai **découvre** les sites d'émission au lieu d'en tenir la liste. **Morsures obligatoires** : retirer la journalisation de l'export doit rendre rouge (2ᵉ classe du §0 bis), de même pour la suppression |
| **J2 — Le journal se lit, se cloisonne et se vérifie** | `opus`, **jamais dégradé** | `backend/db/migrations/008_journal_lecture.sql`, `backend/src/api/journal.ts`, `backend/test/journal-lecture/**` | condition **E6** : `004_rls.sql` §6 écrit déjà la correction ; contrat de lecture et arbitrage des trois cas : **§29.7** ; contrat HTTP : **§29.8**. La couture est enregistrée | `grc_lecture` **cesse** de lire 159 entrées sans périmètre. **Morsures obligatoires, les deux moitiés** : retirer `security definer` doit faire échouer **toute écriture** au journal ; rouvrir la politique doit rendre la lecture non cloisonnée. Un export du journal contenant `\r\n`, `"` et `;` se ré-analyse en **une** ligne |
| **J3 — L'écran du journal, et le filet qui manquait** | `opus` | `cyber-gouvernance_V4/js/modules/journal.js`, `cyber-gouvernance_V4/index.html`, `cyber-gouvernance_V4/js/app.js`, `backend/test/navigateur/journal.test.mjs`, `backend/test/navigateur/droits.test.mjs` | contrat HTTP : **§29.8** ; le domaine `journal` est **déjà déclaré** des deux côtés (`js/core/api.js`, `DOMAINE_PAR_ROUTE`) ; l'entonnoir d'export est `Droits.exigerExport()` | ferme **Q-92** : un profil qui **peut écrire** et **ne peut pas exporter** est éprouvé — c'est la combinaison qui a laissé passer Q-89, et que le filet actuel n'exerce jamais. Un profil sans `journal` ne voit pas l'entrée de menu **et** reçoit un refus du serveur |
| **J4 — La documentation cesse de nier** | `sonnet` | `backend/README.md`, `CHANGELOG.md`, `backend/test/documentation/**` | ferme **Q-90** : le `README` §8 déclare **ouvertes** cinq propriétés que L3 a livrées, et le §5 se contredit dans la même section. Chiffres du banc fournis dans le brief, mesurés le 04/09 | plus aucun nombre du `README` ne diverge du réel, et `test/documentation/` le **garde** au lieu de compter sur la discipline |
| **SECU — porte S4** | `opus`, **jamais dégradé** | `docs/securite/` **uniquement** | — | lancé **après** les quatre, sur l'arbre commité. Son verdict **trie** (§0 bis) ; il n'écrit aucune ligne de produit |

#### Dépendances vérifiées, une par une (§2 bis, « disjoint ne suffit pas »)

1. **Périmètres disjoints au fichier près** : oui. `src/api/index.ts` est à J1 seul ;
   `src/api/journal.ts` à J2 seul ; `db/migrations/008_*` à J2 seul. `test/depot/**`,
   `test/aide/**`, `.env.example`, `CONVENTIONS.md` et ce document restent à l'orchestrateur.
2. **Aucun n'attend la sortie d'un autre** : J1 émet, J2 lit, et **les deux contrats sont écrits
   avant le lancement**. J3 code contre §29.8. J4 est indépendant.
3. **L'outillage existe** : Playwright et Chromium sont posés (vague 3), le banc est mesuré,
   l'AD Samba tourne, la recette est en ligne.

⚠️ **Le seul couplage réel est la base, et il est nommé.** J2 resserre la lecture du journal
pendant que J1 écrit des essais qui le relisent. Le contrat le dit (§29.7, dernier encadré) :
**toute lecture du journal dans un essai déclare un périmètre.** Sans cette ligne, J1 aurait
écrit des essais verts que la migration de J2 aurait rendus rouges après coup — une course
payée au prix de deux agents.

⚠️ **Ce que J1 et J2 ne doivent pas croire acquis.** L'inaltérabilité du journal est éprouvée ;
sa **couverture** ne l'est pas, et un journal inaltérable et incomplet prouve moins qu'il n'en a
l'air. C'est la formulation exacte de ce que la porte S3 a mesuré.


### Vague 4 — L4 multi-filiales et L6 pièces jointes

> **Conduite arbitrée par l'utilisateur le 04/09/2026**, sur la décomposition en jetons de
> la vague L5 (§2 bis, « le rendement au jeton ») :
>
> 1. **Construction en parallèle**, périmètres disjoints — le poste le plus rentable, inchangé.
> 2. **Pas de documentation déléguée.** L'orchestrateur l'écrit à la clôture ; il a déjà le
>    contexte, l'agent devrait l'acheter. C'est ce qui a coûté 412 041 jetons à la vague L5.
> 3. **On travaille pendant que l'auditeur tourne** — il n'écrit que dans `docs/securite/`.
>    Cible : les constats `V1.1` du registre, et les contrats de la vague suivante.
> 4. **Correction post-audit en parallèle** : 2 à 3 agents groupés **par domaine**, jamais un
>    par constat. L'orchestrateur garde les arbitrages et ce qui tient en deux fichiers.
> 5. **Banc complet au pré-commit seulement** ; les familles touchées pendant le travail.
> 6. **Le modèle se choisit au lancement, jamais après** — un agent en vol se *reprend*, il ne
>    se relance pas : un relancement repaie 100 à 200 k de ré-acquisition.

#### Le modèle par agent — décidé maintenant, sur le critère du §2 bis

| Agent | Modèle | Motif |
|---|---|---|
| **L4 — cloisonnement multi-filiales**, sélecteur de filiale, consolidation Groupe, création de filiale | `opus`, **jamais dégradé** | le cloisonnement est l'une des trois promesses centrales du produit, et le §2 bis l'inscrit nommément parmi les domaines intouchables. Un cloisonnement faux **ne se voit pas à l'exécution** |
| **L6 — la chaîne d'analyse antivirale** : les 8 contrôles du `PLAN_SERVEUR` §1.6, ClamAV, empreinte SHA-256, quarantaine | `opus` | un fichier hostile qui traverse est une compromission de poste, pas un défaut d'affichage. Domaine à pièges au sens strict |
| **L6 — quotas, stockage, cycle de vie des pièces** | `sonnet` | la réflexion est dans la spécification ; l'agent l'exécute, et l'échec est bruyant (un quota faux se compte) |
| **Filets d'essai contre une spécification précise** | `sonnet` | ⚠️ à condition que le brief porte le protocole **comportemental**, pas « écris des tests » |
| **SECU — audit de la porte S5** | `opus`, **jamais dégradé** | seul instrument qui voit les angles morts de l'orchestrateur. Sur L5 : 336 063 jetons, une fuite de données que trois agents **et l'orchestrateur** n'avaient pas vue |
| **Documentation d'état** | — | **ne se délègue pas** (§2 bis, « le rendement au jeton ») |

**Ce que cela donne** : deux `opus` là où l'erreur est silencieuse, deux `sonnet` là où elle
est bruyante, zéro agent de documentation. À qualité constante, l'économie vient d'abord des
**briefs qui extraient au lieu d'envoyer lire** — c'est le levier sur le *nombre* de jetons —
et ensuite seulement du modèle, qui agit sur leur *prix*.


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

   > ⚠️ **La passe de documentation est une étape de la fermeture de porte, pas une demande après
   > coup.** Le constat Q-4 a été signalé **six fois** par six auditeurs successifs, et « inattention »
   > ne l'explique pas : *entre deux passages de porte, ce document vieillit plus vite que le code*.
   > Le compte d'essais a fait 505 → 534 → 564 → 615 en une journée, et une famille entière est
   > apparue. Tant que la remise à jour est demandée **après** le verdict, le signalement suivant est
   > déjà écrit. Elle se joue donc **avec** le rejeu de la grille, au même titre — et l'auditeur qui
   > trouve un chiffre faux le compte comme un constat, pas comme une coquille : un exploitant qui
   > vérifie une installation compare ce chiffre au réel, et faux, il ne mesure plus rien — pire,
   > il rassure.
7. **C'est dans le périmètre** — aucun fichier modifié hors de la propriété de l'agent (§2).
8. **Les manques sont dits** — ce qui n'a pas été fait est listé explicitement, pas passé sous
   silence. Un lot partiel annoncé comme tel vaut mieux qu'un lot complet qui ne l'est pas.

---

## 6. Environnement de vérification

> ⚠️ **RÉÉCRIT LE 04/09/2026, et l'écart valait la peine d'être mesuré.** Ce paragraphe
> décrivait « une machine de développement » distincte, portant **PostgreSQL 16**, sans
> **« ni Active Directory, ni ClamAV, ni relais SMTP »**, et prescrivait de recetter L3, L6
> et L12 « sur des doublures ». **Les quatre affirmations sont fausses.** La référence
> complète est au `CLAUDE.md` **§0** ; ce qui suit en est le nécessaire.

Il n'y a **pas** de machine de développement séparée. L'agent s'exécute **sur le VPS
lui-même** (`SRV-Infra`, Debian 13, IP publique), où tournent le dépôt, la base, le serveur,
Apache et l'annuaire. Tant qu'une session existe, son environnement lui est accessible.

| Ce que disait ce §6 | Ce qui est mesuré |
|---|---|
| « PostgreSQL 16, la cible est 17 » | **PostgreSQL 17.11** (PGDG), cluster `17/main` en ligne. `install.sh` l'installe déjà. **Aucune réserve de version à porter** |
| « ni Active Directory » | contrôleur **Samba réel** (`grc-ad`), realm `EXEMPLE.INTERNE`, LDAPS `127.0.0.1:1636`, 12 comptes, 23 groupes `GRC-*` — et **modifiable** : `samba-tool user`/`group` fonctionnent |
| « ni ClamAV » | `clamav-daemon` **actif** |
| « ni relais SMTP » | sortie **587 vers `smtp.office365.com`** → bannière `220 … Microsoft ESMTP MAIL Service ready` |

**Ce que cela change pour la conduite des vagues** : L3 n'a plus à se recetter sur une
doublure — il tourne contre un AD réel, et c'est ce qui a fait tomber le constat **Q-83**
qu'aucune doublure ne pouvait montrer (*« une doublure n'émet que ce que son auteur a
prévu »*). L6 et L12 disposent de ClamAV et d'une sortie SMTP éprouvée.

```bash
# La recette tourne en permanence — on ne la remonte pas, on s'y branche.
cd backend && set -a && source ~/.grc-essais.env && set +a && npm test

# Base neuve par fichier d'essai : chaque test appelle le vrai db/migrate.mjs.
# ⚠️ NE JAMAIS jouer db/dev/preparer_base_dev.sh sur ce VPS : il ramènerait les
#    mots de passe des rôles à « dev » et casserait le service installé.
```

**La seule limite connue** : `npm audit --omit=dev` échoue (contrôle **S15 non rejoué**, ce
qui ne vaut pas « passé ») — non par absence de réseau, mais parce que le point d'accès aux
avis de npm rend 503 ou reste sans réponse. Détail et mesures au `CLAUDE.md` §0.3.

⚠️ **Avant d'écrire qu'une chose est impossible ici, essayez-la.** Trois réserves fausses ont
coûté du travail dans la seule journée du 04/09 — constats **Q-128** et **Q-129**.

---

## 7. Journal d'avancement

| Vague | Lots | État | Porte |
|---|---|---|---|
| — | L0 socle d'infrastructure | ✅ livré | — |
| **V1** | L1 schéma relationnel | ✅ **livré, porte S1 franchie** au 5ᵉ passage, **confirmée au 6ᵉ** | S1 |
| **V2** | L2 API et bascule | ⚠️ **livré ; porte S2 jouée NEUF fois** — franchie au 4ᵉ, refusée aux 5ᵉ, 6ᵉ, 7ᵉ, 8ᵉ et 9ᵉ. Le 9ᵉ : 0 bloquant, 4 majeurs, 6 mineurs, contrôles S12 et S18 en échec. **La porte ne se rejoue plus jusqu'au vert** : l'arbitrage du 03/09 (§0 bis) remplace le veto par un **tri**, et les constats restants relèvent de la troisième classe ou de reports déjà datés | S2 |
| **V3** | L3 authentification, L5 journal | 🟡 **construite ; porte S3 jouée une fois le 04/09/2026, refusée** — 0 bloquant de fuite entre filiales, **2 bloquants des classes dures** (Q-88, Q-89), 15 constats neufs, S7 et S18 en échec. Les deux bloquants sont **corrigés et mordus le jour même**. Sous l'arbitrage du §0 bis, la porte **trie** : le reste est inscrit et daté. **L5 (journal) construit le 04/09/2026, non encore soumis à sa porte** | S3, puis **S4** |
| **V3 · L5** | Journal d'audit — couverture, cloisonnement, consultation | 🟡 **livré ; porte S4 jouée le 04/09/2026 et REFUSÉE** — dix constats (**Q-118 → Q-127**), dont **un de la classe « fuite de données »** : `verification?depuis=N` était un oracle sur la chronologie du groupe (11 maillons hors périmètre reconstruits sur 14). Sous le tri du §0 bis : **la classe dure et cinq majeurs corrigés et mordus**, cinq mineurs datés `V1.1`. Le cœur tient et c'est mesuré — ajout seul survivant au `security definer` (quatre couches), cloisonnement **par ligne** conforme au §29.7, chaînage à 0 anomalie, et **premier parcours complet de bout en bout** : Chromium → Apache → AD réel → PostgreSQL, sans une violation de CSP. Banc **1143/1143** | **S4** |
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
| **S2** (7ᵉ) | 01/09/2026 | ❌ **refusée** — **1 bloquant**, 2 majeurs, 3 mineurs. S17 et S18 en échec. **L'auditeur a installé Apache et rsync**, ce que six passages n'avaient pas fait : la liste blanche du vhost — correctif accepté au 6ᵉ — rend **403 sur `/`**, et l'application est injoignable à son URL d'entrée. Le reste tient : 111 sondes hostiles sans effet, cloisonnement 107/107 qui s'effondre proprement au sabotage, et **25 écrans derrière un Apache réel sans une seule violation de CSP** — mesuré pour la première fois. | [`securite/RAPPORT_S2_SEPTIES.md`](securite/RAPPORT_S2_SEPTIES.md) |
| **S2** (8ᵉ) | 02/09/2026 | ❌ **refusée** — **0 bloquant**, 4 majeurs, 3 mineurs. S13 et S17 en échec. Le lot est plus solide qu'à aucun passage : **17 fermetures rejouées par mutation, 17 morsures, zéro exception**, y compris les trois que le 7ᵉ avait trouvées vertes. Mais `LimitRequestBody` **ne s'applique pas à `/api/`** et `install.sh` imprime « ok » en comparant deux nombres dont l'un n'agit pas ; le banc rend **614/628 sur machine propre**, une famille entière dépendant d'une entrée `/etc/hosts` que rien ne pose ; et **le registre lui-même avait perdu la ligne d'un bloquant** — 42 constats affichés au lieu de 43, par mon propre correctif. La politique TLS livrée est mesurée pour la première fois. | [`securite/RAPPORT_S2_OCTIES.md`](securite/RAPPORT_S2_OCTIES.md) |
| **S2** (9ᵉ) | 02/09/2026 | ❌ **refusée** — **0 bloquant**, 4 majeurs, 6 mineurs. **S12 et S18 en échec.** L'auditeur a fait **pour la première fois la jonction que S17 réclame, en une seule pièce** : Chromium réel → Apache réel sur le vhost du dépôt → serveur réel → PostgreSQL, 0 erreur, 0 violation de CSP. 157 sondes de périmètre sans dérive, 30 formes d'injection, journal en ajout seul refusé **au propriétaire**. Mais le bandeau nomme un geste que le correctif ne couvre pas — **troisième tour du même défaut** —, l'erreur brute de l'analyseur JSON fuit en production, et **deux garde-fous posés le jour même sont contournés**, dont celui du registre. | [`securite/RAPPORT_S2_NONIES.md`](securite/RAPPORT_S2_NONIES.md) |
| **S3** | 04/09/2026 | ❌ **refusée** — **0 bloquant de fuite entre filiales**, mais **2 bloquants des classes dures** et **15 constats neufs** (Q-88 → Q-102). **S7 et S18 en échec.** Le cœur du lot tient et c'est mesuré : cloisonnement **48/48 en `force RLS`**, périmètre serveur inviolable, AD **réel** fonctionnel — groupes imbriqués compris —, droits à trois axes qui mordent, banc **1028/1028** rejoué deux fois. ⚠️ **Première fois sur ce chantier : les 17 constats fermés la veille ont TOUS tenu sous la mutation.** Les deux bloquants sont ailleurs, et tous deux invisibles à la lecture : **Q-88**, l'annuaire `personnes` jamais alimenté depuis l'AD — **0 ligne après sept connexions réelles**, parce que la route de connexion est `publique` et que le crochet rend la main avant l'étape qui alimente ; et **Q-89**, le droit d'export contourné depuis l'interface — **38 213 octets** de « Synthèse Direction », marquée *Document confidentiel*, téléchargés par un compte AD sans droit d'export, sur le seul des douze sites qui ne passe pas par l'entonnoir. Les deux sont corrigés et mordus le jour même | [`securite/RAPPORT_S3.md`](securite/RAPPORT_S3.md) |

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
- **Le commit d'instantané n'est pas une formalité de fin de tour — c'est un filet.** Un agent a
  détruit son propre travail non commité par un `git checkout` réflexe, après l'échec d'un script
  qui n'avait pourtant rien écrit. Deux blocs voisins ont survécu **parce qu'ils avaient été
  commités** ; le troisième a été perdu et réécrit. Dans un dépôt où plusieurs sessions
  travaillent, un instantané vert et honnêtement titré coûte une minute et rachète une heure.
  Corollaire pour les agents : **`git checkout` sur un fichier suivi n'est jamais un réflexe**, et
  l'échec d'un script d'édition n'est pas une preuve qu'il a écrit.
- **Ne pas lancer les correctifs avant que l'auditeur ait fini.** Au septième passage, j'ai
  dispatché les remèdes sur le résumé du verdict, quatre minutes avant que l'auditeur n'ait terminé
  son rapport. Trois conséquences, toutes évitables : l'arbre a bougé sous lui, une session
  concurrente a commité son propre rapport, et **une phrase qu'il venait d'écrire est devenue fausse
  dix minutes plus tard** — « Q-36 reste entier », alors que le correctif venait d'être poussé.
  C'est le motif que ce chantier traque depuis dix occurrences, et il a fini par prendre l'auditeur
  dans son propre rapport. Le §1 le disait déjà pour les vagues ; il vaut aussi pour l'intervalle
  entre un verdict et sa remise.
- **Une mesure faite après coup par l'auditeur n'est pas un rejeu de la porte.** Celui du septième
  passage a mesuré le correctif du bloquant sous un Apache réel et l'a trouvé bon — et il a **écrit
  lui-même** que cela ne vaut pas rejeu : le verdict porte sur la révision qu'il a examinée, la
  grille n'a pas été rejouée, et les constats corrigés depuis ne sont pas mesurés. *Un essai qui
  existe ne prouve rien tant qu'on n'a pas montré qu'il rougit sous la mutation qui l'a motivé.*
- **Un banc vert sur l'arbre de travail ne dit rien du commit.** J'ai figé une quinzaine
  d'« instantanés vérifiés » en écrivant à chaque fois « mesurable et vert » — et je mesurais
  l'**arbre**, où vivaient aussi les fichiers non commités des agents. La révision `fde4d35`
  commitait un fichier d'essai appelant une fonction définie dans un fichier que je n'avais pas
  commité : **à cette révision seule, il ne s'importait pas**. C'est l'agent qui me l'a signalé.
  La faute est exactement celle que ce chantier traque depuis le premier passage — *mesurer ce qui
  est commode plutôt que ce qu'on affirme* —, et je l'ai commise une quinzaine de fois en la
  reprochant aux autres le même jour. Le contrôle est pourtant à trois lignes : pour chaque fichier
  **suivi**, vérifier que ses imports relatifs désignent des chemins **présents dans le commit**.
  Écrit et joué : 66 fichiers, aucun orphelin — mais joué *après*, ce qui ne vaut pas mieux qu'un
  banc vert dont personne n'a saboté les essais.
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

**Le tri du 03/09/2026, qui a ouvert la vague 3.** L'arbitrage du §0 bis remplace le veto de la
porte par un tri en trois classes. Il a été appliqué constat par constat, et voici ce qu'il a
donné — c'est le geste qui ouvre la vague, pas une formalité :

- **Aucun constat ouvert ne relève des deux premières classes.** Ni « bloque le fonctionnement »,
  ni « fuite ou perte de données ». Le 9ᵉ passage est sans bloquant, les deux qui portaient une
  perte de saisie (**Q-29**, **Q-57**) sont fermés, et le cloisonnement rend 107/107.
- **Cinq constats deviennent des livrables de la vague 3** : Q-10 (E4), Q-16, Q-53, Q-60, Q-61,
  Q-62 — plus **Q-64 en priorité**, parce qu'un banc intermittent est un banc qu'on cesse de lire.
- **Quatre passent en `V1.1`** : Q-11, Q-23, Q-28, Q-65. Chacun est *documenté* et coûte plus
  cher à fermer qu'il ne coûte ouvert ; aucun ne ment sur ce que fait le produit.
- **Trois forment une famille dont l'échéance devient mesurable** : Q-44, Q-51, Q-58 — le corps
  `chunked` sans borne au frontal. L'authentification en `onRequest` retire le cas anonyme ;
  la mesure est **à refaire après E4**, et le report reconduit ou fermé par écrit.
- **Deux étaient périmés et sont corrigés ici** : **Q-54** (le garde-fou existait depuis le 02/09,
  rejoué par mutation le 03/09 — dix lignes de queue retirées, l'essai les nomme) et **Q-59**
  (637 puis 640 annoncés, **651 mesurés**).

Ce que ce tri ne fait pas : il ne ferme rien qui ne soit pas fermé. Un constat marqué `V1.1`
**reste au tableau**, avec son propriétaire ; il n'en sort qu'une fois corrigé et rejoué.

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
| **Q-10** | ~160 ms d'analyse de corps avant toute décision, sans authentification. Ce n'est pas propre à la reprise : le remède est un contrôle en `onRequest`, avec la limitation de rythme | 🔵 mineur | **lot L3** | fermé le 04/09 | ✅ **corrigé et MESURÉ le 04/09/2026, sur la chaîne réelle** — 18 Mo envoyés à `POST /api/reprise` à travers Apache : **anonyme 70–98 ms (401)**, **authentifié 302–382 ms (400)**. L'analyse du corps coûte donc ~250 ms, et un appelant non authentifié **ne la paie pas** — l'effondrement qu'exigeait E4, mesuré par **comparaison** plutôt que par une valeur absolue. ⚠️ **Ce constat était clos EN FAIT depuis la vague 3 et le registre disait « ouvert »** : E4 est implémentée (crochet `onRequest`) et éprouvée (`test/api/droits-application.test.mjs`). Le registre est « la seule source des verdicts » : il ne peut pas être en retard sur le produit |
| **Q-11** | Le repli d'`applyImport` réintroduit un renommage global quand le serveur ne porte pas `/api/reprise` : chemin atteignable seulement lors d'un retour arrière. À défaut de le fermer, le dire dans le code | 🔵 mineur | agent **FRONT** | `V1.1` | ◐ **documenté, non fermé** → **`V1.1`** (§0 bis, 3ᵉ classe) — fermer exigerait une liste de champs tenue à la main, refusée au `CLAUDE.md` §3 (b) ; le bandeau compte désormais les réécritures hors de l'enregistrement renommé |
| **Q-12** | L'en-tête de `js/core/vault.js` justifie la neutralisation du coffre par le fait que « **cinq autres fonctions du coffre sont appelées par `js/modules/settings.js`** » — or `settings.js` n'y fait plus aucune référence, et `Vault.boot` dans `js/app.js` est le seul appel subsistant dans toute la SPA. La décision reste juste ; sa justification écrite ne l'est plus. **Neuvième occurrence du motif « le remède rend fausse la phrase d'un autre fichier »** — cette fois entre deux périmètres d'agents, ce qui est précisément le cas que la propriété exclusive des fichiers ne couvre pas | 🔵 mineur | agent **FRONT** | avec Q-8 | ✅ **corrigé** — attend le rejeu (trois occurrences, dont une trouvée en lisant) |
| **Q-13** | **Le générateur d'identifiants de la reprise n'avait que MILLE valeurs d'aléa** (`src/reprise/index.ts:513`). Présumé bloquant, **établi majeur par la mesure** : la sortie de `scinderMesures` n'atteint jamais la base — `appliquerReprise` refait la scission côté serveur et n'en retient qu'un compte. Le chemin qui écrivait vraiment est l'autre : sur 250 enregistrements **sans identifiant**, `resoudreIdentifiant` en engendrait **231 distincts**, et la reprise partait en 400 en reprochant au fichier un doublon que le serveur venait de fabriquer — un export ancien légitime devenait irreprenable **une fois sur neuf**, avec un message qui accusait l'utilisateur. Rien de perdu en silence (le garde de T-2 tient), mais un déni de reprise. Remède : les deux sites **dérivent** au lieu de tirer ; il ne reste aucun générateur aléatoire dans `src/reprise/` | 🟠 majeur *(présumé bloquant, corrigé à la baisse par la mesure)* | agent **API**, périmètre élargi à `src/reprise/**` | avant la fermeture de la porte S2 | ✅ **corrigé** — attend le rejeu |
| **Q-14** | **Un garde-fou mesure une longueur là où la convention norme une entropie.** `f_verifier_entropie_identifiants()` (001) exige de `f_generer_id()` une part aléatoire d'au moins **32 caractères**. Rien ne casse aujourd'hui, `f_generer_id` étant inchangée ; mais le §2 vient d'ériger en norme le **plancher d'entropie**, et les formes serveur font 25 caractères de base 36 pour 128 bits — plus d'aléa en moins de signes. Aligner un jour le générateur SQL ferait **crier ce garde-fou à tort**. Un seuil exprimé dans la mauvaise unité est un piège qui attend son déclencheur | 🔵 mineur | **lot L5** (avec le journal, seul écrivain de `f_generer_id`) | vague 3 | ✅ **corrigé** (`006`) — le seuil est en bits ; le témoin base 36 (128 bits en 25 signes) n'est plus crié, 0/200 |
| **Q-15** | **`renommer()` réécrit en mémoire sans réarmer l'envoi.** Trouvé par le cas de Q-11, mais **le périmètre est plus large que le cas qui l'a révélé** — et le pire n'a rien à voir avec Q-11 : la création d'une mesure échoue sur une panne réseau **passagère** et part au cycle suivant ; la modification de l'action qui la cite sort dans le cycle courant avec l'identifiant local ; le renommage qui suit ne vit qu'en mémoire. **La base garde une référence pendante vers une ligne qui n'existe pas** — exactement la classe de défaut que `renommer` existe pour empêcher. Déclencheur exact : le renommage touche un enregistrement que le serveur détient déjà et que le différentiel du cycle ne contient pas | 🟠 majeur | agent **FRONT** (correctif) · agent **OUTILLAGE** (essai rouge d'abord) | avant le rejeu de la porte | ✅ **corrigé** — rouge puis vert mesurés, attend le rejeu |
| **Q-16** | **Aucune couverture de non-régression sur les 26 modules métier, alors que vingt-trois entrées du `CHANGELOG` en annoncent.** Les essais Playwright de ces chantiers ont été écrits, joués, puis **jetés avec le répertoire de travail** : `grep -rl playwright` ne rend qu'un fichier, né en vague 2. Le défaut n'est pas l'absence — c'est qu'un lecteur du journal, ou un agent qui reprend, en conclut qu'il peut modifier un module sans crainte. Corrigé **dans le journal** par annotation ; le **produit**, lui, reste sans filet | 🟠 majeur | agent **B3** | fermé le 04/09 | ✅ **corrigé et mordu** — le filet des 26 modules rend **33/33**, et il MORD : un identifiant recapturé en fermeture dans `js/modules/risques.js` le fait rougir sur « l'ancien identifiant survit après le clic » (signature N-3), restauré, vert. Protocole **comportemental** comme exigé : afficher chaque route de liste, forcer un renommage, cliquer la première ligne, exiger le NOUVEL identifiant |
| **Q-17** | ⚠️ *Divergence d'attribution, à lire avant de citer ce numéro : le rapport S2 quinquies numérote **son** Q-17 sur le **jumeau TypeScript** (`src/entites/index.ts`) et range le garde-fou SQL sous Q-14. Ce registre a fait l'inverse. Les deux existent — le SQL est ci-dessous, le TypeScript est **Q-26**.* **Le garde-fou d'entropie mesure une longueur que `padStart` rend infaillible.** Pouvoir de détection mesuré par l'auditeur : **8 sur 200 à 32 bits, 0 sur 200 à 40 bits**, pour un plancher normé à **52**. Il ne dit donc pas « le générateur est bon », il dit « la chaîne est longue » — et il le dit sous un nom qui promet l'inverse. Aggrave Q-14 : ce n'est pas un seuil dans la mauvaise unité, c'est un contrôle sans pouvoir de détection qui rend une fausse assurance | 🔵 mineur | agent **SCHEMA** | avant le 6ᵉ passage | ✅ **corrigé** (`006`) — attend le rejeu |
| **Q-18** | **Un troisième commentaire faux dans `001_socle.sql`, vivant dans le catalogue**, portant mot pour mot la justification qu'un correctif précédent a déclarée « vérifiée fausse ». Hors du périmètre de la condition **E5** et hors de portée du balayage de Q-6 : les deux ont cherché là où on savait déjà | 🔵 mineur | agent **SCHEMA** (migration neuve — `001` est appliquée, §23) | avant le 6ᵉ passage | ✅ **corrigé** (`006`) — 25 candidats, 1 coupable ; le jumeau de fichier reste faux **par construction**, §23 |
| **Q-19** | **Le déploiement livré coupe la reprise à 60 s, et le serveur valide quand même.** `ProxyTimeout 60`, `DELAI_CHARGEMENT_MS = 60000`, et une instance Fastify sans `requestTimeout` : mesuré sur un vrai port, client interrompu à 4 s → `AbortError`, **12 000 lignes en base 20 s plus tard**. L'utilisateur lit « le serveur n'a pas répondu », puis voit ses données apparaître. Seuil ≈ 36 000 enregistrements contre un plafond **annoncé par le produit** de 420 000. Le commentaire du vhost affirme le contraire de ce qui se passe. **Aucun des trois fichiers n'a tort seul** — c'est le contrôle S17 | 🟠 majeur | agent **API+DÉPLOIEMENT** (périmètre joint, voir ci-dessous) | avant le 6ᵉ passage | ✅ **corrigé** — attend le rejeu |
| **Q-20** | **Q-9 requalifié par la mesure : le report avait été accordé sur un chiffre cinq fois trop bas.** 98,9 s pour 60 000 enregistrements (registre : « 20 s »), ~11,5 min extrapolées aux plafonds annoncés. Et la conséquence n'est pas « le pool est occupé » : **dix reprises simultanées font répondre HTTP 500 à tout autre utilisateur** après 5 s d'attente. Le remède de fond reste à L7 — c'est la **gravité** et le « rien à faire d'ici là » qui sont refusés | 🟠 majeur | agent **API+DÉPLOIEMENT** (même borne que Q-19) | avant le 6ᵉ passage | ✅ **corrigé** (borne + 503) — le fond reste à L7 |
| **Q-21** | **Trois des cinq comportements que Q-3 exigeait ne sont exercés que dans le sens du silence.** Canari de doublons, signalement de rétrécissement, « le sondage qui pousse » : **neutralisés un par un, le banc reste vert 32/32**. Le `CHANGELOG` les déclare tous exercés. Quatrième occurrence du motif de Q-16 — une protection affirmée qui n'existe pas | 🟠 majeur | agent **OUTILLAGE** (essais) · agent **DOC** (la phrase) | avant le 6ᵉ passage | ✅ **corrigé** — deux essais comportementaux, le troisième structurellement inatteignable et éprouvé autrement |
| **Q-22** | **Trois renvois vers le registre ont divergé de ce qu'il dit.** (a) Q-6 (b) est annoncé reporté à L3 alors que `005` l'a fermé — un agent de la vague 3 lira **E5** comme satisfait par héritage et ne cherchera pas le troisième commentaire, qui est Q-18 ; (b) le `CONVENTIONS.md` §2 attribue à Q-3 un manque que Q-3 ne dit pas ; (c) Q-15 n'apparaît nulle part hors du registre — un lecteur du journal ne saura jamais qu'une référence pendante a pu vivre en base | 🔵 mineur | **orchestrateur** (a et b) · agent **DOC** (c) | immédiat | ✅ **corrigé** — (a) et (b) par l'orchestrateur, (c) par DOC |
| **Q-23** | **`UI.genId` n'a aucun garde-fou d'exécution**, et personne ne le porte. Le manque est réel et exact — c'est le §2 du `CONVENTIONS.md` qui l'a écrit —, mais il l'a **attribué à Q-3**, qui dit autre chose et qui est clos. Il serait donc sorti du registre avec lui, sans avoir jamais eu de propriétaire. **C'est la forme exacte que le chantier a payée deux fois**, cette fois dans mon propre document normatif | 🔵 mineur | agent **FRONT** | `V1.1` | ⚠️ **coche retirée** → **`V1.1`** (§0 bis, 3ᵉ classe) — les « deux silences » prouvaient une propriété du **produit**, pas du détecteur ; voir **Q-32** |
| **Q-24** | **`champsRefuses` n'est jamais fait parler.** Le bandeau « Champs non reconnus par le serveur, donc **non enregistrés** » dit à l'utilisateur qu'une partie de sa saisie n'a pas été gardée ; aucun essai ne vérifie qu'il le dise. Trouvé par l'agent d'outillage en cherchant, à ma demande, d'autres endroits où le banc mesure dans le sens du silence | 🔵 mineur | agent **OUTILLAGE** | avant le 6ᵉ passage | ✅ **corrigé** — attend le rejeu |
| **Q-25** | **Le refus de droit (403) n'est éprouvé que côté serveur.** `routes.test.mjs` couvre le 403 et vérifie même qu'il ne se déguise pas en `GRC03` — mais **rien n'éprouve la moitié navigateur** : `traiterEchec` doit revenir à la valeur du serveur et poser un bandeau **sans bouton de rechargement** (`rechargeable: false`), un refus de droit n'ayant rien à recharger. Même forme que Q-21 : une protection dont un seul côté est tenu. **Ce mécanisme est celui sur lequel L3 va reposer entièrement** | 🟠 majeur | agent **OUTILLAGE** | avant le 6ᵉ passage — et **condition d'entrée de fait pour L3** | ✅ **corrigé** — trois propriétés éprouvées séparément, chacune mordue |
| **Q-26** | **Le jumeau TypeScript du garde-fou d'entropie est intact** (`src/entites/index.ts`, `padStart`), et il a failli perdre son propriétaire dans mon registre : le rapport le désignait sous le numéro **Q-17**, que j'ai attribué au garde-fou SQL. Le SQL est réparé par `006` ; **le TypeScript ne l'est pas**. Ce que l'agent qui l'a mesuré offre à qui le reprendra : son `padStart` est **structurellement incapable d'échouer**, son comptage sur 20 000 tirages est aveugle dès 40 bits, et le remède qui marche est le même qu'en SQL — compter les symboles **par position** sur la sortie base 36, seuil **en bits**. **Troisième occurrence du motif de Q-23**, toujours dans le même document, toujours de ma main | 🔵 mineur | agent **API** | avant le 6ᵉ passage | ✅ **corrigé** — et le contrôle est devenu **interrogeable**, ce qui n'était pas demandé |
| **Q-27** | **Une écriture expirée est rejouée automatiquement, et sur une CRÉATION cela produit une ligne en double, en silence.** `estPassagere()` est vraie pour une expiration, donc `sync.js` réessaie. Mesuré quand le serveur avait en fait validé : écran **1**, base **2**, `enAttente=false`, **bandeau vide** — le produit annonce que tout est enregistré. La modification et la suppression sont protégées (le rejeu tombe sur `conflit_version` ou `404`) ; **la création n'a rien pour la protéger précisément parce que le client ne propose plus d'identifiant** — le remède de M-3 a retiré la seule chose qui aurait fait converger le rejeu. Un doublon silencieux dans un outil de preuve d'audit | 🟠 majeur | agent **FRONT** (arbitrage rendu ci-dessous) · agent **OUTILLAGE** (essai) | avant le 6ᵉ passage | ✅ **corrigé** — attend le rejeu |
| **Q-28** | **`LONGUEUR_ALEA` est dupliquée en dur dans `src/reprise/index.ts`**, avec le rendu `toString(36).padStart(25, '0')` et le littéral `25`. Ce n'est **pas** une infraction à la règle « un seul générateur par langage » — c'est une **dérivation**, elle ne tire rien, et le §2 tient à la pureté de ce module. Mais si quelqu'un change la longueur d'un côté, les identifiants `-d-` et `-r-` **cessent de se ressembler**. Rien ne casse aujourd'hui ; signalé par son auteur plutôt que laissé sans propriétaire — c'est ce que le registre existe pour recevoir | 🔵 mineur | agent **API** | `V1.1` | ouvert — report daté → **`V1.1`** : c'est une **dérivation**, elle ne tire aucun aléa ; une divergence produirait une allure, jamais une perte d'entropie (jugé ainsi par l'auditeur du 9ᵉ passage) |
| **Q-29** | 🛑 **Le correctif de Q-27 a échangé un doublon silencieux contre une DESTRUCTION silencieuse.** Une création dont la réponse expire *sans que la requête soit jamais arrivée* est bloquée ; le bandeau affiche « rechargez la page avant de recommencer » et offre le bouton. L'utilisateur fait ce qu'on lui dit — mesuré : **écran 0, base 0**, et un message vert « Données rechargées ». A/B sans aucun geste pendant 26 s : code antérieur `base=1` (la saisie arrivait seule), code actuel `base=0`. **Le commentaire du correctif affirme l'inverse** — « la voie *recharger avant de rejouer* a été écartée pour cela ». C'est **mon arbitrage** qui a écarté cette voie, et c'est la phrase du bandeau qui y ramène | 🛑 **bloquant** | agent **FRONT** | immédiat | ✅ **corrigé** — recharger PRÉSERVE une création bloquée, et « Envoyer à nouveau » rend le retour |
| **Q-30** | **Q-27 n'est fermé qu'à moitié** : `issueInconnue` n'est posé que dans la branche `AbortError`. Un **502/504 du frontal** reproduit le défaut mot pour mot — écran 1, **base 2**, bandeau vide. Une ligne, dans la branche qui identifie déjà le cas | 🟠 majeur | agent **FRONT** | immédiat | ✅ **corrigé** — 502/504 marqués, 503 délibérément exclu |
| **Q-31** | **`install.sh` recopie des données réelles dans la racine web d'Apache.** Trois classeurs — registre de risques, scénarios PCA/PRA, exigences client — plus un **fichier de verrou Excel nommant une personne**, servis **sans aucun contrôle d'accès** : ni `.xlsx` ni `data/` ne figurent dans les interdictions du vhost, et aucun code ne les référence. Dans un produit dont le métier est de protéger ce genre de contenu | 🟠 majeur | fichiers **retirés par l'orchestrateur** · exclusions à poser par **DÉPLOIEMENT** | immédiat | ✅ **corrigé** — liste blanche dérivée de la CSP, trois barrières |
| **Q-32** | **Q-23 fermé en apparence.** Détecteur neutralisé → **banc vert 43/43**, et aucune occurrence dans `test/` : les « deux silences vérifiés » du registre appartenaient à d'autres mécanismes. Pire — le compteur de session rend le détecteur **structurellement inerte** : l'auditeur n'a pas su fabriquer de collision sans le retirer | 🟠 majeur | agent **FRONT** (le mécanisme) · **OUTILLAGE** (l'essai) | immédiat | ✅ **corrigé** — mécanisme réparé (le séparateur) **et** essai écrit |
| **Q-33** | **Trois remèdes antérieurs sans aucun essai** — recalage d'adresse (N-3), vidage (m-6), abandon avant transaction. Le premier affiche « Mesure introuvable » pour une fiche créée dix secondes plus tôt | 🔵 mineur | agent **OUTILLAGE** | avant le 7ᵉ passage | ✅ **corrigé** — cette fois avec les essais, et les trois mutations mordent |
| **Q-34** | **Q-4, cinquième signalement.** `README` et `CHANGELOG` ignorent la migration `006` et les douze constats Q-15 → Q-28 ; « 5 migrations » quand le catalogue en porte **6** | 🔵 mineur | agent **DOC** | avant le 7ᵉ passage | ✅ **corrigé** |
| **Q-35** | **`install.sh` n'est joué par aucun essai du dépôt**, et huit mutations le prouvent — y compris la régression de Q-31 elle-même : *quelqu'un recommite un classeur sous `cyber-gouvernance_V4/`*. Chiffré par son auteur en trois niveaux : **niveau 1** (quelques dizaines de minutes, pur `node:test`, aucune dépendance) couvre l'essentiel du risque — le régresseur de Q-31, le motif du vhost joué sur 64 noms publiés plus douze contournements **et son contrôle symétrique**, l'égalité des deux listes blanches ; **niveau 2** (une à deux heures) porte ses treize cas au dépôt via trois marqueurs d'extraction ; **niveau 3** exige root, systemd, Apache et rsync — **ce n'est pas une lacune de banc mais une vérification de VM** | 🟠 majeur | agent **OUTILLAGE** (niveaux 1 et 2) · **VM cible** (niveau 3) | avant le 7ᵉ passage | ✅ **corrigé** (niveaux 1 et 2) — niveau 3 inscrit comme **vérification de VM** |
| **Q-36** | 🛑 **La liste blanche du vhost rend 403 sur `/` : l'application est injoignable à son URL d'entrée.** Le motif est à négation, et Apache l'évalue sur le **basename vide** d'une requête de répertoire — `DirectoryIndex` n'est donc jamais atteint. Chaîne complète cassée : `http://hôte` → 308 → `https://hôte/` → **403**. Prouvé par mutation (bloc retiré → 200) et par l'historique. **Les trois essais qui éprouvent ce motif le simulent en JavaScript sur des noms de fichier**, jamais sur l'entrée qu'Apache lui donne pour l'URL d'entrée ; et la vérification manuelle prescrite par `install.sh` interroge `/index.html`, donc **elle passe pendant que l'application est morte** | 🛑 **bloquant** | agent **DÉPLOIEMENT** | immédiat | ✅ **corrigé** — mesuré sous Apache réel, et un essai le rejoue |
| **Q-37** | **Un essai vert parce qu'il meurt avant d'assertionner.** `install-blocs.test.mjs:207` teste `includes('fichier non publiable') === false`, or le message de **succès** est « aucun fichier non publiable ». Il n'est vert que parce que le bloc meurt sur `rsync`, absent de la machine. `rsync` installé — ce que fait `install.sh` lui-même — `npm test` rend **595/596** | 🟠 majeur | agent **OUTILLAGE** | immédiat | ✅ **corrigé** |
| **Q-38** | **Q-33 est inscrit « ✅ corrigé » sans qu'une ligne d'essai ait été écrite.** Les trois mutations du 6ᵉ passage laissent le banc vert, et `git log -- backend/test/` le confirme. **C'est moi qui ai fermé ce constat, par une substitution automatique qui a emporté Q-33 avec Q-35 parce qu'ils partageaient une échéance.** Deuxième occurrence du motif de Q-32, un passage plus tard — et cette fois sans même un rapport pour m'induire en erreur | 🟠 majeur | **orchestrateur** (la fermeture) · agent **OUTILLAGE** (les essais) | immédiat | ✅ **corrigé** — les trois remèdes de Q-33 sont sous filet |
| **Q-39** | La « référence » d'un incident vient du **client** : `requestIdHeader: 'x-request-id'`, non effacé par le vhost. Un utilisateur peut donc choisir la référence qu'un exploitant retrouvera dans les journaux | 🔵 mineur | agent **API** | avant le 8ᵉ passage | ✅ **corrigé** — deux couches, et le crochet devient un témoin |
| **Q-40** | La case d'état de **Q-28** est vide au registre — un constat sans état est un constat qu'on ne sait pas lire | 🔵 mineur | **orchestrateur** | immédiat | ✅ **corrigé** |
| **Q-41** | **Q-4, sixième signalement.** `README` §5 : « 564 essais », « quatre familles » | 🔵 mineur | agent **DOC** | avant le 8ᵉ passage | ✅ **corrigé** |
| **Q-42** | **Les 59 fichiers `.js` du produit — 2,07 Mio — sont servis NON COMPRESSÉS et revalidés toutes les heures** au lieu de sept jours. Apache 2.4.58 sert les `.js` en `text/javascript` ; le vhost écrit `application/javascript` dans **deux** directives, et **aucune des deux ne s'applique**. Pour comparaison, `style.css` passe de 53 263 à 10 657 octets par le même filtre. C'est **mot pour mot le coût que le commentaire du vhost dit éviter** — « 61 requêtes conditionnelles à chaque ouverture sur un VPN international ne sont pas gratuites » — et il est payé, chaque heure, sur vingt filiales. Le 7ᵉ passage avait relevé `text/javascript` sans en tirer la conséquence, faute d'un montage portant `mod_deflate` | 🟠 majeur | agent **DÉPLOIEMENT** (le remède) · agent **OUTILLAGE** (le régresseur, prêt, deux lignes) | avant le 8ᵉ passage | ✅ **corrigé** — 1,42 Mio économisés par chargement, mesurés fichier par fichier |
| **Q-43** | **Une politique de cache dont la prémisse est fausse.** Le bloc de cache long énonce lui-même sa condition — *« CE BLOC N'EST SÛR QUE COUPLÉ AU JETON DE VERSION »* — mais le jeton ne reconnaît que `js` et `css`. Or `favicon.svg` est mis en cache **une heure** et `logo-dedienne.png` **trente jours**, tous deux **non versionnés** : **changer le logo reste invisible jusqu'à trente jours** sur un poste ayant déjà ouvert l'application. Même défaut que celui que l'avertissement décrit, sur un type qu'il ne couvrait pas. Trouvé et **annoté avec la mesure, non tranché** — le remède est un arbitrage. **Rendu ci-dessous** | 🔵 mineur | agent **DÉPLOIEMENT** | avant le 8ᵉ passage | ✅ **corrigé** — invariant posé, garde-fou qui résiste au remède naïf |
| **Q-44** | **`LimitRequestBody` est inopérante sur `/api/`.** 28 311 552 octets traversent le frontal en entier alors que la borne est 27 262 976 — y compris posée dans un `<Location /api/>`. Contrôle symétrique dans le **même** serveur : le même envoi sur `/index.html` rend **413**. Le vhost et `install.sh` affirment l'inverse, et `install.sh` **imprime « ok » en comparant deux nombres dont l'un n'agit pas** — un contrôle qui se mesure lui-même. Contrôle **S13 en échec** | 🟠 majeur | agent **DÉPLOIEMENT** | `V1.1` | ◐ **borné au frontal pour le cas ordinaire**, et **la moitié coûteuse est fermée par E4** : mesuré le 04/09 sur la chaîne réelle, un corps de 18 Mo non authentifié est refusé en **70–98 ms** quand le même corps authentifié en coûte **302–382**. Le transfert des octets reste payé ; **l'analyse ne l'est plus**. Échéance « immédiat » morte depuis la vague 2 → reclassé |
| **Q-45** | **Le banc rend 628 · 614 · 14 sur machine propre.** Les quatorze échecs sont `ENOTFOUND grc.exemple.interne` : la famille née du bloquant Q-36 dépend d'une entrée `/etc/hosts` **qu'aucun essai ne pose et qu'aucun document ne réclame**. L'entrée ajoutée, rien d'autre : 628 · 628 · 0. Le banc n'est donc pas reproductible là où il compte — sur une machine qui n'a pas vu ce chantier. Contrôle **S17 en échec** | 🟠 majeur | agent **OUTILLAGE** | immédiat | ✅ **corrigé** — et une barrière, pas une consigne |
| **Q-46** | **Le quatrième annuaire, et je l'avais demandé.** Une liste de 28 écrans écrite à la main, annoncée « celle de `js/app.js` », que **rien ne compare**. Mutation : une route neuve **portant un `onclick=`** laisse le balayage vert 10/10 **sans l'avoir visitée**. Et la liste a déjà dérivé : `#/soa` n'est pas une route — le balayage y inspecte la page 404 et la compte | 🟠 majeur | agent **OUTILLAGE** | immédiat | ✅ **corrigé** — 42 → 46 écrans, cinq fiches jamais visitées |
| **Q-47** | **Le registre a perdu la ligne d'un bloquant, et c'est mon correctif qui l'a fait.** Ligne 467 : treize barres au lieu de sept, Q-28 et Q-29 collées — le tableau rendait **42 constats au lieu de 43**, et l'absent était **Q-29, le seul 🛑 du 6ᵉ passage**. Une barre non échappée dans un `code` décalait en outre la colonne d'état de Q-43. Le registre existe pour qu'aucun constat ne se perde ; il en a perdu un, **en silence**, par une substitution automatique de ma main — Q-40 au carré, par le correctif de Q-40 | 🟠 majeur | **orchestrateur** (réparé) · agent **OUTILLAGE** (le garde-fou) | immédiat | ✅ **réparé, et gardé** — quatre essais de forme, quatre morsures |
| **Q-48** | `backend/README.md` annonce 615 essais — le réel est **628** — et deux noms de familles sont faux | 🔵 mineur | agent **DOC** | avant le 9ᵉ passage | ✅ **corrigé** |
| **Q-49** | La façade `DataStore` est documentée à **130 membres** ; elle en compte **131**, avant comme après la vague 2 (`diff` des deux listes triées vide). La propriété — *intacte* — est vraie ; le nombre qui la chiffre ne l'est pas | 🔵 mineur | agent **DOC** | avant le 9ᵉ passage | ✅ **corrigé** — le compte vient désormais de l'exécution, plus du texte |
| **Q-50** | La conséquence du motif sans barre finale n'est pas documentée | 🔵 mineur | agent **DÉPLOIEMENT** | avant le 9ᵉ passage | ✅ **corrigé** |
| **Q-51** | **Le pré-filtre du frontal ne borne pas un corps en `Transfer-Encoding: chunked`** — mesuré : 28 Mio passent et la doublure reçoit tout. Il arrête l'envoi surdimensionné **ordinaire** (un export trop gros, un client qui se trompe), **pas un client hostile qui choisit son encodage** ; son auteur refuse explicitement de l'appeler la barrière S13, et l'écrit dans le vhost. La barrière réelle reste **applicative**. Fermer le contournement au frontal demanderait `mod_security` — dépendance lourde, arbitrage qui n'appartient pas à l'agent. **Rattaché au lot L3**, avec le contrôle en `onRequest` de **Q-10** : c'est le même geste, borner **avant** d'analyser | 🔵 mineur | **lot L3** | `V1.1` | ◐ **la moitié coûteuse est fermée par E4** — même mesure que Q-44 : **70–98 ms** contre **302–382**. Un corps `chunked` non authentifié traverse toujours le frontal, mais **n'est plus analysé**. Échéance « vague 3 » morte → reclassé |
| **Q-52** | **Rien ne vérifie qu'un commit se tient seul.** Un fichier suivi peut importer un fichier qui n'est pas dans le commit — c'est arrivé à `fde4d35`, où l'essai commité appelait une fonction restée dans l'arbre de travail. Le banc ne le voit jamais : il s'exécute sur l'arbre, où les deux fichiers coexistent. Contrôle mesuré à trois lignes — pour chaque fichier suivi, ses imports relatifs doivent désigner des chemins présents dans le commit — joué une fois **après** coup : 66 fichiers, aucun orphelin. Il n'existe nulle part | 🔵 mineur | agent **OUTILLAGE** | avant le 9ᵉ passage | ✅ **corrigé** — et le contrôle a trouvé un défaut dans son propre outil |
| **Q-53** | **Rien ne confronte les chiffres du `README` au réel.** Six signalements de documentation périmée en huit passages, et la parade reste **la discipline d'un agent**, pas un contrôle : `test/documentation/` garde la *forme* du registre, personne ne garde les *nombres*. Signalé par l'agent qui les tient, qui ne peut pas l'écrire — `backend/test/**` n'est pas à lui. Le germe est nommé : un essai qui lit le total du banc et le compare à celui écrit dans le `README` ferait rougir au lieu d'attendre un auditeur. **Échéance à la vague 3 et non avant le 9ᵉ passage** : c'est un durcissement de la conduite, pas un défaut du produit, et une porte qui ne se joue jamais ne protège rien | 🔵 mineur | agent **B4** | fermé le 04/09 | ✅ **corrigé et mordu** — la parade cesse d'être la discipline d'un agent : `test/documentation/chiffres-du-banc.test.mjs` **confronte** les nombres et les versions du `README` à la machine. ⚠️ **Le garde-fou avait lui-même deux bugs à sa première exécution** : une expression non ancrée attrapait une ligne de sauvegarde au lieu de la ligne d'environnement, et un `\D+` gourmand capturait la version de Node pour rsync parce que le libellé de la colonne contient le mot « rsync ». Corrigés en ancrant sur un texte unique et en ne comparant que la cellule de valeur |
| **Q-54** | **Le garde-fou du registre ne voit pas la troncature.** Treize lignes de queue retirées — **dont cinq majeurs** — et les quatre essais restent **verts**. Il détecte les trous dans la numérotation, pas la fin manquante. Posé le jour même pour empêcher qu'un constat se perde, il laisse en perdre cinq | 🟠 majeur | agent **OUTILLAGE** | immédiat | ✅ **corrigé, et rejoué par mutation le 03/09** — dix lignes de queue retirées (Q-56 à Q-65) : `test/documentation/` rend **5/6**, l'essai « TOUT CONSTAT NOMMÉ … a sa ligne au registre » les nomme. L'état « ouvert » était **périmé** : le remède a été écrit le 02/09, la ligne pas relue |
| **Q-55** | **L'erreur brute de l'analyseur JSON fuit en production.** `POST /api/inconnue` avec un corps tronqué rend `FST_ERR_CTP_INVALID_JSON_BODY` et « Body is not valid JSON… », **derrière Apache, en production, sans authentification**. Le greffon normalise ; la branche 4xx de `serveur.ts:274` ne le fait pas. Contrôle **S12 en échec** | 🟠 majeur | agent **API** | immédiat | ✅ **corrigé** — une normalisation retirée, pas une ajoutée |
| **Q-56** | **Le cinquième annuaire, et je l'avais demandé.** Le contrôle `banc: entetes` ne reconnaît qu'une seule orthographe, `requete.headers['…']`. Trois en-têtes neufs écrits en guillemets doubles, en gabarit ou par destructuration → il imprime **« ok »**. Et l'essai censé garantir que « le septième en-tête ne manquera pas » écrit le sien **dans la seule orthographe visée** | 🟠 majeur | agent **OUTILLAGE** | immédiat | ✅ **corrigé** — un classement de lignes, où l'inconnu est bruyant |
| **Q-57** | **Le bandeau nomme un geste que le correctif ne couvre pas — troisième tour du même défaut.** Il dit « rechargez la page… le rechargement la conserve ». Mesuré dans la même session : le **bouton** « Recharger les données » conserve la saisie ; **F5 la perd** — écran 0, bandeau vide. Le remède de Q-29 couvre le bouton, pas la phrase qui nomme l'autre geste, et **aucun essai ne joue F5**. Contrôle **S18 en échec** : la grille nomme « recharger » | 🟠 majeur | agent **FRONT** (le correctif) · agent **OUTILLAGE** (l'essai qui suit le geste) | immédiat | ✅ **corrigé** — la couche qui ne peut pas savoir ne dit plus quoi faire |
| **Q-58** | Le vhost promet 413 là où le client reçoit **502**, et le frontal ingère **1 Gio sans borne** avant de refuser | 🔵 mineur | agent **DÉPLOIEMENT** | avant le 10ᵉ passage | ◐ **documenté avec ses chiffres** — la promesse fausse est retirée ; le contournement `chunked` reste, voir Q-51 (même famille, même échéance) |
| **Q-59** | **637 essais annoncés, 640 mesurés** — et la septième famille est déclarée « en vol » par le commit qui la commite. Le mien | 🔵 mineur | agent **DOC** · **orchestrateur** | avant le 10ᵉ passage | ✅ **corrigé le 03/09** — le compte est **mesuré**, pas recopié : `npm test` rend **651 · 651 · 0** à `e69b184` sur machine neuve (Apache et rsync installés pour l'occasion). 637 puis 640 étaient tous deux faux ; le germe du contrôle reste **Q-53** |
| **Q-60** | Le garde-fou de Q-52 ignore les **59 `<script src>`** d'`index.html` : un script publié mais non commité passerait | 🔵 mineur | agent **B3** | fermé le 04/09 | ✅ **corrigé et mordu** — 3/3, et la morsure nomme le site : un `<script src>` publié mais non commité fait rougir en citant `index.html:142` et le chemin non suivi |
| **Q-61** | `decisives()` compare **46 des 99 directives** du vhost — l'essai éprouve donc en partie sa propre réécriture | 🔵 mineur | agent **B2** | fermé le 04/09 | ✅ **corrigé** — `decisives()` (46 directives sur 99, écrites à la main) remplacé par `survivantes()` : **toute** ligne non déclarée doit survivre à l'identique, donc aucune liste à tenir à jour. Même remède répliqué dans `chaine-complete.test.mjs` |
| **Q-62** | **Aucun essai ne joint les trois moitiés de S17.** L'auditeur l'a fait à la main, en une pièce, et c'était la première fois | 🔵 mineur | agent **B2** | fermé le 04/09 | ✅ **corrigé et rejoué** — `test/deploiement/chaine-complete.test.mjs` joint les trois moitiés en une pièce : Chromium réel (via `test/aide/navigateur.mjs`) → Apache réel sur le vhost du dépôt → `dist/serveur.js` en vrai processus → PostgreSQL. **3/3**, ~10 s. Ce que l'auditeur du 9ᵉ passage avait dû faire à la main est désormais joué par le banc |
| **Q-63** | **`systemd-analyze verify` était installé et n'avait jamais tourné.** L'unité est valide — mais huit passages ont écrit « systemd non éprouvé » sans lancer la commande qui était là. Quatrième fois que ce motif coûte un constat | 🔵 mineur | agent **DÉPLOIEMENT** | avant le 10ᵉ passage | ✅ **corrigé** — et la commande a sorti un défaut réel : voir Q-65 |
| **Q-64** | **Deux sous-essais navigateur sont des courses.** Mesuré en reconstruisant dans les deux configurations : `bascule.test.mjs` échoue tantôt sur Q-29, tantôt sur Q-27, **avec et sans** le correctif de Q-55 — les deux sont fondés sur une expiration de délai. L'agent l'a établi plutôt que de l'affirmer, et refuse de conclure qu'il n'y est pour rien : une charge machine différente peut le rendre plus fréquent. **Un banc qui échoue quatre fois sur cinq apprend à être ignoré** — et un banc qu'on ignore est exactement ce que ce dispositif existe pour empêcher | 🟠 majeur | agent **B3** | fermé le 04/09 | ✅ **corrigé et rejoué** — les sept sous-essais de `bascule.test.mjs` rendent le **même verdict sur 20 exécutions consécutives** : **140/140**, isolés *et* sous la charge concurrente d'`npm test`. Les trois sites d'interception exigent désormais une **cible** ; aucun ne coupe plus « le premier appel non-GET venu » |
| **Q-65** | **L'unité systemd code en dur `/usr/bin/node`**, alors qu'`install.sh` valide la version de ce que `command -v node` trouve. Sur une machine où Node n'est pas dans `/usr/bin` — un `nvm`, un `/opt`, ce conteneur même — **l'installation se déclarait réussie et le service ne démarrait pas**. Trouvé par `systemd-analyze verify`, la commande qui était installée depuis le début et que huit passages n'avaient jamais lancée. Le chemin reste juste **pour la cible documentée** ; ce qui manquait était le contrôle qui le confronte à la machine, et il est posé — l'installation s'arrête désormais au lieu de mentir | 🟠 majeur | **corrigé par le contrôle** · le chemin lui-même relève du **lot L15** (durcissement final) si la cible change | vague 8 | ◐ **l'installation ne ment plus** ; le chemin en dur reste, assumé → **`V1.1`** (le fond relève de **L15** si la cible change) |
| **Q-66** | **Le sur-octroi du profil Qualité, mesuré par A1 dans le périmètre d'A2.** `DroitsSession` ne porte **qu'un seul niveau pour toute la session**, alors que `session_domaines` en porte un **par domaine** : `deciderAcces` compare donc un niveau global là où la base a une décision fine. Conséquence mesurée : *Qualité* passe le contrôle d'une écriture sur `conformite` quand la base ne lui accorde que la lecture. La donnée existe et est exposée par `ResolveurPerimetreSession.peut(domaine, niveau)` — **c'est son emploi qui manque, pas sa production** | 🛑 **bloquant** *(1ʳᵉ classe du §0 bis : le modèle à trois axes EST le livrable du lot ; un axe qui ne mord pas n'est pas un `V1.1`)* | agent **A2** (le consommateur, fait) · agent **B1** (le producteur, fait) | **avant la fin de la vague 3** | ✅ **corrigé et mordu — pour de bon, cette fois.** ⚠️ **Cette case portait « corrigé et mordu » alors que le constat n'était fermé qu'À MOITIÉ**, et c'est B1 qui l'a vu en allant vérifier ce que la phrase promettait. Le consommateur lisait bien `niveaux` par domaine (`src/api/droits.ts:283`) — mais le **producteur**, `projeterDroits()` dans `src/droits/passerelle-api.ts`, ne l'émettait **jamais** et rendait le niveau *le plus élevé* de tous les domaines. La morsure citée (`201 !== 403`) éprouvait le consommateur contre un `niveaux` fabriqué par l'essai lui-même : elle ne pouvait pas voir que rien ne le fabriquait en vrai. **C'est exactement le défaut que ce registre existe pour empêcher**, commis dans le registre. Fermé le 04/09 : le producteur émet `niveaux`, et la mesure contre l'**AD réel** montre `qualite.tls` — porteur de `GRC-TLS-QUALITE` **et** `GRC-TLS-AUDITEUR` — refusé en écriture sur `conformite` (« lecture ») et accepté sur `audits` (« contribution »), dans la même session. Deux morsures : producteur muet → **9/12** rouges dont « le profil Qualité vient d'ÉCRIRE sur conformite » ; producteur qui desserre → **3/12**, les trois qui portent sur `conformite` |
| **Q-67** | **Le greffon de connexion doit être monté hors du crochet `onRequest`, et rien ne le vérifie.** Monté dedans, `POST /api/connexion` exige d'être déjà connecté : la route de connexion devient inatteignable, **et le banc reste vert** puisque aucun essai ne l'appelle sans session. A1 exporte `CHEMIN_CONNEXION` pour cela | 🟠 majeur | agent **A2** (le montage) · agent **A1** (l'export, fait) | **avant la fin de la vague 3** | ✅ **corrigé et mordu** — le greffon est monté, et `publique` est une **déclaration portée par la route**, jamais une liste de chemins dans le crochet. Morsure : `publique` cesse d'exempter → `POST /api/connexion` inatteignable |
| **Q-68** | **Les résultats paginés LDAP ne sont couverts par rien**, et le contrôle `1.2.840.113556.1.4.319` n'est pas implémenté. Active Directory plafonne une recherche à **1 000 entrées** par défaut : sans effet sur l'authentification (un compte, quelques groupes), mais un repli `(member=<dn>)` peut être **tronqué en silence** dans une forêt large — et une liste de groupes tronquée retire des droits sans rien dire. Réserve levée par A1 lui-même, qui ne pouvait pas la mesurer faute d'AD | 🟠 majeur | agent **A1** (détecter la troncature) · **client** (la question de forêt) | **avant la mise en service pilote** | ✅ **corrigé et mordu le 03/09** — trois détecteurs (`sizeLimitExceeded`, renvoi reçu, borne pleine sur demande), aucun ne rend de résultat partiel. Morsure **réelle** : la troncature vient du serveur d'A4, que A1 n'a pas écrit — 2 entrées reçues sur 9, le client croyait la réponse complète. ⚠️ **Le détecteur de renvoi reste non mordu** : voir **Q-69**. Le refus n'est pas la pagination — le contrôle `1.2.840.113556.1.4.319` reste à faire si le client répond oui aux deux questions du §28 |
| **Q-69** | **Le détecteur de renvoi LDAP est écrit, lu, et mordu par rien.** Des trois détecteurs de troncature posés pour Q-68, deux sont éprouvés contre un serveur qu'A1 n'a pas écrit ; le troisième — un `SearchResultReference` reçu — ne l'est par **aucun** essai, l'annuaire simulé n'en émettant pas. Sous le §2 bis, l'authentification est une **classe dure** : un détecteur non mordu n'y est pas accepté. **Signalé par son propre auteur**, qui pouvait se taire — les trois se ressemblent à la lecture | 🔵 mineur | agent **A4** (le levier `definirPanne({ renvoyer: true })`, demandé) · agent **A1** (la morsure, une fois le levier posé) | **avant la fin de la vague 3** | ouvert — l'enchaînement est tenu par l'orchestrateur |
| **Q-70** | **`administrationGroupe` est calculé DEUX FOIS, à l'identique** — `src/auth/index.ts` et `src/droits/resolveur.ts`. Signalé **par ses deux auteurs indépendamment** (A1 dans son code, A2 dans son rapport), ce qui est le meilleur indice qu'il faut le fermer : c'est le motif que ce chantier traque — deux rédactions de la même décision divergent, et la seconde n'est rejouée par personne. L'une doit **dériver** de l'autre | 🟠 majeur | agent **B1** | fermé le 04/09 | ✅ **corrigé et mordu** — un seul producteur du drapeau. ⚠️ **La morsure enseigne quelque chose** : remettre la seconde rédaction laisse **toutes les assertions de valeur vertes** — les deux calculs rendent bien le même résultat. Seules l'**identité de référence** (`session.perimetre === resolveur.perimetreFige`) et le **comptage mécanique** rougissent, et ce dernier retire les commentaires avant de compter : la formule est citée dans plusieurs entêtes, et une explication n'est pas une décision |
| **Q-71** | **`src/serveur.ts` n'appartenait à aucun rôle, et le câblage de L3 y manquait.** `src/auth/` et `src/api/` étaient écrits, éprouvés, et **reliés par personne** : ni route de connexion ni authentification réelle, **et le banc restait vert**, chaque moitié l'étant de son côté. Troisième défaut de ce chantier vivant *entre* des fichiers dont aucun n'a tort seul. Le fichier rejoint les fichiers réservés à l'orchestrateur (§2) | 🛑 **bloquant** | **orchestrateur** | fermé le 03/09 | ✅ **câblé** (`ce603da`) — conséquence assumée : 84 essais de l'ère L2 montent le serveur réel sans session et rendent `401`. Corrigés chez A4, **pas** en assouplissant le câblage : gater l'authentification sur l'environnement aurait gardé le banc vert, ce qui est « mesurer ce qui est commode » |
| **Q-72** | **Le compte de secours est inutilisable dans la situation exacte pour laquelle il existe.** Le câblage de `src/serveur.ts` montait l'authentification réelle si `ldapActif && ldap !== null` — il **ignorait le compte de secours**. ⚠️ **Requalifié BLOQUANT par la mesure du 03/09**, sur une installation réelle en `NODE_ENV=production` avec une empreinte de secours valide : `POST /api/connexion` rendait **404 « Aucune ressource ne répond »** et `GET /api/session` **503** — la route de connexion n'existait même pas. Ce n'était donc pas « le secours ne secourt rien », c'était **personne ne peut ouvrir le produit**, dans une configuration que `deploy/install.sh` accepte en production et dont il annonce lui-même « seul le compte de secours pourra ouvrir une session ». La **justification** écrite au-dessus de la garde était fausse — « en production les `LDAP_*` sont exigées, le service réel y est donc toujours celui-ci » — et personne ne l'avait relue depuis que `AUTH_LDAP_ACTIF=non` est devenu un chemin soutenu. `ServiceAuthentification` savait déjà tenir sans annuaire (`src/auth/index.ts` : `annuaire` à `null` ligne 192, « compte de secours » annoncé ligne 207, refus dédié ligne 542) : seule la garde manquait | 🛑 **bloquant** *(requalifié — 1ʳᵉ classe du §0 bis)* | **orchestrateur** (le câblage) · agent **B1** (l'essai) | fermé le 04/09 | ✅ **corrigé et mordu par l'autre bout** — 9 essais `secours-sans-annuaire`. Privé de son dernier moyen d'authentification, `POST /api/connexion` rend **404 ressource_inconnue** : la mesure exacte du 03/09 |
| **Q-73** | **Le refus « aucun moyen d'authentification » ne vaut qu'en production.** `src/config/index.ts` gate ce contrôle sur `estProduction` : une **recette** démarre sans annuaire ni compte de secours. C'est la forme exacte du constat **M-5** — une barrière qui protège la production et pas la recette, laquelle porte « une copie réaliste de la production » (`PLAN_SERVEUR` §1.10). Rien ne fuit ici, la session provisoire rendant 503 partout ; mais l'exploitant ne l'apprend qu'au premier appel, et l'asymétrie est celle qui a déjà coûté un constat | 🔵 mineur | agent **AUTH** | **avant la mise en service pilote** | ouvert — l'écart est **éprouvé** par l'essai T-3, qui joue les deux environnements séparément |
| **Q-74** | **`deploy/groupes-ad.sh` ne pouvait JAMAIS aboutir après une installation propre.** `install.sh` appelait `$SOURCE/deploy/groupes-ad.sh` (l'arbre du dépôt) ; le script cherche l'engendreur compilé en `<lui-même>/../dist/droits/groupes-ad.js` ; or `install.sh` compile dans `$RACINE/backend`, **jamais dans l'arbre source**. Résultat mesuré deux fois sur une Debian 13 neuve : « L'engendreur compilé est absent », puis « Installation terminée » et **code 0**. C'est le livrable DÉPLOIEMENT de la vague 3, et son critère d'acceptation — « la liste est engendrée depuis la configuration des filiales » — n'était tenu sur **aucune** installation réelle. Sans groupes AD, personne n'a d'accès | 🟠 **majeur** | **orchestrateur** | fermé le 03/09 | ✅ **corrigé et rejoué** — l'appel vise la copie déployée, avec repli sur le dépôt. A/B sur la même machine : passage 3 (avant) « engendreur absent », passage 4 (après) « **23 groupes attendus — 2 filiales actives, 8 profils** ; la déclaration et la liste engendrée concordent » |
| **Q-75** | **Une première installation n'éprouve jamais son frontal, et sort quand même en 0.** `install.sh` installe le vhost mais ne l'active pas ; tant qu'il n'est pas activé, l'**URL d'entrée** (Q-36, bloquant du 7ᵉ passage) et la **borne de corps du chemin mandaté** (Q-44) ne sont éprouvées à aucun moment — le script le dit en `alerte`, puis imprime « Installation terminée » et rend **0**. Même forme pour un contrôle qui n'a pas pu s'exécuter (Q-74) : le script écrit lui-même « **ce n'est pas un feu vert** » et rend 0. Un exploitant qui écrit `install.sh && …` conclut au succès. ⚠️ Ne pas « durcir » par réflexe : le script refuse délibérément d'échouer sur une **lacune de données** (une filiale sans ses groupes), pour ne pas bloquer la mise à jour d'un système en production — l'arbitrage est écrit dans le script. Ce qui est en cause est autre : **un contrôle qui n'a pas pu être joué est rendu indiscernable d'un contrôle réussi** | 🟠 **majeur** | agent **B2** | fermé le 04/09 | ✅ **corrigé et mordu** — troisième verdict `reserve()`, entre `succes` et `echec`, qui n'arrête rien mais **compte**. Un bloc `bilan` décide du mot de la fin et du code de sortie : **0** si tout est joué, **3** si des contrôles ne l'ont pas été (« Installation terminée AVEC RÉSERVES (n contrôle(s) non joué(s)) »). L'essai rejoue le **VRAI** bloc et vérifie que son **VRAI** `reserve()` alimente le **VRAI** compte — pas deux valeurs injectées séparément. 30/30 |
| **Q-76** | **Le nom d'hôte livré par défaut est inversé, et aucun contrôle ne peut le voir.** `.env.example` portait `SERVEUR_URL_PUBLIQUE=https://grc.interne.exemple` quand le vhost livré déclare `ServerName grc.exemple.interne` (deux fois). `install.sh` ne teste que « la valeur commence par `https://` » : une valeur syntaxiquement valide et fonctionnellement fausse passe. Sur l'installation réelle du 03/09, `/etc/cyber-grc/env` est parti avec le mauvais nom sans un mot. Portée limitée aujourd'hui — `urlPublique` sert aux liens des courriels et des exports (lot L12) et au journal de démarrage — mais c'est la forme exacte du motif que ce chantier traque : deux fichiers livrés qui se contredisent, et le contrôle qui les sépare ne compare pas ce qu'il faut | 🔵 mineur | agent **B2** | fermé le 04/09 | ✅ **corrigé et mordu** — l'installateur **interroge le certificat réellement servi** (`openssl s_client` puis `openssl x509 -checkhost`) au lieu de comparer deux chaînes. Mutation contre un Apache réel : le nom historiquement inversé `grc.interne.exemple` → **échec** nommant les deux noms ; `grc.exemple.interne` → succès. 3/3 |
| **Q-77** | **L'environnement de référence documenté n'est pas la cible de déploiement.** `backend/README.md` §8 annonce « **Apache 2.4.58 (Ubuntu)** » et « PostgreSQL 16.13 » ; `CLAUDE.md`, le `CHANGELOG` et deux fichiers d'essai raisonnent sur 2.4.58. Or la cible est **Debian 13**, qui embarque **Apache 2.4.68** et, par PGDG, **PostgreSQL 17**. Toute la famille `test/deploiement/` a donc été validée sur une version qu'aucune machine cible n'embarque — dont le correctif Q-42, dont la prémisse est le type MIME qu'Apache attribue aux `.js`. **Rejoué sur la cible réelle le 03/09** : `/etc/mime.types` de Debian 13 déclare `text/javascript js mjs es`, la prémisse tient, et les 59 scripts d'`index.html` passent de **2 248 762 à 699 088 octets** derrière le vhost livré | 🔵 mineur | agent **B4** | fermé le 04/09 | ✅ **corrigé et gardé** — `README.md` §8 et le `CHANGELOG` disent la cible réelle, et **cinq essais neufs les tiennent** : falsifier Node, Apache, PostgreSQL, rsync ou l'OS fait rougir le contrôle correspondant, mordu un par un. ⚠️ **Reste ouvert** : deux entêtes d'essai citent encore « Apache 2.4.58 » (`test/api/normalisation-erreurs.test.mjs`, `test/deploiement/vhost-apache.test.mjs`) |
| **Q-78** | 🛑 **Après une installation complète et réussie, PERSONNE ne peut utiliser le produit.** `synchroniserGroupesAd()` (`src/droits/groupes-ad.ts:151`) est la seule fonction qui alimente la table `groupes_ad` — et elle est **appelée par les essais et par rien d'autre** : `test/auth/service.test.mjs:129`, `test/droits/trois-axes.test.mjs:70` et `:143`, point. Aucun chemin de production ne l'invoque. Mesuré le 03/09 sur l'installation réelle, après cinq passages d'`install.sh` en `NODE_ENV=production` : `select count(*) from groupes_ad` → **0**, et une connexion au compte de secours **avec le bon mot de passe** rend `403 droit_insuffisant` — « Votre compte est reconnu, mais aucun accès à cette application ne lui est ouvert ». Le compte de secours présente pourtant `GRC-ADMIN` (`src/auth/index.ts:639`) : c'est la table qui est vide, pas le groupe qui manque. **C'est la forme exacte de Q-71, d'un cran plus loin** — deux moitiés justes, reliées par personne, et **le banc reste vert parce qu'il appelle lui-même la fonction que le produit n'appelle jamais**. ⚖️ **Arbitrage rendu** : la synchronisation n'est ni un effet de bord du démarrage (elle écraserait en silence ce qu'un exploitant a ajusté), ni une tâche d'`install.sh` seul (elle doit pouvoir être rejouée à chaque acquisition de filiale). Elle est **une commande d'administration explicite et idempotente**, appelée par `install.sh` après les migrations **et** relançable à la main — et `install.sh` **échoue** si `groupes_ad` est vide en sortie, parce qu'une installation dont personne ne peut se servir n'est pas une installation réussie | 🛑 **bloquant** *(1ʳᵉ classe du §0 bis : le produit ne fait pas ce qu'il doit faire)* | agent **B1** (la commande) · **orchestrateur** (le câblage et le contrôle d'`install.sh`) | fermé le 03/09 | ✅ **corrigé et mordu** — commande d'administration idempotente `db/synchroniser-groupes-ad.mjs`, appelée par `install.sh` (§8 bis) et rejouable après chaque acquisition de filiale. `install.sh` **envoie et constate** — `select count(*) from groupes_ad` — au lieu de se fier au code de sortie du script précédent, et **échoue** si la table est vide. Mesuré : « 2 filiale(s), 8 profil(s) → 23 groupe(s) », puis `ok groupes_ad : 23 groupe(s) — l'annuaire peut accorder des accès`. ⚠️ **Le premier garde-fou écrit était INATTEIGNABLE** — il testait `attendus.length === 0`, or les deux groupes transversaux sont rendus quoi qu'il arrive : la mutation sortait en **0**. Remplacé par `profils.length === 0`, mordu des deux côtés : 8 profils → code 0 ; zéro profil → code **4**, « PERSONNE n'obtiendrait d'accès » |
| **Q-79** | **Le code HTTP révèle l'identifiant du compte de secours.** Avec `AUTH_LDAP_ACTIF=non`, `POST /api/connexion` rend **401** pour le nom du compte de secours et **503** pour tout autre nom. Mesuré : `secours` → 401, `SECOURS` → 401 (insensible à la casse), `personne` · `admin` · `root` · `svc-grc` → 503. Une requête par candidat suffit donc à **découvrir** l'identifiant — celui-là même que `AUTH_COMPTE_SECOURS_IDENTIFIANT` rend configurable pour qu'il ne soit pas devinable. Le 503 est faux par-dessus le marché : il annonce « Le service d'annuaire ne répond pas », alors que l'annuaire est **délibérément désactivé** — un exploitant ira chercher une panne réseau qui n'existe pas, alors que `src/auth/index.ts:542` porte déjà le refus juste (« `AUTH_LDAP_ACTIF` vaut non et le login présenté n'est pas celui du compte de secours »). Les deux moitiés se corrigent d'un même geste : ce cas doit rendre **401**, avec le message générique déjà employé pour un mot de passe faux | 🟠 **majeur** | agent **B1** | fermé le 04/09 | ✅ **corrigé et mordu** — l'identifiant inconnu rend **401**, comme le compte de secours. Morsure : retour au 503 → **6/9** rouges, dont « un 503 sur les seuls noms qui ne sont PAS le compte de secours désigne celui qui l'est » |
| **Q-80** | **Le banc codait en dur le chemin d'une machine qui n'existe plus.** `test/aide/navigateur.mjs:51` portait `const CHEMIN_PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright/index.mjs'` — l'emplacement du conteneur de développement. Sur la VM Debian 13, où Playwright vit sous `/usr/lib/node_modules`, **30 essais de navigateur échouaient sur ce seul chemin**, tous avec le même message. C'est mot pour mot la famille de **Q-45** (*une dépendance d'environnement non déclarée manquera chez quelqu'un d'autre*), et la leçon n'avait été appliquée qu'au cas qui l'avait produite : le `/etc/hosts` avait été traité, le chemin de Playwright non | 🟠 **majeur** | **orchestrateur** | fermé le 03/09 | ✅ **corrigé et rejoué** — Playwright se **découvre** désormais : `PLAYWRIGHT_MODULE` s'il est posé, puis la résolution ordinaire, puis `npm root -g` **demandé à npm** et jamais supposé ; le message d'échec **nomme tout ce qui a été tenté**. A/B sur `test/navigateur/connexion.test.mjs` : avant « Playwright est introuvable », après **6/6** |
| **Q-81** | **Un site sur six ignorait l'environnement, et c'était celui qu'on ne relit pas.** Le banc lit le secret des rôles PostgreSQL à six endroits ; **cinq** écrivent `process.env.X ?? 'dev'`, et `test/auth/service.test.mjs` écrivait `'dev'` **en dur, deux fois** — ligne 84 pour la configuration du serveur, ligne 119 pour le pool que les essais interrogent en direct. Sur une machine où les rôles portent les secrets engendrés par `deploy/install.sh`, **19 des 26 essais du fichier** échouaient sur `password authentication failed for user "grc_app"` pendant que les autres familles passaient. ⚠️ **Et corriger le premier site sans le second ne changeait rien** : 19 rouges avant, 19 rouges après — la mesure l'a dit, pas le raisonnement. C'est le motif « une valeur recopiée à la main dans *n* sites finit par diverger dans un seul », et la divergence était **muette partout ailleurs** | 🔵 mineur | **orchestrateur** | fermé le 03/09 | ✅ **corrigé et rejoué** — les deux sites lisent l'environnement ; `test/auth/service.test.mjs` passe de **7/26 à 26/26**, et `grep -rn ": 'dev'" test/` ne rend plus aucun site sans `process.env` |
| **Q-82** | **Le banc accusait la machine de ne pas avoir Apache, pendant qu'Apache servait le produit.** Debian range les démons dans `/usr/sbin` et **ne met pas ce répertoire dans le `PATH` d'un compte non-root** : `exigerOutil('apache2', …)` échouait donc en écrivant, mot pour mot, *« apache2 est introuvable sur cette machine »* — alors que `/usr/sbin/apache2` était installé, actif, et répondait à la même seconde. **29 essais annulés**, dont la jonction du contrôle S17 (Q-62), l'URL d'entrée (Q-36) et la liste blanche du frontal (Q-31) — c'est-à-dire précisément les familles d'où sont sortis deux bloquants. Un message d'échec qui se trompe de cause coûte plus cher qu'un message absent : il envoie installer ce qui est déjà là | 🟠 **majeur** | **orchestrateur** | fermé le 03/09 | ✅ **corrigé et rejoué** — `test/aide/outils.mjs` complète le `PATH` avec `/usr/sbin` et `/sbin` (complété, pas codé en dur, même motif que Q-80). A/B : familles `deploiement` + `annuaire` **0 → 104/104** |
| **Q-83** | 🛑 **Le détecteur de renvoi LDAP rendait le produit inutilisable contre un vrai Active Directory.** `src/auth/client-ldap.ts` refusait **toute** réponse portant un `SearchResultReference`, au motif — juste en soi — qu'une réponse amputée annoncée comme un succès est pire qu'un refus. Or AD émet ces *continuation references* sur **toute** recherche en sous-arbre depuis la racine du domaine, vers `CN=Configuration,…`, `DC=DomainDnsZones,…`, `DC=ForestDnsZones,…`. Mesuré contre un contrôleur Samba réel : l'entrée cherchée **était là** (« 1 entrée(s) reçue(s) »), et **aucune connexion n'aboutissait**. C'est le constat **Q-69** — *« écrit, lu, et mordu par rien »* — mordu par le réel, et pris en défaut ; aucune doublure ne pouvait le montrer, une doublure n'émettant que ce que son auteur a prévu. ⚠️ **Et la première correction était fausse aussi** : comparer les DN range `CN=Configuration,DC=exemple,DC=interne` *sous* `DC=exemple,DC=interne`, donc « dans le périmètre », et le refus restait entier — mesuré, pas raisonné | 🛑 **bloquant** | **orchestrateur** (le correctif) · agent **B1** (les essais) | fermé le 04/09 | ✅ **corrigé et mordu** — 12 essais. Deux morsures symétriques : *rien n'est écarté* → 4/12 rouges dont « les renvois écartés sont NOMMÉS » ; *tout est écarté* → 6/12 rouges, les six qui tiennent la barrière d'origine. ⚠️ **B1 a dû écrire son propre répondeur** : la doublure de `test/annuaire/` ne peut pas montrer ce constat — voir **Q-86** |
| **Q-84** | 🛑 **`/api/session` rendait 503 juste après une connexion réussie.** La route testait `resolveur instanceof PerimetreProvisoire` — or `resolveur` vaut `PerimetreProvisoire` **par défaut même quand l'authentification réelle est montée**, le lot L3 ne fournissant pas de résolveur global mais en fabriquant un **par requête** depuis la session vérifiée. La condition était donc vraie en permanence, et la route interrogeait un résolveur provisoire qui, hors développement, échoue par construction. Mesuré : connexion **200**, `/api/modele` **200**, `/api/donnees` **200**, `/api/session` **503**. Comme c'est la **première route que la SPA appelle au démarrage**, l'utilisateur voyait « Serveur indisponible — l'authentification n'est pas encore installée » *après s'être authentifié* : le produit était inutilisable au navigateur alors que toute la chaîne fonctionnait. Le test portait sur le **type d'un objet** au lieu de porter sur **ce qui a produit la session** | 🛑 **bloquant** | **orchestrateur** (le correctif) · agent **B1** (l'essai) | fermé le 04/09 | ✅ **corrigé et mordu par l'autre bout** — B1 ne pouvait pas écrire dans `src/api/index.ts` ; il a mordu la propriété depuis sa moitié : privée de la session réelle, `GET /api/session` rend **503 indisponible**, le symptôme exact du 03/09 |
| **Q-85** | **Le bandeau « Périmètre » affiche un identifiant brut au lieu du nom de la filiale.** Mesuré au navigateur après connexion réelle : la barre latérale montre `FIL-1788477623975-5208b3f525954fffb228d9aa292ec1cf`. La session **provisoire** joignait le libellé de la filiale (`resolveur.filiale()`) ; la session **réelle** ne le porte pas, et `charteSession` reçoit `null`. Ce n'est pas une régression du correctif Q-84 — c'était déjà le cas dès que l'authentification réelle servait —, mais Q-84 l'a rendu **visible** en faisant enfin s'afficher l'écran. Un identifiant technique dans l'interface d'un outil qui sert de preuve en audit est une gêne réelle, pas cosmétique : l'utilisateur ne sait pas dans quelle filiale il écrit | 🟠 **majeur** | agent **B1** (la session) · **orchestrateur** (la charte) | fermé le 04/09 | ✅ **corrigé et mordu** — `FilialeActive = { id, code, raisonSociale }` voyage **dans la session** (`SessionAppliqueeReelle`) et non par un argument de plus : le greffon de connexion reçoit `charteSession` à un seul paramètre, et enrichir un seul côté ferait diverger `POST /api/connexion` de `GET /api/session`, que le §26.2 exige identiques à l'octet près. La forme rendue est **celle que la session provisoire émettait déjà**. Morsure : la jointure ne rend plus rien → 2/12 rouges, exactement les deux |
| **Q-86** | **La doublure d'annuaire ne peut pas atteindre la branche qu'elle est censée éprouver.** Son RootDSE n'annonce **qu'un seul** contexte de nommage, égal à la base interrogée : `renvoiHorsPerimetre()` ne peut donc *jamais* rien y écarter, et `derniersRenvoisEcartes` ne peut jamais être non vide. Conséquence — les trois essais « renvoi » d'`annuaire.test.mjs` sont **verts sans pouvoir atteindre** la branche « écarté ». B1 a dû écrire son propre répondeur (topologie d'un vrai contrôleur : 5 contextes, 1 entrée et 3 renvois) pour éprouver le correctif de **Q-83**. C'est la limite structurelle du §25, énoncée par le constat **Q-61** et vérifiée ici : *une doublure n'émet que ce que son auteur a prévu*, et un vert qu'elle rend sur une branche inatteignable ne vaut rien | 🔵 mineur | agent **OUTILLAGE** | **avant la porte S3** | ouvert — le RootDSE de `test/annuaire/serveur-ldap.mjs` doit annoncer **plusieurs** `namingContexts` |
| **Q-87** | **Le `README` §5 et §8 ont divergé du réel PENDANT la vague, et le garde-fou neuf ne pouvait pas le voir.** `test/documentation/chiffres-du-banc.test.mjs` (constat Q-53) confronte le `README` à **lui-même** — somme des familles, concordance de trois endroits — et aux **versions** de la machine, mais **pas au nombre d'essais réellement joués**. Or B1 et B2 en ont ajouté 59 après le passage de B4 : le `README` annonçait encore « 969 essais » quand le banc en rendait **1028**, et le contrôle restait vert. Deuxième écart du même fichier, échappé pour une autre raison : `README` §5 citait toujours le chemin mort `/opt/node22/lib/node_modules/playwright`, retiré du code au constat **Q-80**. Le motif est celui que ce chantier traque depuis huit passages, avec cette aggravation qu'il est passé **sous un garde-fou écrit le jour même pour l'empêcher** | 🔵 mineur | **orchestrateur** (les valeurs, faites) · agent **OUTILLAGE** (le garde-fou) | **avant la porte S3** | ◐ **valeurs corrigées et mesurées** ; le contrôle doit **jouer le banc** et comparer son total au `README`, au lieu de ne confronter le document qu'à lui-même |
| **Q-88** | 🛑 **L'annuaire `personnes` n'était JAMAIS alimenté depuis l'AD, et son essai était vert sur une branche inatteignable.** L'alimentation vivait à l'**étape 5** du crochet `onRequest`, gardée par `sessionOuverte` — drapeau que seule `connecter()` produit, sur une route déclarée **`publique`**, où le crochet rend la main à l'**étape 2**. L'étape 5 n'était donc jamais atteinte sur la seule requête qui portait le drapeau. Mesuré : **0 ligne après SEPT connexions réelles**. Son essai `test/api/annuaire-ad.test.mjs` était vert parce qu'il fabrique un authentificateur posant `sessionOuverte` sur *n'importe quelle* route — **le défaut de Q-66, répété**. **Quatrième occurrence** du motif « un défaut qui vit ENTRE deux fichiers dont aucun n'a tort seul » | 🛑 **bloquant** *(1ʳᵉ classe du §0 bis)* | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et mesuré** — rappel `apresConnexion` sur le greffon de connexion, branché sur `alimenterAnnuaire` par le point d'entrée, qui prend désormais un **journal** et non une requête. Défensif : une panne d'alimentation journalise et ne défait pas une authentification réussie. Sur la chaîne réelle après redéploiement, `personnes` passe de **0 à 3** après trois connexions AD, identités venues de l'annuaire |
| **Q-89** | 🛑 **Le droit d'export était contournable depuis l'interface (contrôle S7 en échec).** Mesuré dans un Chromium réel avec le compte AD `rssi.tls` (`export: false`) : **38 213 octets** téléchargés — la « Synthèse Direction — Posture Cyber », marquée *Document confidentiel*. `js/modules/synthese.js` fabriquait son `Blob` sans passer par `Droits.exigerExport()`, l'entonnoir unique que `js/core/session.js` annonce et que **onze sites sur douze** respectaient. ⚠️ **Le discriminant apparent était trompeur** : le profil `direction` était bien bloqué, mais par son niveau de **lecture seule**, pas par l'absence de droit d'export — une barrière qui n'arrête que ceux qu'une autre arrêtait déjà n'est pas une barrière. **RSSI et ADMIN, 2 des 8 profils du socle, étaient dans cette configuration.** Aucun export n'est par ailleurs journalisé | 🛑 **bloquant** *(2ᵉ classe du §0 bis : extraction non autorisée)* | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et mordu** — la garde est posée, et surtout `test/depot/entonnoir-export.test.mjs` **découvre** les sites de sortie (`URL.createObjectURL`, attribut `download`, `msSaveBlob`) au lieu de tenir une liste, refuse de passer s'il en voit moins de cinq (sans quoi il rendrait vert en n'éprouvant rien), et exige l'entonnoir de chacun. Mordu : garde retirée → rouge nommant le fichier **et** les deux mécanismes ; restaurée → vert. ⚠️ **La journalisation des exports reste à faire**, au lot L5 |
| **Q-90** | **Le `README` §8 déclare OUVERTES cinq propriétés que L3 a livrées** — E1, droits par domaine, export, rythme, journal —, et le §5 se contredit dans la même section. La documentation ne **retarde** plus, elle **nie** : un lecteur y apprend que le produit ne fait pas ce qu'il fait. Plus cinq chiffres faux, dont trois contredits par le même fichier | 🟠 majeur | agent **B4** / rôle **DOC** | **avant la porte S3 rejouée** | ouvert |
| **Q-91** | **Trois réglages documentés que personne ne lit** — `API_RYTHME_MAX_ANONYME`, `API_RYTHME_FENETRE`, `AUTH_REVERIFICATION_AD` : présents au `.env.example`, lus **nulle part** dans le code. Un exploitant qui les règle croit agir. **Deuxième et troisième récidives du constat m-2** | 🟠 majeur | **orchestrateur** (`.env.example` lui est réservé) | **avant la fin de la vague 3** | ouvert |
| **Q-92** | **Le filet navigateur des droits n'exerce jamais la combinaison qui a laissé passer Q-89** : un profil qui **peut écrire** mais **ne peut pas exporter**. Il éprouve la lecture seule, qui bloque pour une autre raison — d'où un vert sur douze sites dont l'un ne tenait pas | 🟠 majeur | agent **B3** | **avant la fin de la vague 3** | ouvert |
| **Q-93** | **`CLAUDE.md` §5 et §8 et `PLAN_EXECUTION` §6 décrivent une machine qui n'existe plus** — chemins, versions et procédures du conteneur Ubuntu, alors que le chantier tourne sur la VM Debian 13 | 🔵 mineur | rôle **DOC** · **orchestrateur** (`CLAUDE.md`, `PLAN_EXECUTION`) | **avant la porte S3 rejouée** | ouvert |
| **Q-94** | **Six symboles cités en commentaire n'existent plus**, dont la table des matières du déprovisionnement. C'est le motif de la **justification devenue fausse**, onzième occurrence : la phrase qui explique pourquoi l'on garde quelque chose, que personne ne relit quand l'appelant disparaît | 🔵 mineur | agents **A1**/**A2** pour `src/` · **orchestrateur** pour la documentation | `V1.1` | ouvert |
| **Q-95** | **Aucun essai ne monte la chaîne HTTP complète en `production` contre LDAPS.** Le banc tourne en `developpement` — d'où la nuance relevée au rejeu de **Q-84** : sa mutation reste verte parce que le symptôme (503 de la session provisoire) **ne peut pas apparaître** dans cet environnement | 🔵 mineur | agent **A4** / rôle **OUTILLAGE** | `V1.1` | ouvert |
| **Q-96** | **Un mot de passe juste sans accès se distingue d'un mot de passe faux** : 403 contre 401. L'écart révèle qu'un identifiant existe et que son mot de passe est le bon — oracle de moindre portée que Q-79, mais de même nature | 🔵 mineur | agent **A1** | **avant la mise en service pilote** | ouvert |
| **Q-97** | **La table de suivi de revalidation n'est pas bornée** : elle croît avec le nombre de sessions vues, sans purge | 🔵 mineur | agent **A1** | **avant la mise en service pilote** | ouvert |
| **Q-98** | **Une connexion réussie efface le compteur d'adresse**, qui est la parade anti-pulvérisation : un attaquant qui trouve un seul compte valide remet le compteur à zéro pour tous les autres | 🔵 mineur | agent **A1** | `V1.1` | ouvert |
| **Q-99** | **`ident()` n'a aucun essai, et un nom de colonne s'interpole sans elle.** Rien ne fuit aujourd'hui — les noms viennent du catalogue —, mais la fonction qui protège l'interpolation n'est éprouvée par rien | 🔵 mineur | agent **A2** | `V1.1` | ouvert |
| **Q-100** | **Le banc et le produit ne nomment pas le même rôle de lecture** (`ESSAI_UTILISATEUR_LECTURE` contre `BASE_UTILISATEUR_LECTURE`) : deux vérités pour une même chose | 🔵 mineur | agent **A4** | `V1.1` | ouvert |
| **Q-101** | **Le pré-vol d'`install.sh` est moins exigeant que la configuration du serveur** : une valeur que le script accepte fait refuser le service au démarrage — l'exploitant l'apprend après l'installation, pas pendant | 🔵 mineur | agent **B2** / rôle **DÉPLOIEMENT** | `V1.1` | ouvert |
| **Q-102** | **La réserve `LoadCredential=` du fichier systemd n'a ni propriétaire ni échéance.** Une réserve écrite sans les deux est un alibi qui se transmet de passage en passage — c'est la leçon que six passages ont payée sur Apache | 🔵 mineur | rôle **DÉPLOIEMENT** | **avant la mise en service pilote** | ouvert — le constat consiste précisément à lui **donner** un propriétaire et une échéance, faits ici |
| **Q-103** | 🛑 **Le dépôt était vert pendant que la machine fuyait.** Le correctif de **Q-89** a été commité, éprouvé et mesuré vert au banc — et la racine web servait toujours l'ancien fichier : `/opt/cyber-grc/frontend/js/modules/synthese.js`, **73 200 octets, 0 occurrence d'`exigerExport`**, contre **74 250 octets et 2 occurrences** au dépôt. Mesuré au Chromium sur le fichier **réellement servi** : `rssi.tls` téléchargeait encore. Cause : j'ai redéployé le **serveur** (`rsync dist/` + `systemctl restart`) et **pas le frontend**, qui se publie par `install.sh`. ⚠️ **La leçon est plus large que l'oubli** : ce chantier mesure d'ordinaire le dépôt, et le dépôt ne dit rien de ce qui est **servi**. C'est la variante déployée du constat **Q-52** — *« un banc vert sur l'arbre de travail ne dit rien du commit »* — d'un cran plus loin : *un commit vert ne dit rien de la machine* | 🛑 **bloquant** *(2ᵉ classe du §0 bis : l'extraction non autorisée restait possible en vol)* | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et remesuré** — republication par `install.sh --maj`, jamais par une copie à la main : le jeton de version d'`index.html` dérive du contenu, et une copie partielle laisserait un cache incohérent. **Le contrôle qui manquait est écrit** : `bash deploy/install.sh --verifier-publication` compare le **contenu** de chaque fichier servi à celui du dépôt — pas les dates ni les tailles, un fichier réécrit à taille égale étant le cas qu'on veut attraper — et rend **5** en le nommant. Il ne modifie rien, donc il se joue à tout moment, y compris quand on n'ose pas relancer une installation. Mordu des deux côtés : 64 fichiers conformes → 0 ; l'ancien `synthese.js` remis dans la racine web → **5**, « js/modules/synthese.js ». Il refuse aussi de passer sous 20 fichiers comparés, sans quoi il rendrait vert en n'éprouvant rien. Vérifié enfin au navigateur, sur le fichier **servi** : `rssi.tls` n'obtient aucun téléchargement, `rssi.groupe` l'obtient |
| **Q-104** | **Un `0` sur une table cloisonnée ne distingue pas *vide* de *non contrôlé*.** La garde de périmètre (`f_filiales_lecture()`) est évaluée **par ligne** : sur une table vide, elle ne s'exerce pas et `select count(*)` rend `0` sans erreur, là où la même requête sur la même table **non vide** échoue en « Périmètre non positionné ». L'auditeur a affiné : ce n'est pas seulement une question de lignes — **cinq tables à politique conditionnelle** (`CASE WHEN filiale_id IS NULL`, dont `documents` et `parametres`) rendent `0` en silence même quand d'autres lèvent, PostgreSQL ne pouvant pas hisser la condition. Rien ne fuit — c'est une propriété de **méthode de mesure**, pas de cloisonnement —, mais un auditeur qui lit un `0` ainsi peut conclure « la table est vide » là où il faudrait lire « je n'ai rien prouvé ». Les deux se sont produits dans la même nuit, sur le même constat **Q-88** | 🔵 mineur | agent **A4** / rôle **OUTILLAGE** | **avant la porte S5** | ouvert — l'aide de banc doit **exiger** un périmètre déclaré avant toute lecture d'une table cloisonnée, plutôt que laisser un `0` ambigu passer pour une mesure |
| **Q-105** | **Un essai du banc est instable, et un essai instable est pire qu'un essai absent.** `test/api/bornes-reprise.test.mjs` — « POOL SATURÉ : un fichier hors borne reçoit 413, un lecteur ordinaire 503 » — a **échoué** à la première exécution complète du 04/09 (1030 essais, **1029 passés, 1 échec**, sur l'assertion « sans nommer un rouage interne », contrôle S12), puis a été **vert trois fois de suite en isolation** et vert à la seconde exécution complète. Il dépend du temps : sa saturation de pool court contre les autres familles. ⚠️ **Le danger n'est pas le rouge, c'est ce qu'il enseigne** : rejouer jusqu'au vert. C'est exactement la façon dont un vrai défaut se fait congédier, et ce chantier a déjà inscrit deux constats « corrigé » qui ne l'étaient pas. Le dépôt annonce par ailleurs « 1030/1030, 0 échec » sans dire que la mesure n'est pas reproductible | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert — soit l'essai devient déterministe (saturation forcée, sans course), soit il sort du banc et devient une mesure jouée à part |
| **Q-106** | **`TOUS_LES_DOMAINES` disait « dérivés du type — jamais recopiés » et était recopié à la main.** Typé `readonly DomaineFonctionnel[]`, il admet **tout sous-ensemble** : un domaine oublié n'y faisait échouer ni la compilation ni rien d'autre. Trouvé en ajoutant `journal` au type — la compilation est passée, `test/droits/vocabulaire.test.mjs` a rougi. C'est le premier cas du tableau du `CLAUDE.md` §3 : une liste dont l'omission fait **réussir quelque chose en silence** (`SESSION_TOUS_DROITS` n'accorde pas le domaine absent ; la confrontation du frontend ne le cite pas) | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé** — `Record<DomaineFonctionnel, true>` exhaustif, dont les clés dérivent la liste : l'omission est désormais un défaut de **compilation**, comme pour `DOMAINE_PAR_ENTITE` juste au-dessus |
| **Q-107** | **Un détecteur qui compte une mention pour une lecture se mesure lui-même.** Le garde-fou écrit pour fermer Q-91 (`test/depot/reglages-lus.test.mjs`) cherchait le nom d'un réglage dans le texte brut de `src/`. Il a raté sa morsure : débrancher `API_RYTHME_MAX_ANONYME` l'a laissé **vert**, parce que le nom subsistait dans le commentaire que le débranchement venait d'écrire à côté. Il avait par ailleurs dénoncé à tort deux réglages lus par `deploy/install.sh` — *un réglage n'est pas muet parce que le serveur l'ignore ; il est muet quand RIEN dans le produit ne le lit*. Troisième occurrence sur ce chantier du motif « un contrôle qui évite le chemin réel ne mesure pas le produit » (7ᵉ passage S2, Q-58, celui-ci) | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et mordu** — les commentaires sont retirés avant toute recherche, le parcours couvre `src/`, `db/` et `deploy/`, et l'essai refuse de passer sous vingt réglages extraits. Mordu : débranchement → rouge nommant le réglage ; rebranchement → vert |
| **Q-108** | 🛑 **Une session expirée n'était NI révoquée NI journalisée — zéro fois, là où le code promettait « une fois ».** `etatDeLaSession` révoquait la session morte, écrivait son entrée `session_expiree`, puis **levait l'exception de refus à l'intérieur de la transaction** : `avecTransaction` annule sur exception, et les deux écritures repartaient avec elle. Deux mesures concordent : le journal de la recette portait 160 entrées et **aucune** `session_expiree` ; et l'essai chargé de le prouver — « une session ne meurt qu'une fois » — comparait `count(*)` avant et après, lisait **`0` les deux fois**, et concluait au vert. Il aurait rendu le même verdict si le service avait écrit une entrée par requête, c'est-à-dire dans le cas exact qu'il existe pour interdire. ⚠️ **Invisible parce que les deux moitiés se couvraient** : l'écriture était annulée, et le contrôle mesurait l'annulation contre elle-même. Trouvé en ajoutant au contrôle une exigence de **matière** — « il doit y avoir eu quelque chose à compter » | 🟠 majeur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et mordu** — la transaction rend un **verdict**, l'exception est levée après le `commit`. Le refus est identique pour l'appelant ; ce qui change est que la trace survit. Morsure : code d'origine + exigence de matière → rouge nommant le défaut ; correctif → vert |
| **Q-109** | **La couche d'authentification concaténait le login présenté dans `resume`** — sept sites —, c'est-à-dire violait à la source la règle que le lot L5 pose au `CONVENTIONS.md` §29.5 et fait respecter partout ailleurs. L'agent qui a écrit le contrat ne possédait pas `src/auth/`, l'a signalé, et a posé une **ceinture** (`normaliserResume()` neutralise les caractères de commande). La ceinture rend l'export inscindable ; elle ne rend pas la règle vraie — *normaliser une valeur d'utilisateur ne la rend pas légitime dans une phrase, elle l'y rend inoffensive* | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et gardé** — les sept phrases sont fixes, le login vit dans `utilisateur_libelle` et le nom d'affichage dans `valeurs_apres`. Un contrôle **statique** (`test/journal/regles.test.mjs`) refuse tout `resume:` contenant une interpolation, et refuse de passer s'il lit moins de vingt sources ou moins de trois fichiers émetteurs |
| **Q-110** | **Trois colonnes du journal que rien ne renseigne** : `version_application` (la colonne existe, son commentaire dit à quoi elle sert, `journaliser()` ne l'accepte pas), et `session_id` / `adresse_ip` **pour les entrées venues de `src/entites/`** — `SessionAppliquee` ne porte pas d'identifiant de session, et le dépôt n'a pas la requête. Les entrées de `src/api/` portent l'IP. Un auditeur qui corrèle « qui, depuis où, avec quelle version » ne le peut donc que pour une partie des actions | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert |
| **Q-111** | **`Depot.synchroniserAnnuaire` écrit dans `personnes` en SQL direct, sans passer par `creer`/`modifier` : ces écritures ne sont pas journalisées.** C'est l'alimentation de l'annuaire depuis l'AD à l'ouverture de session — donc une création ou une modification d'enregistrement, invisible au journal. **C'est un défaut par omission, pas un arbitrage** : personne ne l'a décidé | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert — trancher : soit ces écritures passent par le chemin journalisé, soit l'exemption est écrite et motivée |
| **Q-112** | **L'action `administration` est émise par un crochet `onResponse`, donc HORS de la transaction de l'acte** — ce que le §29.3 règle 1 interdit pour les écritures métier. Assumé et écrit dans le code : le crochet **découvre** les routes qui déclarent `administrer` au lieu d'en tenir la liste, ce qui ferme le vrai risque — une route d'administration future qui oublierait sa ligne. Les actes qui écrivent des données portent en plus leur trace transactionnelle, si bien qu'une reprise laisse **deux** entrées (`import` + `administration`) et un aperçu **une**. Conséquence à assumer : un acte d'administration dont la réponse n'arrive jamais (coupure) n'est pas tracé | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert — l'arbitrage est écrit, il demande confirmation plutôt que correction |
| **Q-113** | **Deux entités sur 21 ne sont pas exercées par l'essai de couverture du journal** : `tests_pra` (409 — la clé étrangère `scenario_id` n'est pas satisfiable génériquement) et `mappings` (403 — administration Groupe). L'essai le **dit** en `diagnostic` plutôt que de le taire, et il compte ce qu'il exerce réellement ; la couverture annoncée porte donc sur 19 entités, pas 21 | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert |
| **Q-114** | **L'entonnoir d'export mécanique est structurellement aveugle à deux des sept fichiers qui font sortir des octets.** `test/depot/entonnoir-export.test.mjs` découvre les sites de sortie par leurs mécanismes (`URL.createObjectURL`, attribut `download`, `msSaveBlob`) — or `js/services/exportExcel.js` et `js/services/exportPDF.js` n'en emploient aucun : le téléchargement est fait par **SheetJS** et par le **moteur d'impression**. Le contrôle mécanique couvre donc 5 fichiers sur 7, et les deux autres ne tiennent que par le filet comportemental de `test/navigateur/droits.test.mjs`. ⚠️ Rien ne fuit — les deux passent bien par `Droits.exigerExport()` —, mais **on croirait le contrôle mécanique plus large qu'il n'est**, et c'est ainsi que Q-89 est passé | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert — l'écrire dans l'essai lui-même, pour qu'un lecteur ne lui prête pas une portée qu'il n'a pas (§17.5) |
| **Q-115** | **L'écran du journal portait une SECONDE porte sur le réseau.** `js/modules/journal.js` appelait `fetch` par une fonction locale `demander()`, aux mêmes garanties qu'`api.js` — chemin relatif, `same-origin`, `no-store`, `redirect: error`, délai, `Api.ErreurApi` — pendant que l'entête d'`api.js` déclare depuis le lot L2 être « le SEUL point du frontend qui parle au réseau ». Le motif était réel : `js/core/api.js` n'appartenait pas au périmètre de l'agent, et un écran qui ne charge rien ne prouve rien. L'exception était **écrite, bornée, avec le geste exact pour la lever** — ce qui est la bonne façon de la porter | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé** — `Api.journal()`, `Api.journalVerification()` et `Api.journalExport()` (option `binaire` sur `appeler`) ; `demander()` retirée, plus aucune occurrence de `fetch` dans le module. Le jour où l'expiration de session ou le traitement des `401` changent, l'écran suit |
| **Q-116** | **L'essai qui devait prouver « l'interface n'est pas la barrière » ne pouvait pas la mesurer.** Il substituait le bloc `droits` en interceptant `GET /api/session` **dans le navigateur** — ce qui change ce que la PAGE croit, jamais ce que le SERVEUR décide —, puis appelait la route directement en exigeant un refus. Le serveur du fichier est monté une fois pour tous les essais, avec la session provisoire, qui porte tous les domaines : il a répondu **200** et rendu le journal. ⚠️ L'essai aurait rougi plus tôt si `journal` avait été un domaine dès le départ ; il ne l'est que depuis l'arbitrage du 04/09. C'est le motif du 7ᵉ passage de S2 — *un contrôle qui évite le chemin réel ne mesure pas le produit* | 🟠 majeur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé** — un **second serveur**, monté pour ce seul essai, dont le résolveur rend une session qui ne porte réellement pas le domaine `journal`. L'appel direct traverse le vrai crochet `onRequest`, sans substitution. Le refus par le modèle de droits est par ailleurs éprouvé côté serveur par `test/journal-lecture/` |
| **Q-117** | **La machine porte la migration 008 et sert un binaire qui ignore les routes du journal.** L'agent qui a fermé E6 a appliqué `008_journal_lecture.sql` à la base de recette — acte de déploiement, annoncé dans son rapport. Mesuré après consolidation : `grc_lecture` reçoit bien « Périmètre non positionné » (E6 fermée **en vol**, ce que le dépôt seul ne prouvait pas), la connexion AD rend 200, et `GET /api/journal` rend **404** — le service exécute le build installé avant ce lot. C'est la situation exacte du constat **Q-103**, dans l'autre sens : ici le dépôt est en avance sur la machine, et rien ne fuit | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et remesuré** — l'utilisateur a fourni `sudo` ; `install.sh --maj` a republié (⚠️ **jamais une copie à la main** : le jeton de version d'`index.html` dérive du contenu). `--verifier-publication` rend **65 fichiers servis identiques au dépôt**. ⚠️ **Le chemin suggéré dans la première rédaction de ce constat était FAUX** — il visait `/opt/cyber-grc/serveur/`, quand l'unité systemd exécute `/opt/cyber-grc/backend/dist/serveur.js`. Vérifier le chemin plutôt que l'écrire de mémoire aurait coûté une minute ; c'est le même réflexe qui manquait à Q-103. Mesuré après : `GET /api/journal` sans session rend **401** (au lieu de 404), le compte AD `rssi.tls` reçoit **403** sur les trois routes du journal **et 200 sur `/api/donnees`** — le refus vient donc du domaine `journal`, pas d'une session cassée —, et ces trois refus sont **journalisés par le crochet `onRequest`** (entrées 172-174, route, méthode, action et domaine exigés, `resume` fixe, login en colonne). L'action `demarrage` apparaît au redémarrage. Chaînage : **0 anomalie** |
| **Q-118** | 🛑 **`GET /api/journal/verification?depuis=N` livrait à une filiale la chronologie du GROUPE ENTIER.** `f_journal_audit_verifier()` est `security definer` — nécessaire, et écrit : cloisonnée, elle crierait à la falsification à chaque frontière de périmètre. Mais elle était exposée **sans distinction de périmètre**, et son paramètre `depuis` en faisait un **oracle exact** : pour tout `N`, elle rend une ligne `chaine_tronquee` portant le `numero`, l'`id` et l'**horodatage à la microseconde** de la première entrée de numéro ≥ N — et `numero` étant strictement croissant **et sans trou** (§12), cette ligne décrit exactement l'entrée n° N. Au-delà du dernier maillon, `sain: true` rend le **volume total**. Mesuré depuis une session d'une seule filiale : **11 maillons hors périmètre reconstruits sur 14**, quand la lecture n'en rend que 4 — entrées transversales comprises, celles-là mêmes que le §29.7 réserve nommément au Groupe. ⚠️ **Ce qui a laissé passer** : `test/journal-lecture/routes.test.mjs` **mesurait ce comportement et le consacrait comme désirable** ; il n'était pas faux, il ne posait simplement jamais la question *« et qu'apprend celle qui n'a pas le droit ? »* | 🛑 **bloquant** *(2ᵉ classe du §0 bis : fuite de métadonnées inter-filiales)* | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et mordu** — la route exige le **périmètre Groupe**, et l'exigence est **déclarée** (`DeclarationAcces.perimetre`), prononcée par `onRequest` avant l'analyse du corps. ⚠️ La première rédaction était un `if` dans la route : `routes.test.mjs` l'a refusée, interdisant tout `403` local au motif que *« le refus doit venir de la déclaration d'accès »* — l'essai avait raison, et la réponse n'était pas de l'assouplir mais d'apprendre au vocabulaire d'accès à exprimer un périmètre. L'essai qui consacrait le défaut est **retourné**. ⚠️ Le canal **SQL** reste ouvert : `grc_app` conserve `execute` sur la fonction, nécessaire à la route — risque assumé du §17.4 |
| **Q-119** | **`utilisateur_libelle` portait le NOM D'AFFICHAGE pour une connexion réussie, et chercher par login rendait 0 résultat sur 33, en silence.** ⚠️ **Régression introduite le jour même en fermant Q-109** : en retirant le login du `resume`, j'ai retiré le seul endroit où il figurait en clair — et le commentaire que j'ai écrit juste en dessous **affirmait le contraire de la vérité** (« le login part dans `utilisateurLibelle` ci-dessus »). Le type le dit pourtant depuis le début : *« l'identité telle que présentée — le login présenté suffit »*, et les six autres sites d'appel passent tous un login. ⚠️ Le rapport d'audit écrit « le login n'est **nulle part** » ; c'est une nuance près : `utilisateur_id` est peuplé (69/69) et résout au login. Ce qui était perdu est la **recherche**, pas la donnée | 🟠 majeur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et gardé** — `utilisateurLibelle: identite.login`, nom d'affichage en `valeurs_apres`. Deux essais : la recherche par login retrouve l'entrée, et un contrôle **statique** refuse tout `utilisateurLibelle: …nomAffichage` dans `src/auth/` |
| **Q-120** | **L'extrait du journal était plafonné EN SILENCE, et le code promettait l'inverse** — *« le plafond est un refus explicite plutôt qu'une troncature muette, qui donnerait à l'auditeur un extrait incomplet qu'il croirait entier »*. Le 400 ne portait que sur le **paramètre** `limite` ; le nombre de lignes n'était jamais compté. Au-delà de 50 000 entrées lisibles, tout export rendait les 50 000 plus récentes en se présentant comme l'extrait demandé — et **Q-122** montre qu'atteindre 50 000 ne demande que quelques minutes | 🟠 majeur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé** — on demande **un enregistrement de plus que le plafond** ; s'il arrive, refus **400** disant comment obtenir la suite. ⚠️ Le refus ne vise que le plafond **implicite** : la première rédaction refusait aussi un `limite` explicitement demandé, ce que le banc a signalé — *un appelant qui demande deux lignes et reçoit 400 n'a pas été protégé, il a été empêché*. Le discriminant est **qui a posé la borne** : le serveur, que l'appelant ne voit pas ; ou son propre paramètre, dont il attend l'effet. Seul le premier ment |
| **Q-121** | **L'extrait CSV était cité selon le RFC 4180 et EXÉCUTABLE par le tableur auquel il est destiné.** La citation protège la **structure** de la ligne, jamais l'**interprétation** : un tableur retire les guillemets puis évalue toute cellule commençant par `=`, `+`, `-` ou `@`. Le format est explicitement destiné à Excel (BOM UTF-8, séparateur `;`), et `utilisateur_libelle` porte, pour une connexion refusée, **le login présenté par un attaquant non authentifié**. Mesuré : **5 charges sur 5** ressortent intactes (`=cmd`, `@SUM`, `+HYPERLINK`, `-2+3+`, `=WEBSERVICE`). La cible n'est pas le serveur, c'est **le poste de l'auditeur externe** à qui l'on transmet la pièce. ⚠️ **Le §29.8 n'exigeait que `\r\n`, `"` et `;`** : l'omission est celle du **contrat**, pas de qui l'a appliqué | 🟠 majeur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et mordu** — toute valeur commençant par une amorce de formule est préfixée d'une apostrophe **à l'export seulement** : le journal fait preuve, on ne réécrit pas ce qu'il contient. L'essai éprouve les cinq charges **et** qu'une valeur ordinaire reste intacte. Le §29.8 est complété |
| **Q-122** | **Toute lecture du journal écrit dans le journal, sans borne.** 100 lectures en **291 ms** produisent **+100 entrées définitives** dans une table en ajout seul et non purgeable par l'application : le limiteur de rythme ne compte que les refus d'identité, et une session légitime n'est bornée par rien. Chaîné à **Q-120**, un compte autorisé peut porter le journal au-delà du plafond d'export en quelques minutes, après quoi tout extrait d'audit est incomplet. ⚠️ Le constat est **le prix d'une propriété voulue** — « lire le journal est un acte tracé » (§29.8) — pas d'un oubli | 🟠 majeur | **orchestrateur** | `V1.1` | ouvert — pistes : ne tracer qu'une consultation par session et par fenêtre, ou borner le rythme des lectures authentifiées, ou tracer la consultation **hors** de la chaîne scellée |
| **Q-123** | **La vérification PARTIELLE que le §12 prescrit rend `sain: false` sur un journal parfaitement intact.** `f_journal_audit_verifier(depuis)` émet une ligne `chaine_tronquee` — *informative* selon le §12 — que la route compte comme une anomalie. Un exploitant qui suit la prescription (« contrôle rapide sur les entrées récentes ») lit donc une alerte de falsification sur une chaîne saine. ⚠️ Et l'essai qui couvre ce cas **n'interroge jamais `sain`** : il vérifie la liste des anomalies, pas le verdict | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert — `sain` doit ignorer les anomalies marquées informatives, et l'essai doit l'interroger |
| **Q-124** | **Le commit qui livre L5 embarquait une documentation d'état décrivant l'état d'AVANT L5** : `README` §8 « le travail en cours est L5, chiffré à 4 actions sur 20 », table de dette « la lecture du journal n'est pas cloisonnée », tableau des routes annonçant **douze** routes sans les trois du journal, et **aucune entrée `CHANGELOG` pour L5**. *Ce n'est pas du retard, c'est une négation* — la formule du constat **Q-90**, un jour plus tôt, sur le même fichier. **Neuvième occurrence de la famille Q-4.** ⚠️ **Cause mécanique, et elle m'appartient** : j'ai lancé l'agent de documentation **en parallèle** des agents L5 en lui interdisant explicitement de décrire L5 — ce qui était juste — puis je n'ai pas écrit le bilan à la clôture. Le garde-fou `chiffres-du-banc.test.mjs` ne peut pas le voir : il vérifie le compte d'essais et les versions, jamais l'**état des lots** | 🟠 majeur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé** — chapeau, table des lots, deux lignes de dette, tableau des routes (quinze) et entrée `CHANGELOG` écrits. ⚠️ **Le garde-fou manque toujours** : rien ne confronte l'état des lots au réel, et c'est **Q-87** sous un autre angle — *le document est confronté à lui-même* |
| **Q-125** | **Des enregistrements réels sont créés et modifiés sans aucune trace** : 23 lignes `groupes_ad`, 1 `utilisateurs`, 1 `personnes` écrites par l'installation et l'ouverture de session, hors du chemin journalisé. Le `PLAN_SERVEUR` §1.7 exige les « actions d'administration (création de filiale, **changement de droits**) » : la déclaration des groupes AD *est* le paramétrage des droits. **Met le contrôle S3 en échec.** Le constat **Q-111** n'en nommait qu'un tiers (`personnes`) | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert — **remplace et absorbe Q-111**, qui sous-estimait le périmètre |
| **Q-126** | **Le 14ᵉ domaine ne sépare rien dans le socle livré** : un seul profil sur huit porte `journal`, et c'est `ADMIN`, qui porte déjà `parametres`, `filiales` et `droits`. L'arbitrage du 04/09 est **juste et sans effet mesurable aujourd'hui** — il ferme pour le profil paramétré de demain. ⚠️ Ce n'est pas un défaut du détachement, c'est un défaut de **ce que le socle propose** : aucun profil « auditeur du journal » n'existe, alors que le `PLAN_SERVEUR` §3.2 le nomme | 🔵 mineur | **orchestrateur** | `V1.1` | ouvert — soit le socle gagne un profil qui porte `journal` et rien d'autre, soit l'écart est écrit |
| **Q-127** | **Trois chiffres pour une même grandeur** : le contrat `CONVENTIONS.md` §29.2 dit **16** actions à la sortie de L5 ; le `CLAUDE.md`, le `CHANGELOG` et le message de commit disent « de 4 à **14** » ; la machine en porte **7**. Les trois sont vrais et mesurent des choses différentes — *émissibles par le code*, *émises par un scénario d'essai*, *observées en recette* — et **aucun document ne les réconcilie**. C'est le motif de Q-90 : *un chiffre qui vit à deux endroits finit par n'en dire qu'un vrai* | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé** — le chiffre normatif est **16 émissibles sur 20**, et il est employé partout ; ce qu'une machine observe dépend de ce qu'on lui a fait faire, et se cite avec sa date. Les quatre non émissibles restent reportées par écrit avec leur lot |
| **Q-128** | **« La machine est hors ligne » était faux, et je l'ai propagé de deux rapports d'agents jusqu'au `CLAUDE.md` et à un message de commit, sans le vérifier.** Mesuré le 04/09 : SRV-Infra porte l'IP publique `212.227.38.92` ; `GET https://registry.npmjs.org/` → **200 en 60 ms**, `POST` sur la même racine → **403 en 56 ms**, `GET https://github.com/` → **200 en 57 ms**. Ce qui échoue est **un seul point d'accès** — `POST /-/npm/v1/security/advisories/bulk` rend **503** ou reste sans réponse au-delà de 20 s —, la même URL répondant **405 en 202 ms** en `HEAD`. ⚠️ **Le défaut n'est pas le mien seul** : deux agents indépendants ont conclu « hors ligne » d'une seule commande qui n'a pas rendu la main, et je l'ai accepté parce que les deux le disaient. **Deux sources ne valent pas une mesure quand elles héritent du même raisonnement.** Trouvé parce que l'utilisateur a demandé « de quelle machine tu parles ? tu es en exécution dans le VPS directement » — la question qu'aucun des trois n'avait posée | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé** — `CLAUDE.md` dit désormais ce qui a été mesuré, et distingue ce qu'on sait (S15 ne se rejoue pas, un point d'accès rend 503) de ce qu'on ignore (service dégradé côté npm, ou filtrage de cette requête en sortie). Le contrôle **S15 reste non rejoué** ; ce qui change est qu'on cherchera au bon endroit |
| **Q-129** | **« Aucun compte de recette ne porte `GRC-EXPORT` » était faux, et cette réserve a fait renoncer à trois mesures.** Le rapport S4 s'en sert pour classer l'export du journal « non vérifiable ici », et j'ai repris la conclusion. Mesuré : `samba-tool user getgroups rssi.groupe` rend **`GRC-EXPORT`**. La conclusion était juste pour une **autre** raison — `rssi.groupe` porte l'export mais **pas** le domaine `journal`, et `admin.grc` l'inverse : aucun compte ne réunissait les deux axes, ce qui est le modèle de droits **fonctionnant correctement**. ⚠️ **Le motif est celui de Q-128, à un jour d'intervalle** : une capacité déclarée absente sans être essayée. Et l'AD est **modifiable** — l'utilisateur l'a rappelé : *« t'as créé un docker pour simuler l'AD et tu peux y ajouter les utilisateurs et l'organisation que tu souhaites pour les tests »* | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé, et les trois angles morts sont comblés** — `admin.grc` ajouté à `GRC-EXPORT`, puis mesuré **à travers Apache** : export **200, 118 360 octets, 219 lignes** ; et **Q-121 prouvé en production** — un login forgé `=WEBSERVICE("…")` présenté par un attaquant **non authentifié** ressort de l'extrait en `"'=WEBSERVICE(`, désamorcé. L'environnement est désormais décrit au `CLAUDE.md` **§0**, mesure par mesure |
| **Q-130** | **Le garde-fou du registre comptait les BARRES, pas les cellules — et il a laissé passer sept lignes abîmées.** Un script de maintenance s'est trompé d'un indice de colonne : il a écrit l'échéance **par-dessus l'état** de quatre constats (« documenté, non fermé », « coche retirée » — effacés), et le texte du nouvel état **après la dernière barre**, où Markdown l'ignore. `registre.test.mjs` est resté **vert** : `\| a \| b \|` porte trois barres et `\| a \| b \| c` aussi, le texte ajouté après la dernière n'étant pas une cellule ; et la case d'état, écrasée par « `V1.1` », n'était pas vide non plus. ⚠️ **Troisième occurrence du motif en une journée** — après Q-108 et Q-116 : *un contrôle qui mesure autre chose que ce qu'il prétend mesurer rend le même vert qu'un contrôle qui a tout vu.* Trouvé parce que la sortie d'un `awk` de vérification a montré l'état là où l'échéance était attendue | 🔵 mineur | **orchestrateur** | fermé le 04/09 | ✅ **corrigé et mordu** — l'édition a été annulée (`git checkout`) puis rejouée sur les bons indices, avec une assertion sur le nombre de cellules. Le garde-fou refuse désormais **tout texte après la dernière barre**. Mordu : une ligne prolongée → rouge la nommant ; restaurée → vert |

**Arbitrage sur Q-43 — la règle plutôt que le nombre.** Deux remèdes se présentent : étendre le
jeton de version aux images, ou raccourcir leur durée de cache. Je ne choisis ni l'un ni l'autre,
parce que choisir un nombre laisse le prochain type d'actif retomber dans le même trou — c'est
exactement ce qui vient de se produire. **L'invariant à poser est celui-ci : un actif ne reçoit un
cache long que si son URL est versionnée.** Le reste en découle et se mesure : établir quelles
images sont référencées depuis `index.html` (que le jeton réécrit déjà) et lesquelles ne le sont
que depuis une feuille de style ; étendre le jeton aux premières ; donner aux secondes la durée
courte, faute de pouvoir les versionner sans réécrire le CSS. Et **un garde-fou qui refuse un type
mis en cache long que le jeton ne couvre pas** — sans lui, la règle est un commentaire, et le
prochain `.woff2` ajouté au bloc long passera comme le `.png` est passé.

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
