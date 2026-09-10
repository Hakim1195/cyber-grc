# Porte S8 — septième passage

> **Auditeur indépendant.** Je n'ai écrit aucune des lignes que j'examine, et je n'ai modifié
> aucun fichier du produit, du banc ou de la documentation : `git status` est resté vide de
> bout en bout, et **ce rapport est le seul fichier que j'écris**.
> **Date** : 10/09/2026. **Révision examinée** : `462a220` — *« Réancrer les chiffres sur
> 3e885c6 : 1822 essais, depot 43 → 49 »*.
> **Machine** : `SRV-Infra`, Debian 13 (trixie) — PostgreSQL 17.11, Apache 2.4.68, ClamAV
> actif, contrôleur de domaine Samba réel `grc-ad` (`EXEMPLE.INTERNE`), recette en ligne sur
> `https://grc.exemple.interne/`, Chromium réel (`/opt/pw-browsers/chromium-1234`).
> **Mutations jouées sur une copie du dépôt** (`scratchpad/mut/`), jamais sur l'arbre.
>
> ⚠️ **Constats RENUMÉROTÉS après coup — Q-279 → Q-290 —, et pour la seconde fois en deux
> jours.** L'orchestrateur avait réservé à cet audit une plage seize rangs plus loin dans la
> suite, sans tenir compte du fait que les constats de la porte S7 venaient eux-mêmes d'être
> décalés d'autant vers le bas, ce qui libérait la place. Le garde-fou `test/documentation/registre.test.mjs`
> — « LA NUMÉROTATION est continue et sans doublon » — a rougi en nommant les seize trous.
> *Une plage réservée est exactement le genre de convention qui devient fausse*, et c'était
> déjà la leçon de la veille : elle a dû être apprise deux fois. La suite est continue.

---

## 1. LE VERDICT

> ## ❌ **REFUSÉE** — 0 bloquant, **6 majeurs**, 6 mineurs, **0 fuite entre filiales**
>
> **Deux contrôles en échec : S7** (le droit d'export) et **S16** (les garde-fous sont
> branchés). Un contrôle en échec ne se franchit pas — c'est la lecture appliquée depuis le
> quatrième passage de la porte S1, et elle ne change pas parce que le lot paraît proche de
> la fin.
>
> **Le motif en une phrase** : *les treize livraisons non auditées portent, à elles seules,
> six défauts majeurs — dont trois barrières qui sont annoncées comme fermées, et qui ne
> mordent pas.*

### 1.1 Ce que ce passage établit, et qui n'est pas le négatif

Le cœur du produit est **plus solide qu'à aucun passage** : cloisonnement **107/107** sous
`grc_app`, **50 tables sur 50 en `force row level security`**, banc **1 822/1 822 joué deux
fois**, **31 écrans sur 31** parcourus dans un Chromium réel derrière l'Apache du dépôt
**sans une violation de politique de sécurité de contenu**, et **sept sondes inter-filiales
sur les surfaces neuves** qui rendent toutes 404 **sans oracle**. Le §7 le détaille.

Ce qui échoue n'est pas le cloisonnement. Ce sont **les gardes posés depuis le 6ᵉ passage** :
trois d'entre eux passent au vert sur une mutation qui détruit exactement ce qu'ils gardent.

### 1.2 Le tri du `PLAN_EXECUTION` §0 bis

| Classe | Compte | Constats |
|---|---|---|
| **Bloque le fonctionnement** | **0** | — |
| **Fuite ou perte de données entre filiales** | **0** | aucune filiale ne voit ni n'écrit chez une autre ; mesuré au §7.1 et au §5.1 |
| **Tout le reste** | **12** | Q-279 → Q-290 |

⚠️ **Q-279 est à la frontière de la deuxième classe et je l'ai tranché explicitement.** Un
compte sans `GRC-EXPORT` extrait **le jeu de données complet de sa filiale** sans laisser de
trace. Ce n'est **pas** une fuite *entre filiales* — la RLS borne, et je l'ai vérifié : le
même compte ne reçoit rien de la filiale voisine. C'est une **extraction non autorisée à
l'intérieur du périmètre légitime**, non journalisée : elle relève du contrôle **S7**, qu'elle
met en échec pour la deuxième porte consécutive.

---

## 2. LES CONSTATS — numérotés à partir de Q-279

| # | Énoncé (résumé) | Gravité | Où |
|---|---|---|---|
| **Q-279** | Un compte sans droit d'export extrait le jeu complet **sans trace**, en restant sous le seuil de 12 h de `rafraichir` | 🟠 majeur | §3.1 |
| **Q-280** | La barrière de publication D5 se contourne **de deux façons**, dont une en un seul appel d'API | 🟠 majeur | §3.2 |
| **Q-281** | Les deux garde-fous neufs vérifient qu'un déclencheur **existe**, jamais **sur quel événement il se déclenche** | 🟠 majeur | §3.3 |
| **Q-282** | D1 : supprimer la pièce « en vigueur » laisse la fiche annoncer sa version **au-dessus de zéro fichier** | 🟠 majeur | §3.4 |
| **Q-283** | Le garde de Q-257 mesure la **longueur** des intitulés, pas leur originalité : une reprise verbatim des titres officiels passe au vert | 🟠 majeur | §3.5 |
| **Q-284** | `approbations` est le **second lien polymorphe** sans clé étrangère, et la leçon de D2 ne lui a pas été appliquée | 🟠 majeur | §3.6 |
| **Q-285** | Une pièce dont l'écart d'intégrité est **constaté et inscrit** reste délivrée en 200, et reste celle qui « fait foi » | 🔵 mineur | §4.1 |
| **Q-286** | `GET …/integrite` : amplification mesurée de **~15 000×** en octets, sans limitation de rythme | 🔵 mineur | §4.2 |
| **Q-287** | Un document de portée Groupe portant les pièces de deux filiales n'est supprimable depuis **aucune** session tant qu'on n'a pas fait le tour des filiales | 🔵 mineur | §4.3 |
| **Q-288** | `CLAUDE.md` §0.2 et §5 donnent pour Playwright un chemin qui **n'existe pas sur cette machine** | 🔵 mineur | §4.4 |
| **Q-289** | La migration `020` est la seule des quatre à **n'apporter aucun garde-fou de schéma** | 🔵 mineur | §4.5 |
| **Q-290** | La quarantaine croît sans rapprochement ni compte rendu à l'exploitant | 🔵 mineur | §4.6 |

---

## 3. LES SIX MAJEURS

### 3.1 Q-279 — le contrôle S7 est en échec, et la phrase qui a fermé Q-242 est fausse

**Ce que dit le registre**, à la ligne de fermeture de **Q-242** (`PLAN_EXECUTION` §7) :

> « La borne est `SESSION_DUREE_MAXIMALE` : au-delà, aucun sondage légitime ne peut demander
> cette fenêtre […] **et elle ne se contourne pas en avançant `depuis`, qui rend alors des
> sondages ordinaires.** »

Le même raisonnement est recopié dans le code, `src/api/index.ts:2224` : *« un appelant qui
pagine émet alors des sondages ordinaires, qui ne rendent chacun que ce qui a changé dans
leur fenêtre »*.

**La mesure le dément.** `rafraichir` n'a **pas de borne supérieure** : il rend tout ce qui a
changé *depuis* `depuis` **jusqu'à maintenant**. Un `depuis` sous le seuil n'est donc pas une
fenêtre étroite, c'est **toute la traîne**.

Compte `rssi.tls`, **non membre de `GRC-EXPORT`** (`droits.export = false` dans sa charte de
session), à travers Apache :

```
$ curl -b ck -X GET '…/api/rafraichir?depuis=2026-09-09T23:16:22.000Z'   # maintenant − 11 h 30
HTTP=200
delta journal = 0
volumes: {'actions': 3, 'risques': 2, 'audits': 1, 'documents': 2, 'history': 5, 'personnes': 6}
total = 19 lignes / 6 collections

$ curl -b ck -X GET '…/api/donnees'                                       # la route TRACÉE
HTTP=200 ; delta journal = 1 → « consultation_sensible | Chargement du jeu de données complet »
jeu complet = 19 lignes ; {'actions': 3, 'risques': 2, 'audits': 1, 'documents': 2, 'history': 5, 'personnes': 6}
```

**Les deux charges sont identiques, collection par collection.** L'une laisse une trace,
l'autre non. Le seuil ne sépare donc pas « sondage » et « extraction » : il sépare
*« extraction de plus de douze heures »* et *« extraction de moins de douze heures »*.

⚠️ **Et le cas où cela mord le plus fort est le cas nominal du produit** : après une
**reprise** ou un **import**, toutes les lignes touchées portent un `updatedAt` récent. Le
jeu entier d'une filiale se retrouve alors **dans la fenêtre non tracée**, pour tout compte
qui peut le lire — c'est-à-dire pour tous.

**La preuve attendue du contrôle S7** est : *« Tout export réussi ou refusé est journalisé »*.
Elle n'est pas tenue. **Contrôle S7 : ❌ EN ÉCHEC**, pour la deuxième porte consécutive.

**Ce qu'il faudrait faire, sans le faire** : la borne juste n'est pas temporelle, elle est
**volumétrique** — tracer quand la réponse dépasse un nombre de lignes ou de collections, ce
que le code calcule déjà (`lignes`, `Object.keys(charge.modifications).length`) et jette. Un
sondage de vingt secondes rend zéro à trois lignes ; une extraction en rend des milliers. Et
la phrase du registre qui affirme le contraire doit être **retirée ou corrigée** : une
justification fausse dans un registre est pire qu'une justification absente, parce qu'elle
dispense le passage suivant de mesurer.

---

### 3.2 Q-280 — D5 : la barrière de publication se contourne, et l'une des deux voies tient en un appel

La migration `019` écrit, dans son propre en-tête, qu'elle ferme **deux** cas — et le second
est présenté comme *« la moitié que la formulation littérale de D5 laissait ouverte, et qu'un
relecteur aurait trouvée en une minute »* :

> « · **un circuit existe** pour ce document, quel que soit son statut : **on ne le contourne
> pas en repassant par « brouillon »**. »

**Voie 1 — deux clics dans l'interface.** La condition du déclencheur est
`v_dernier_tour is null and old.statut is distinct from 'en validation'` : la seconde moitié
ne s'arme que s'il existe **au moins une ligne** dans `approbations`. Un document qu'on a
déclaré « en validation » **sans avoir encore prononcé une seule étape** se publie donc en
repassant par « brouillon ». Mesuré sur la recette, compte `rssi.tls` :

```
PUT /api/entites/documents/DOC-…52uwh  {"statut":"en vigueur"}   → 409  GRC06
    « Ce document ne peut pas être mis « en vigueur » : son circuit d’approbation n’est pas terminé. »
PUT …                                   {"statut":"brouillon"}    → 200
PUT …                                   {"statut":"en vigueur"}   → 200   ← publié
psql : select statut … → « en vigueur »
```

Et le journal d'audit garde la trace des deux, **à trois lignes d'écart** :

```
refus_autorisation | DOC-…52uwh | Publication refusée : le circuit d’approbation du document n’est pas conclu.
modification       | DOC-…52uwh | Modification d’un enregistrement.
modification       | DOC-…52uwh | Modification d’un enregistrement.
```

**Voie 2 — un seul appel d'API, et elle est pire.** `trg_documents_publication` est déclaré
`before **update**`. Rien ne garde l'**insertion**. `POST /api/reprise` insère :

```
POST /api/reprise  {"mode":"fusionner","fichier":{"nom":"audit.json","contenu":"{…\"documents\":[{
   \"id\":\"DOC-1789099999999-…\",\"titre\":\"…\",\"type\":\"Politique de sécurité (PSSI)\",
   \"statut\":\"en vigueur\",\"version\":\"9.9\"}]…}"}}
→ 200  {"applique":true,"crees":{"documents":1}}
psql : select statut … → « en vigueur »   ·   approbations pour ce document = 0
```

Une **PSSI en vigueur**, version 9.9, **zéro étape d'approbation**, créée par un compte qui
porte `administrer`. La question d'audit que la migration cite en tête — *« qui a validé cette
PSSI ? »* — reçoit à nouveau la réponse *« personne, mais elle est en vigueur »*.

**Ce qu'il faudrait faire, sans le faire** : porter le déclencheur sur `insert or update`, et
remplacer la condition « un circuit existe » par une condition qui ne dépend pas de
l'existence d'une ligne — par exemple mémoriser sur le document qu'il a été déclaré « en
validation » au moins une fois. ⚠️ Attention au second effet : sur `insert`, une reprise
légitime d'un export contenant des documents en vigueur **doit** rester possible ; le remède
ne peut donc pas être un simple élargissement de l'événement.

---

### 3.3 Q-281 — les garde-fous neufs reconnaissent un déclencheur, ils ne mesurent pas ce qu'il garde

C'est le motif nommé au **4ᵉ passage de S8** (« les garde-fous cessent de reconnaître, ils
mesurent », constats Q-220 → Q-222). Il est revenu dans **les deux garde-fous écrits après
cette leçon**.

`f_verifier_declencheurs_pieces()` (migration `017`) et `f_verifier_publication_documents()`
(migration `019`) vérifient : que le déclencheur **existe**, qu'il est armé **`always`**, et —
pour le second — que la valeur `en validation` est bien au `check`. **Aucun des deux ne
regarde `tgtype`**, c'est-à-dire l'événement.

**Mutation 3** — `019`, `before update` → `before insert`, sur une base neuve :

```
$ node db/migrate.mjs
  020_verification_integrite.sql .......... appliquée en 52 ms
  Schéma à jour : 20 migration(s) appliquée(s) sur 20.
  garde-fous du schéma (f_verifier_schema, point d'appel unique) : aucune anomalie.

$ psql -c 'select * from f_verifier_schema();'
 controle | objet | anomalie | detail
----------+-------+----------+--------
(0 rows)

$ psql -c "select tgname, tgtype, tgenabled from pg_trigger where tgrelid='documents'::regclass …"
 trg_documents_publication  type=7   enabled=A     ← 7 = BEFORE|INSERT|ROW  (19 attendu)
```

**Mutation 4** — `017`, `after delete` → `after insert`, sur les **32** tables porteuses :

```
$ node db/migrate.mjs
  Schéma à jour : 20 migration(s) appliquée(s) sur 20.
  garde-fous du schéma : aucune anomalie.
$ psql -c 'select * from f_verifier_schema();'  → (0 rows)
```

Autrement dit : sur la machine d'un client, `deploy/install.sh` et `install.sh --diagnostic`
imprimeraient

```
  ok  schéma         f_verifier_schema() → 0 anomalie
```

pendant que **toute suppression laisse ses pièces jointes en base, sur le disque, dans le
quota — et délivrables par `GET /api/pieces/…`**, c'est-à-dire exactement les constats
Q-232 / Q-233 que la migration `017` déclare fermés **à la classe**.

**Ce qui sauve, et il faut le dire** : le **banc** mord dans les deux cas — 11/11 rouges pour
la mutation 4 sur `test/pieces/orphelines.test.mjs`, 3/5 rouges pour la mutation 3 sur
`test/approbations/publication-documents.test.mjs`. Mais le banc ne tourne pas chez le client,
et le §18.4 des `CONVENTIONS` fait du **chemin de déploiement** le critère. **Contrôle S16 :
❌ EN ÉCHEC.**

⚠️ **Le contraste est instructif** : le garde de D1 (`f_verifier_piece_en_vigueur`), lui,
**mesure** — il lit les colonnes de l'index et le prédicat partiel dans `pg_index`. Retirer
`filiale_id` de l'unicité fait rougir **deux** contrôles (§6, mutation 2). La différence n'est
pas l'auteur ni la date : c'est que l'un interroge une **propriété** et les autres une
**présence**.

**Ce qu'il faudrait faire, sans le faire** : ajouter `tgtype` au prédicat des deux fonctions —
et, plus généralement, poser la règle qu'un garde-fou de déclencheur nomme **l'événement**,
pas seulement le nom. Le catalogue le rend en une colonne.

---

### 3.4 Q-282 — D1 : la version reste affichée au-dessus de zéro fichier

L'action **D1** existe pour une phrase, écrite dans `src/pieces/index.ts:222` :

> « la version d'une politique se déclare avec le fichier qui la porte, **pas dans un champ
> voisin qui peut annoncer « 2.1 » au-dessus du PDF de la 1.4** ».

`documents.version_document` est écrit par `refleterVersionSurDocument()`, qui a **un seul
appelant dans tout `src/`** : la promotion `POST …/en-vigueur` (`src/pieces/index.ts:927`). Ni
la suppression d'une pièce, ni le déclencheur de la migration `017`, ne le remettent en cause.

Mesuré de bout en bout sur la recette :

```
POST /api/entites/documents           → DOC-1789034226419-br0nz6…
POST /api/pieces/documents/<doc>      -F version=1.4        → PJ-1789034226478-3t0jgb…
POST …/<pj>/en-vigueur                → 200
psql : version_document = 1.4                                        ← correct

DELETE /api/pieces/documents/<doc>/<pj>                     → 204
psql : version_document APRES = 1.4  |  pièces restantes = 0        ← la fiche ment

GET /api/donnees  →  {"id":"DOC-1789034226419-…","titre":"…","version":"1.4","statut":"brouillon"}
```

La SPA reçoit **`version: "1.4"`** pour une fiche qui ne détient **aucun** fichier. Ce n'est
plus « 2.1 au-dessus du PDF de la 1.4 » : c'est **1.4 au-dessus de rien**, et le produit sert
de preuve en audit ISO 27001.

**Ce qu'il faudrait faire, sans le faire** : le reflet ne doit pas être un geste de la route
de promotion, mais une **propriété tenue par la base** — la suppression d'une pièce
`en_vigueur` doit remettre `version_document` à ce que dit la pièce qui la remplace, ou à
`null`. C'est le même raisonnement que D2 : *un relais que le schéma ne peut pas exprimer se
prend dans la base, pas dans une route ; une route ne voit que son chemin.*

---

### 3.5 Q-283 — le garde de Q-257 mesure la longueur, pas l'originalité

La porte S7 a reproché aux catalogues de reprendre les **intitulés officiels ISO**
(constat Q-253, 🛑 bloquant à l'origine). Le remède posé au banc,
`test/depot/traductions-catalogues.test.mjs` §« Le texte FRANÇAIS reste une reformulation »,
garde la propriété affirmée par le `PLAN_SERVEUR` §4.2 — et il la garde **par la longueur
moyenne des intitulés** (`MOYENNE_MAX = 80`, `PLUS_LONG_MAX = 200`), au motif écrit qu'*« une
reformulation est courte, un copier-coller ne l'est pas »*.

**La mesure retourne l'argument.** Les intitulés **officiels** de l'Annexe A, tels que le
dépôt les porte lui-même dans `js/data/en/ref_iso27002.js`, font **29 signes de moyenne** — le
catalogue français en fait **28**. Le catalogue le plus exposé à une reprise verbatim est donc
celui que la métrique classe comme **le plus original**.

**Mutation 9**, sur la copie : les **93** intitulés français d'ISO 27002 remplacés par les
**93 intitulés officiels ISO** du fichier anglais.

```
MUTATION : 93 intitules francais remplaces par les intitules OFFICIELS ISO
$ node --test test/depot/traductions-catalogues.test.mjs
# tests 11
# pass 11
# fail 0
```

**Le garde ne voit rien.** La question que ce chantier s'est apprise à poser — *« qu'est-ce
qui passerait aussi ? »* — a ici une réponse nette : **la faute même qu'il est censé
empêcher**.

**Ce qu'il faudrait faire, sans le faire** : une longueur ne peut pas décider de
l'originalité. Ce qui se mesure réellement est la **coïncidence** — comparer chaque intitulé
français au corpus des titres normatifs dont le dépôt dispose déjà (le fichier anglais, les
codes de clause), et faire rougir la reprise **littérale**. À défaut, il faut écrire que la
propriété n'est **pas** gardée par une machine, plutôt que de laisser croire qu'elle l'est —
c'est la différence entre une réserve et un alibi.

---

### 3.6 Q-284 — `approbations` est le second lien polymorphe, et D2 ne l'a pas vu

La migration `017` pose la leçon en toutes lettres, et le `CLAUDE.md` la reprend :

> *le relais d'une cascade que le schéma ne peut pas exprimer — **un lien polymorphe n'a pas
> de clé étrangère** — se prend DANS LA BASE, sur chaque table porteuse, jamais dans les
> routes.*

`pieces_jointes` porte `(entite_type, entite_id)`. **`approbations` porte
`(objet_type, objet_id)`**, sans clé étrangère non plus — sa seule clé étrangère vise
`filiales`. Elle a bien reçu le déclencheur de D2 **en tant que porteuse de pièces**
(`trg_approbations_pieces`), et **rien** en tant que dépendante d'un objet.

Mesuré sur la recette :

```
document DOC-1789032825490-22kkh5… + circuit complet (redaction, revue, approbation, publication)
approbations AVANT           = 4
DELETE /api/entites/documents/<doc>?version=…   → {"supprime":true}
document restant             = 0
approbations APRÈS           = 4        ← elles survivent
```

Ces quatre lignes sont **inatteignables** — `GET /api/approbations/documents/<doc>` rend 404,
la route lisant d'abord l'objet — et **indestructibles** : `trg_approbations_verrou` rend
l'irréversibilité, à dessein. **Elles sont encore dans la base de recette au moment où j'écris
ce rapport** : mon propre ménage n'a pas pu les retirer.

```
select count(*) from approbations a where not exists (select 1 from documents d where d.id = a.objet_id);
 → 4
```

**Conséquences** : le registre d'approbation accumule des décisions sur des objets qui
n'existent plus, avec leur `acteur_libelle` et leur `commentaire` libre ; et les identifiants
métier étant conservés à l'octet près par la reprise (propriété revendiquée du round-trip),
un objet restauré sous son ancien identifiant **récupère un circuit** que personne n'a
rattaché.

⚠️ **Ce qui atténue, et il faut le dire** : la purge RGPD (`src/cycle/index.ts`) **découvre**
ses colonnes au lieu de les réciter et termine par un balayage de toutes les colonnes
textuelles du schéma — `approbations.acteur_libelle` n'échappe donc pas à l'anonymisation
d'une personne nommée. Ce constat porte sur la **cohérence référentielle**, pas sur le RGPD.

**Ce qu'il faudrait faire, sans le faire** : décider, et l'écrire. Soit les approbations
suivent leur objet, par le même mécanisme que D2 et découvert dans le catalogue ; soit elles
sont **délibérément conservées** comme registre historique — et alors il faut une route qui
les rende visibles à un auditeur, sans quoi ce n'est pas un registre, c'est du sédiment.

---

## 4. LES SIX MINEURS

### 4.1 Q-285 — l'écart d'intégrité est constaté, inscrit… et le fichier est servi quand même

`CONDITION_DELIVRABLE` (`src/pieces/depot.ts:115`) est
`"etat_analyse" = 'saine' and not "quarantaine"`. **`etat_integrite` n'y entre pas.**

Mesuré : fichier du magasin altéré à la main, balayage périodique joué —

```
$ systemctl start cyber-grc-reanalyse.service
  INTÉGRITÉ : le fichier du magasin ne correspond plus à son empreinte. { attendu: 4e5e40aa…, constate: 581b4f2e… }
  Intégrité : 1 pièce(s) rapprochée(s), 0 conforme(s), 1 écart(s), 0 fichier(s) absent(s).
  Failed with result 'exit-code'                                        ← le minuteur sort en 1, comme annoncé
psql : etat_integrite = ecart | derniere_verification = 2026-09-10 09:31:34

GET /api/pieces/documents/<doc>/<pj>   → HTTP 200, 60 octets, le fichier ALTÉRÉ
  content-disposition: attachment  ·  nosniff  ·  no-store         ← et aucun signal
et la pièce reste  en_vigueur = true, donc c'est elle qui « fait foi ».
```

**Ce qui tient** : la liste servie porte `etat_integrite: "ecart"` et l'écran l'affiche avec
son explication (`js/modules/pieces.js`, table `INTEGRITE`). L'utilisateur *peut* le voir. Ce
qui manque est que **la délivrance et la notion de « pièce qui fait foi » l'ignorent** — la
promesse centrale du coffre est « preuve vérifiable », et une preuve dont on a établi qu'elle
a changé continue d'être servie et de dater la fiche.

**À faire, sans le faire** : trancher explicitement — soit l'écart interdit la délivrance
(risque : on retire à l'exploitant le seul moyen de récupérer le fichier abîmé), soit il
interdit le statut « en vigueur ». Le silence actuel n'est pas un arbitrage, c'est une
omission.

### 4.2 Q-286 — `GET …/integrite` : une amplification de ~15 000×, sans limitation de rythme

Le commentaire de la route affirme qu'elle est *« strictement moins chère que la
délivrance »*. C'est vrai du **travail du serveur** ; c'est faux du **rapport entre le coût de
l'attaquant et celui du serveur**, qui est ce que mesure un déni de service.

Mesuré, pièce de **5 000 000 octets**, à travers Apache :

| Route | temps | octets reçus par l'appelant |
|---|---|---|
| `…/integrite` | 0,036 s · 0,033 s · 0,037 s | **334** |
| délivrance | 0,040 s · 0,044 s · 0,044 s | **5 000 000** |

Le serveur lit et hache le fichier dans les deux cas ; dans le premier, l'appelant n'absorbe
rien. Le limiteur de rythme (`LimiteurRythme`, 20 refus / 15 min) ne compte que les **échecs
d'authentification** : une session valide n'est bornée par rien. Sur un lien VPN contraint —
la cible de déploiement — la différence n'est pas théorique.

**À faire, sans le faire** : borner le rythme de cette route par session, ou retirer du
commentaire une comparaison qui ne dit pas ce qu'elle a l'air de dire.

### 4.3 Q-287 — un document de portée Groupe portant les pièces de deux filiales n'est supprimable de nulle part

Mesuré avec `admin.grc` (périmètre Groupe), PSSI de portée Groupe, une pièce déposée depuis
TLS et une depuis DEU :

```
filiale active = DEU  →  DELETE document  → 409 GRC05 « 1 pièce(s) … appartiennent à une autre filiale »
filiale active = TLS  →  DELETE document  → 409 GRC05 (message identique)
```

La sortie existe et **elle fonctionne** — je l'ai jouée : supprimer la pièce TLS depuis TLS
(204), basculer sur DEU, supprimer la pièce DEU (204), puis le document (200). Le refus est
donc **fail-closed et récupérable**, ce qui est le bon choix. Mais le message dit *« depuis la
filiale qui les a déposées »* **sans nommer laquelle**, et un profil de périmètre à une seule
filiale ne voit même pas les pièces qu'on lui demande de retirer.

### 4.4 Q-288 — le chemin de Playwright dans `CLAUDE.md` n'existe pas sur cette machine

`CLAUDE.md` §0.2 et §5 : *« Playwright global sous `/opt/node22/lib/node_modules/` »*.

```
$ ls /opt/node22/lib/node_modules/playwright/
ls: cannot access '/opt/node22/lib/node_modules/playwright/': No such file or directory
$ npm root -g
/usr/lib/node_modules            ← playwright est là
```

**Rien n'est cassé** : `test/aide/navigateur.mjs` **découvre** Playwright au lieu de le coder
en dur, précisément à cause du constat Q-80, et les familles de navigateur tournent. Mais un
chemin faux dans le fichier de mémoire est de la classe que le §5.6 compte comme constat : je
l'ai suivi, il m'a coûté deux tentatives, et un exploitant qui vérifie une installation y
perdrait la même chose.

### 4.5 Q-289 — la migration `020` n'apporte aucun garde-fou

Les migrations `017`, `018` et `019` apportent chacune sa fonction `f_verifier_*`, découverte
et consignée. La `020` n'en apporte **aucune** : rien dans `f_verifier_schema()` ne vérifie
que `pieces_jointes.etat_integrite` et `derniere_verification` existent, que
`ck_pieces_jointes_integrite` est en place, ni que `cyber-grc-reanalyse.timer` est actif.

```
f_verifier_* dans pg_proc = 18   ·   découverts = 17   ·   consignés = 17
(le 18ᵉ est f_verifier_schema() lui-même, le point d'appel — cohérent)
```

Le dispositif d'intégrité est **du code, pas du schéma**, ce qui est un motif recevable ; mais
il repose sur trois objets de schéma que rien ne garde, et le `--diagnostic` n'en dit rien.

### 4.6 Q-290 — la quarantaine croît sans rapprochement

```
fichiers en quarantaine = 4        ·        lignes « quarantaine » en base = 1
```

Trois fichiers sans ligne, hérités des passages précédents. **C'est conforme au dessein** — un
fichier de quarantaine n'est jamais effacé, et la migration `017` prend soin de le préserver
au travers de la file de purge. Mais rien ne rapproche jamais le répertoire de la base, rien
n'en rend le compte à l'exploitant, et `install.sh --diagnostic` ne mesure que le pourcentage
de disque. Un magasin de preuves dont personne ne dit le contenu finit par n'être plus un
magasin de preuves.

---

## 5. LES MUTATIONS JOUÉES — la partie la plus utile de ce rapport

Douze mutations, sur une **copie** du dépôt (`scratchpad/mut/`), l'arbre restant intact.
*Un correctif accepté n'est pas un correctif sûr ; la seule preuve qu'il tient est la
mutation.*

| # | Livraison visée | Mutation | Résultat |
|---|---|---|---|
| **1** | **D2** — migration `017` | la boucle de pose **saute** une table porteuse (`tests_pra`) | ✅ **mord au déploiement** : `migrate.mjs` échoue — *« tests_pra : porteur_sans_declencheur »* ; banc **11/11 rouges** |
| **2** | **D1** — migration `018` | l'index unique perd `filiale_id` | ✅ **mord deux fois** : `unicite_sans_filiale` (garde dédié) **et** `unicite_transfrontaliere` (garde générique §19.1) ; banc rouge |
| **3** | **D5** — migration `019` | `before update` → `before **insert**` | ⚠️ **NE MORD PAS au déploiement** : `f_verifier_schema()` → **0 anomalie**. Banc 3/5 rouges. → **Q-281** |
| **4** | **D2** — migration `017` | `after delete` → `after **insert**` sur les 32 tables | ⚠️ **NE MORD PAS au déploiement** : **0 anomalie**. Banc 5/11 rouges. → **Q-281** |
| **5** | **Intégrité** — migration `020` | le verdict est **toujours** `conforme` | ✅ mord : `test/pieces/integrite.test.mjs` rouge, y compris *« IL TROUVE L'ÉCART, l'inscrit, et le journalise »* |
| **6** | **Q-248** — énumérations de la reprise | `documents.statut` perd `'en validation'` | ✅ mord : *« la reprise ignore [en validation] »*, 2/3 rouges |
| **7** | **Q-250** — `normaliserListe()` | `en_vigueur` retiré du panneau | ✅ mord : `champs-servis.test.mjs` nomme le champ jeté, 2/4 rouges |
| **8** | **L18.2 b** — bandeau découverte | le bandeau n'est plus reposé à chaque écran | ✅ mord : `profil-decouverte.test.mjs` **5/7 rouges**, y compris §5 « il s'imprime » |
| **9** | **Q-257** — garde des catalogues | les **93** intitulés FR d'ISO 27002 ← les **93 intitulés officiels ISO** | ⚠️ **NE MORD PAS** : **11/11 verts**. → **Q-283** |
| **10** | **Q-103** — publication | un octet ajouté au `js/core/api.js` **servi** | ✅ mord : *« 1 fichier(s) SERVIS diffèrent du dépôt : js/core/api.js »*, **code de retour 5** |
| **11** | **S16** — couverture RLS | `risques no force row level security`, puis table intruse sans `filiale_id` | ✅ mord : `force_absente`, puis **4** anomalies sur la table intruse |
| **12** | **Q-267** — SMTP | `SMTP_ACTIF=oui` + `SMTP_CHIFFREMENT=aucun` en **production** | ✅ mord : le serveur **refuse de démarrer**, code 1, message citant Q-267. Discrimine : `starttls` → 0 ligne ; `NODE_ENV=recette` → 0 ligne (voulu) |

**Neuf mordent, trois ne mordent pas.** Les trois qui ne mordent pas sont **exactement** les
trois majeurs Q-281 et Q-283 — et deux d'entre elles ne mordent pas *sur le chemin de
déploiement*, celui qui tourne chez le client, alors qu'elles mordent au banc, qui n'y tourne
pas.

---

## 6. LA GRILLE §4, REJOUÉE INTÉGRALEMENT

⚠️ Convention du §4 respectée : **« contrôle Sn »**, jamais « Sn » seul (constat Q-262).

| # | Contrôle | Verdict | Preuve mesurée |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | ✅ **passé** | `verifier_cloisonnement.sql` **sous `grc_app`** → **107 contrôles, 107 réussis, 0 échoué**. `select count(*) … relrowsecurity and relforcerowsecurity` → **50 sur 50 tables**. `grc_app` et `grc_lecture` : **0 rôle de connexion porteur de SUPERUSER ou BYPASSRLS** (C100), propriétaire `grc_proprietaire` ≠ compte du service. **Sept sondes inter-filiales sur les surfaces NEUVES** (§7.1) : toutes 404, aucune écriture |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ **passé** | Cinq formes de forgeage sur `/api/session`, compte `rssi.tls` : en-tête `X-Filiale`, en-tête `X-Grc-Filiale`, en-tête `grc-filiales`, paramètre `?filiale=`, cookie `cyber-context` → **les cinq rendent `TLS` et le périmètre à une seule filiale**, inchangé. `PUT /api/session/filiale-active` n'accepte que `filiale`, résolu contre `session_filiales` |
| **S3** | Journal d'audit inaltérable et complet | ⚠️ **passé sous réserve nommée (Q-243)** | `update` / `delete` / `truncate` sous `grc_app` → *permission denied* ; `update` sous **le propriétaire** → *« Table journal_audit en ajout seul : opération UPDATE refusée »*. `f_journal_audit_verifier()` → **0 ligne**. Couverture : **19 des 22** valeurs d'action présentes en base sur la recette, les 3 absentes (`purge`, `archivage`, `session_revoquee`) étant **émises dans `src/`**. ⚠️ **Q-243 reste ouvert** — une troncature de **queue** est indétectable — et je ne l'ai **pas rejoué** : dit tel quel au §8 |
| **S4** | Verrouillage optimiste effectif | ✅ **passé** | Deux `PUT` concurrents sur la version 1 du même risque : **A → 200, B → 409 `GRC03`**. Le client ne peut fixer ni `version` ni `cree_par` : *« Le champ « version » n'appartient pas à l'entité « risques » […] Aucune donnée n'a été enregistrée »* — **refusé, pas ignoré**. En base : `version = 2`, `cree_par = rssi.tls` |
| **S5** | Aucune injection SQL | ✅ **passé** | Quatre familles (`x'; drop table risques; --`, `1 OR 1=1`, `%27 UNION SELECT NULL--`, `../../etc/passwd`) sur `?depuis=` et sur `/api/entites/risques/<id>` → **400 / 404**, aucune n'atteint la base ; `select count(*) from risques` inchangé. Les identifiants de table interpolés viennent de `ident()` sur le catalogue découvert, jamais d'une entrée |
| **S6** | Droits vérifiés côté serveur à chaque requête | ✅ **passé** | `rssi.tls` (sans domaine `journal`) : `GET /api/journal` → **403**, tracé `refus_autorisation` avec `{"route":"/api/journal","action_exigee":"lire","domaine_exige":"journal"}`. `rssi.groupe` idem. Une route sans `config.acces` déclarée est **refusée en 500**, pas servie. Et l'écran dit le refus en clair : *« Votre profil n'a pas accès au journal d'audit. »* |
| **S7** | Le droit d'export est distinct de la lecture | ❌ **EN ÉCHEC — constat Q-279** | **La barrière déclarée tient** : `rssi.tls` sans `GRC-EXPORT` → `GET /api/export` **403**, `GET /api/journal/export` **403**, message *« L'export des données est une autorisation distincte de la consultation »*. **Et le correctif de Q-242 mord** : trois `?depuis=1970` → **3 entrées `consultation_sensible`** portant `lignes: 19` et `export_autorise: false`. ⚠️ **Mais `?depuis=<maintenant − 11 h 30>` rend la MÊME charge — 19 lignes, 6 collections, identiques à `/api/donnees` — avec un delta de journal de 0.** La preuve attendue (*« tout export réussi ou refusé est journalisé »*) n'est pas tenue |
| **S8** | Secrets | ✅ **passé** | Aucun secret dans la charte de session (`/api/session` : utilisateur, filiale, périmètre, droits, `installation.profil`, description d'authentification — rien d'autre). Message d'erreur type : `{"erreur":"ressource_inconnue","message":"Aucune ressource ne répond à GET …","reference":"REQ-…"}`. `utilisateurs.mot_de_passe_hash` reste fermé à tout rôle de connexion (C98 du script de cloisonnement). **Aucun secret n'est recopié dans ce rapport** |
| **S9** | Chaîne de contrôle des pièces jointes | ✅ **passé — rejoué sur la recette** | **(1)** `.exe` → **400** *« Les fichiers « .exe » ne sont pas acceptés. Formats admis : … »* ; **(3)** ELF renommé `.pdf` → **400** *« Le contenu de ce fichier ne correspond pas à son extension »* ; **(4) ClamAV RÉEL** : EICAR → **400**, `etat_analyse=infectee`, `quarantaine=t`, fichier déplacé ; **(5)** magasin `drwx------ cyber-grc`, hors racine web, `GET /pieces-jointes/` par Apache → **403** ; **(6)** délivrance `content-disposition: attachment; filename*=UTF-8''…`, `nosniff`, `no-store` ; **(7)** ré-analyse : `cyber-grc-reanalyse.timer` **actif**, dernier passage relevé, sortie en code 1 sur écart ; **(8)** quotas et bornes : voir S13. ⚠️ Le contrôle **(2) macros** n'a pas été rejoué par moi — dit au §8 |
| **S10** | Sortie et en-têtes | ✅ **passé** | Lus à travers Apache : CSP complète (`default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` …), HSTS `max-age=31536000; includeSubDomains`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy`, **`Cache-Control: no-store` sur `/api/`**. Cookie : `grc_session=…; Path=/; HttpOnly; SameSite=Strict; Secure`. **Chromium réel : 31 écrans, 0 violation de CSP, 0 `pageerror`** |
| **S11** | Limitation du rythme et verrouillage | ✅ **passé** | Neuf tentatives sur un identifiant **inexistant** (aucun compte d'annuaire réel éprouvé — règle du §0.3) : essais 1→5 à **47-65 ms**, essais 6→9 à **17-30 ms** — le court-circuit du verrou. **Message identique aux neuf** : *« Identifiant ou mot de passe incorrect, ou compte temporairement bloqué »* — aucun oracle sur l'existence ni sur l'état. Limiteur d'adresse : 20 refus / 15 min, `retry-after` posé |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ✅ **passé** | Quatre familles examinées (`ressource_inconnue`, `droit_insuffisant`, `donnee_invalide`, `contrainte_base`). Aucune pile d'appel, aucun nom de table, aucun chemin de fichier. Chaque réponse porte `REQ-<horodatage>-<aléa>` ; le détail est au journal technique (*« validation : body must have required property 'champs' »* y figure, jamais dans la réponse). ⚠️ **`GRC05` et `GRC06` rendent leur message en clair**, ce qui est voulu — ce sont des messages métier, pas des messages de base |
| **S13** | Dénis de service applicatifs | ⚠️ **passé sous réserve (Q-286, Q-214 b·c·d·f)** | À travers Apache : corps de **28 311 552 o → 413** ; `Transfer-Encoding: chunked` → **411** ; corps minuscule → 400 (passe la borne). Pool borné, `bodyLimit` de 4 Kio sur la connexion. ⚠️ **Q-286 est neuf** : `…/integrite` fait travailler le serveur sans que l'appelant absorbe rien, sans limitation de rythme pour une session valide. Les quatre points de **Q-214** restent datés `V1.1` et **non rejoués** |
| **S14** | Intégrité des opérations composites | ⚠️ **passé sur preuve partielle** | `POST /api/reprise` (fusionner) : bilan cohérent, `crees: {documents: 1}`, `lus: 1`. **La suppression d'un porteur est bien tout-ou-rien** : GRC05 sur le document de portée Groupe → **le document n'est PAS supprimé** et **aucune pièce ne l'est** (mesuré : 409 puis `count = 1`). File `pieces_a_purger` **vide** après tous mes gestes, magasin **à 0 fichier**, aucun orphelin disque↔base. ⚠️ **Je n'ai pas rejoué l'import rompu à 199 lignes** — dit au §8 |
| **S15** | Dépendances | ✅ **passé** | `npm audit --omit=dev` → **`found 0 vulnerabilities`**, code de retour 0. `npm run verifier-types` → **aucune sortie**, donc propre |
| **S16** | **Les garde-fous sont branchés** | ❌ **EN ÉCHEC — constat Q-281** | **Le branchement tient** : **18** `f_verifier_*` dans `pg_proc`, **17 découvertes** par `f_decouvrir_controles_schema()` et **17 consignées** (la 18ᵉ est le point d'appel) ; appelé par `migrate.mjs` **et** par `install.sh` ; **deux sabotages, deux détections** (`risques no force rls` → `force_absente` ; table intruse → **4** anomalies). ⚠️ **Mais deux garde-fous neufs ne mesurent pas ce qu'ils gardent** : déplacer l'événement de `trg_documents_publication` et des **32** déclencheurs de pièces laisse `f_verifier_schema()` à **0 anomalie**, donc `install.sh` et `--diagnostic` au vert, les deux barrières étant mortes |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ **passé** | **Chromium réel → Apache 2.4.68 (vhost du dépôt) → serveur réel → Active Directory Samba réel → PostgreSQL 17.11.** Connexion par le **vrai formulaire** (`#login-identifiant` / `#login-motdepasse` / `#login-btn`), compte d'annuaire `rssi.tls`. **31 entrées de menu sur 31 rendues**, chacune avec son titre. **0 violation de CSP, 0 `pageerror`, 0 requête en échec** ; les deux seules erreurs de console sont le **401** d'avant connexion et le **403** légitime de `/journal`. Publication : **81 fichiers servis identiques au dépôt**, et le contrôle **mord** (mutation 10, code 5) |
| **S18** | **Le produit fait ce qu'il doit faire** | ❌ **EN ÉCHEC — constats Q-280, Q-282** | Les gestes ordinaires **aboutissent** : créer un document, y joindre un fichier, le marquer « en vigueur », vérifier son intégrité, mener un circuit d'approbation à quatre étapes, supprimer, recharger — tous mesurés, aucun ne détruit rien d'inattendu, et le refus de version (`GRC03`) protège la saisie concurrente. **Mais deux fonctions annoncées comme livrées ne font pas ce qu'elles annoncent** : la barrière de publication D5 se contourne en deux clics **ou en un appel d'API** (Q-280), et la version « qui fait foi » de D1 continue d'être affichée quand la pièce qui la portait a été supprimée (Q-282) |

**Récapitulatif** : **15 passés** (dont 3 sous réserve nommée), **3 en échec** (S7, S16, S18),
**0 sans objet**, **0 non rejoué** parmi les dix-huit — les points que je n'ai pas mesurés
sont *à l'intérieur* de contrôles par ailleurs rejoués, et ils sont nommés un par un au §8.

---

## 7. CE QUI TIENT — mesuré avec la même rigueur

### 7.1 Le cloisonnement, sur les surfaces neuves — 0 fuite

Document et pièce créés dans **DEU** (`admin.grc`, filiale active basculée), puis sondés
depuis une session **TLS** (`rssi.tls`, périmètre à une seule filiale) :

| Sonde | Réponse |
|---|---|
| `GET /api/entites/documents/<doc DEU>` | **404** *ressource_inconnue* |
| `GET /api/pieces/documents/<doc DEU>` | **200 `{"pieces":[]}`** |
| `GET /api/pieces/documents/<doc DEU>/<pj DEU>` | **404** *« Cette pièce jointe n'existe pas, ou n'est pas disponible »* |
| `GET /api/pieces/documents/<doc DEU>/<pj DEU>/integrite` | **404**, même message |
| `GET /api/approbations/documents/<doc DEU>` | **404** |
| `POST …/<pj DEU>/en-vigueur` | **404** |
| `DELETE /api/pieces/documents/<doc DEU>/<pj DEU>` | **404** |

⚠️ **Et le 200 à liste vide n'est pas un oracle** : un identifiant **totalement inventé**
(`DOC-1111111111111-aaa…`) rend **exactement la même réponse**, `{"pieces":[]}`. La même
requête par `rssi.groupe`, dont le périmètre contient DEU, rend bien la pièce — le contrôle
symétrique est donc joué : ce qui est refusé l'est par le périmètre, pas par une panne.

### 7.2 D2 — la promesse de « zéro orpheline » tient, et elle tient au bon niveau

- **32 déclencheurs posés**, découverts dans le catalogue, jamais récités.
- La suppression d'un porteur retire la ligne **et** le fichier : après tous mes gestes,
  `pieces_jointes = 0`, `pieces_a_purger = 0`, **0 fichier dans le magasin**, et le
  rapprochement disque ↔ base ne laisse **aucun orphelin** dans les deux sens.
- Le refus **GRC05** sur un document de portée Groupe portant les pièces de deux filiales est
  **le bon geste** : il refuse plutôt que de laisser une orpheline, et la sortie existe.
- La **quarantaine est préservée** au travers de la file, comme annoncé.
- La mutation 1 fait **échouer le déploiement** avec un message qui nomme la table, le
  symptôme et le remède.

### 7.3 La vérification d'intégrité — elle fait ce qu'elle dit, et elle dit ce qu'elle ne fait pas

Cycle complet joué sur la recette : dépôt (`sha256` calculé sur ce qui est écrit) → `integrite`
→ `conforme` ; fichier altéré à la main → `integrite` → **`ecart`** avec les deux empreintes et
les deux tailles ; balayage périodique → écart trouvé, **inscrit** (`etat_integrite = ecart`,
`derniere_verification` posée), **journalisé**, **`systemctl` en échec (code 1)** ; fichier
restauré → **`conforme`**. Les trois verdicts sont tracés, pas seulement le mauvais. Et le
code écrit lui-même la limite — *« qui peut écrire dans le magasin peut aussi mettre le
`sha256` à jour »* — au lieu de laisser croire à une garantie.

### 7.4 D1, D4 et Q-250 — trois gardes qui mordent

- **D1** : l'unicité `(filiale_id, entite_type, entite_id) where en_vigueur` est tenue par la
  base, et lui retirer `filiale_id` fait rougir **deux** contrôles distincts, dont le
  générique de `CONVENTIONS` §19.1 — c'est-à-dire que la classe est gardée, pas l'instance.
- **D4** : « Document resté ailleurs » est écrit aux **trois** endroits annoncés — commentaire
  de colonne, étiquette du champ, note sous le champ — et la note pédagogique de l'écran dit
  la différence en toutes lettres.
- **Q-250** : `champs-servis.test.mjs` **nomme le champ jeté** quand on le retire de
  `normaliserListe()`. C'est le bon niveau : il extrait du texte du panneau ce qu'il **lit**,
  au lieu de comparer deux listes.

### 7.5 L18 — l'installateur

- `--diagnostic` : **12 conformes, 1 réserve (`SMTP_ACTIF=non`), 0 bloquant**, **code de
  retour 1** — et il ne modifie rien (config à 275 lignes, horodatage inchangé, services
  actifs après).
- `--verifier-publication` : **81 fichiers identiques**, **code 5** sur divergence, **0** en
  conformité — le contrôle de Q-103 mord.
- `--assistant` : refuse sans terminal (*« Sans terminal, il lirait des réponses vides et
  poserait une configuration que personne n'a validée »*, **code 1**), et **n'écrit rien**
  avant le récapitulatif — vérifié après interruption : `/etc/cyber-grc/env` intact, service
  actif, produit à 200.
- **Q-267** mord : `SMTP_CHIFFREMENT=aucun` + `SMTP_ACTIF=oui` en **production** → démarrage
  refusé, code 1, message citant le constat. Et il **discrimine** — `starttls` passe,
  `NODE_ENV=recette` passe (voulu, écrit dans le code).
- **L18.2 b** : `installation.profil` est servi par la charte de session (`production` sur la
  recette) ; le banc `profil-decouverte.test.mjs` porte sa **moitié négative** (« aucun
  bandeau quand le profil n'est pas découverte ») et **5 de ses 7 essais rougissent** quand on
  cesse de reposer le bandeau.

### 7.6 Q-251 — le rapport de temps ne rougit plus

`test/import/lecture.test.mjs` : **5 passages isolés, 35/35 à chaque fois**. Et **deux bancs
complets** — `1822 / 1822`, `0 fail`, en 177,9 s puis 177,4 s. Le clignotement « une fois sur
deux » ne s'est pas reproduit.

### 7.7 Les guides — les corrections de la porte S7 tiennent

- **Groupes d'annuaire** : les six formes `GRC-*` citées dans `GUIDE_UTILISATEUR.md`,
  `GUIDE_EXPLOITATION.md` et `INSTALLER.md` confrontées à la liste **engendrée** par
  `deploy/groupes-ad.sh --csv` (23 groupes, lue sur la machine) → **aucun groupe inventé** ;
  les deux « écarts » sont un gabarit (`GRC-GROUPE-<PROFIL>`) et un **contre-exemple explicite**
  (`GRC-GROUPE-ADMIN`, cité pour dire qu'il n'existe pas).
- **Écrans** : le guide **écrit lui-même** qu'il n'y a pas d'écran d'administration —
  *« Ce tableau renvoyait à un écran « Administration » qui n'existe pas : mesuré à la porte
  S7 »* — et donne le chemin par l'API. C'est l'inverse de la promesse qui avait fait le
  bloquant.

---

## 8. CE QUE JE N'AI PAS PU MESURER — dit séparément

Ces points ne sont **ni passés ni en échec**. Ils sont **non rejoués**, et je refuse de les
reconduire au vert par confiance dans un passage antérieur.

1. **Q-243 — la troncature de queue du journal.** Le journal est en ajout seul jusque sous le
   propriétaire, ce qui est précisément ce qui m'empêche de fabriquer la troncature sans
   passer par un superutilisateur sur la base **de la recette**. Je ne l'ai pas fait. **Le
   constat reste ouvert et non mesuré à cette porte.**
2. **Contrôle S9 (2) — les macros.** Je n'ai pas construit de `.docm` renommé `.docx` : les
   trois autres contrôles de la chaîne (liste blanche, signature binaire, ClamAV) sont
   mesurés, celui-ci ne l'est pas à ce passage.
3. **Contrôle S14 — l'import rompu à mi-parcours.** Je n'ai pas rejoué le fichier de 250
   lignes dont la 201ᵉ répète une clé : le format du modèle est un classeur XLSX, et le temps
   est allé aux treize livraisons neuves. La propriété tout-ou-rien est **mesurée sur un autre
   chemin** (la suppression refusée en GRC05 ne laisse rien derrière) et par le banc.
4. **Q-214 b, c, d, f** — les quatre coûts non bornés datés `V1.1`. Non rejoués.
5. **Q-205 b, Q-206, Q-234 → Q-241, Q-244, Q-247, Q-256, Q-258, Q-274.** Non rejoués : ils
   n'étaient pas dans mon périmètre de priorité, qui était **les treize livraisons non
   auditées**.
6. **La politique TLS** (versions et suites). Non rejouée à ce passage ; `curl` sans `-k` rend
   200 avec `ssl_verify_result=0`, ce qui prouve la chaîne, pas la politique.
7. **Le second effet de mes propres gestes.** J'ai laissé dans la base de recette **quatre
   lignes d'`approbations` orphelines** (constat Q-284) : je ne peux pas les retirer, c'est
   l'objet même du constat. Et **trois fichiers de quarantaine** de plus (dont un EICAR), par
   dessein du produit.

---

## 9. CE QUE CE PASSAGE ENSEIGNE

**1. Le motif « instance plutôt que classe » a changé de forme, et c'est ce qui le rend
difficile.** Il ne se présente plus comme un correctif qui oublie cinq sites sur sept. Il se
présente comme **un garde-fou qui regarde à côté** : `f_verifier_publication_documents` et
`f_verifier_declencheurs_pieces` gardent la *présence* d'un déclencheur au lieu de son
*événement* ; le garde de Q-257 mesure une *longueur* au lieu d'une *coïncidence*. Dans les
trois cas le garde existe, il est branché, il est appelé — et la propriété qu'il promet
disparaît sans un mot.

**2. La question à poser à un garde n'est pas « couvre-t-il le défaut ? », c'est « quelle est
la plus petite mutation qui le laisse vert ? ».** Pour les trois gardes ci-dessus, la réponse
tient en un mot : `insert` au lieu de `delete`, `insert` au lieu de `update`, et un
copier-coller de 29 signes.

**3. Une phrase de fermeture dans le registre est un engagement, et elle se mesure comme le
reste.** Q-242 a été fermé sur l'affirmation qu'*« elle ne se contourne pas en avançant
`depuis` »*. Une commande de cinq secondes la dément. Le passage suivant a lu cette phrase et
n'a pas mesuré — parce qu'une phrase écrite avec assurance dispense de mesurer, ce qui est
exactement le contraire de ce que ce chantier a appris à faire.

**4. Ce qui tient, tient vraiment.** Le cloisonnement n'a pas bougé d'un pouce sur des surfaces
entièrement neuves ; le périmètre reste inatteignable depuis le navigateur sous cinq formes
d'attaque ; le produit se parcourt en entier dans un vrai navigateur derrière la vraie CSP
sans une erreur. **Le chantier n'échoue pas sur sa promesse centrale.** Il échoue sur des
promesses secondaires qu'il a déclarées tenues.

---

## 10. CE QUE JE RECOMMANDE — sans le faire

| Ordre | Quoi | Pourquoi maintenant |
|---|---|---|
| **1** | **Q-281** — ajouter `tgtype` aux deux garde-fous, et poser la règle « un garde de déclencheur nomme son événement » | Deux barrières mortes passent au vert sur le chemin de déploiement du client. C'est un échec du contrôle **S16**, et il porte sur ce qui protège les deux autres |
| **2** | **Q-280** — porter D5 sur `insert or update`, et rendre la seconde moitié indépendante de l'existence d'une ligne | La barrière annoncée n'existe pratiquement pas. Un seul appel de reprise publie une PSSI sans approbation |
| **3** | **Q-279** — remplacer le seuil temporel par un seuil **volumétrique**, et **corriger la phrase du registre** | Contrôle **S7** en échec pour la deuxième porte. La phrase fausse est ce qui a fait sauter la mesure au passage précédent |
| **4** | **Q-282** — faire tenir le reflet de version par la base, comme D2 | D1 est annulé par le chemin de suppression, sur la question d'audit qu'il devait clore |
| **5** | **Q-283** — mesurer la coïncidence avec le corpus normatif, ou **écrire que la propriété n'est pas gardée** | Le remède du bloquant Q-253 ne mord pas. Une réserve honnête vaut mieux qu'un garde qui rassure |
| **6** | **Q-284** — trancher par écrit : les approbations suivent leur objet, ou elles sont un registre — et alors on peut les lire | Quatre décisions inatteignables et indestructibles sont dans la base au moment où j'écris |
| **7** | Les six mineurs, puis **rejouer la porte S8 — huitième passage** | *Un banc vert ne vaut pas un passage de porte*, et *les constats fermés depuis un passage précédent ont déjà fait échouer le suivant* — deux fois sur Q-208, une troisième ici sur Q-242 |

---

> **Dernier mot.** Le 6ᵉ passage était le meilleur du chantier ; celui-ci trouve **six
> majeurs**, et cinq d'entre eux sont dans les treize livraisons que personne n'avait
> auditées. Ce n'est pas une régression du produit : c'est la démonstration, une fois de plus,
> que **le code non audité et le code audité ne sont pas la même matière**, et qu'un banc vert
> mesure ce qu'il regarde. Trois des livraisons neuves ont apporté leur garde ; trois ont
> apporté un garde qui ne mord pas. La différence entre les deux n'est ni le soin ni la date :
> c'est qu'un garde utile interroge une **propriété**, et qu'un garde inutile interroge une
> **présence**.
