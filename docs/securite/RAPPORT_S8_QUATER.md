# Rapport de la porte S8 — **quatrième passage** — condition de mise en service

> **Révision auditée** : `b392825` (« Le relevé du §8 pointe sur la révision où il a
> été mesuré »), branche `claude/vague-3-planning-review-6zgbch`.
> **Auditeur** : SECU (4ᵉ passage) — n'a écrit aucune des lignes examinées, et
> n'écrit que ce fichier. **Aucun fichier du produit n'a été modifié dans le
> dépôt** : les mutations de code ont vécu dans une copie isolée du scratchpad,
> restaurées et vérifiées identiques (`diff -rq` sur `backend/src` et
> `cyber-gouvernance_V4` : identiques) ; les trois mutations du `README` ont été
> faites en place et restaurées dans la **même commande**, `diff` à l'appui.
> Aucun commit, aucun `git add`, aucun `git checkout`, aucun `git stash`.
> `git status --porcelain` **vide** en fin d'audit.
> **Date** : 05/09/2026. **Machine** : `SRV-Infra`, VM Debian 13 réelle,
> PostgreSQL 17.11, Apache 2.4.68 en service, Chromium/Playwright réels,
> contrôleur de domaine Samba `grc-ad` réel, ClamAV actif. La recette sert
> `https://grc.exemple.interne/` à la révision auditée — **81 fichiers servis
> identiques au dépôt** (`install.sh --verifier-publication`, code 0).

---

## Verdict global

> ### ❌ **Porte S8 refusée — pour la quatrième fois, et pour la deuxième fois sur le DISPOSITIF, pas sur le produit.**
>
> **Les deux classes dures sont vides.** Aucun constat « bloque le
> fonctionnement », aucun constat « fuite ou perte de données ». Les dix-huit
> contrôles de la grille tiennent, mesurés sur l'infrastructure réelle :
> cloisonnement **107/107**, journal en ajout seul refusé **jusqu'au compte
> propriétaire** et chaîne à **0 anomalie sur 554 entrées**, verrouillage
> optimiste, verrouillage de connexion mesuré **contre l'AD réel avec un témoin**,
> chaîne des pièces jointes **mordue par un vrai EICAR et un vrai `vbaProject.bin`**,
> import transactionnel **mordu par la route** (251 lignes, une fautive → 409, base
> inchangée), et **26 modules sur 26** peints dans Chromium sous la CSP livrée,
> **0 violation, 0 erreur de page**, création par formulaire survivant à un `F5`.
>
> **Le motif du refus est double, et le premier est le plus grave :**
>
> **1. Le contrôle qui a remplacé l'interdit après Q-216 ne couvre pas la classe
> qu'il nomme — et je l'ai mesuré trois fois** (constat **Q-220**). Son entête
> promet : *« Une orthographe nouvelle ne le trompe pas, parce qu'il ne lit pas
> l'orthographe : il lit le temps. »* C'est faux, parce qu'il ne lit le temps que
> sur des **sujets** qu'il fabrique, et ces sujets sont **codés en dur sur les trois
> constats déjà trouvés**. Réécrivez la ligne de `clamav.ts` de la façon la plus
> naturelle qui soit — avec son vrai préfixe, `/^stream:\s*(.+?)\s+FOUND$/u` — et
> elle coûte **11 274 ms pour 3 209 octets** *sur la fonction compilée*, pendant
> que le contrôle rend **4 essais, 4 passés**. C'est **la quatrième fois** que
> cette famille passe sous le garde-fou censé l'arrêter.
>
> **2. Le point 6 du `PLAN_EXECUTION` §5 est de nouveau faux** (constat
> **Q-222**), dans le bloc même qui vient d'être réancré pour Q-219 : le §8
> annonce **« 43 tables portant `cree_par` et 43 déclencheurs de création »** ; le
> catalogue en porte **44 et 44**, sur la recette **comme sur une base neuve
> migrée par le vrai `db/migrate.mjs`**. Les treize autres chiffres du bloc sont
> justes, familles comprises — je les ai tous rejoués.
>
> S'y ajoute **Q-221** : le garde de Q-212 reconnaît lui aussi une **orthographe**
> (`return String(`) ; la même sœur écrite sur deux lignes lui échappe.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **aucun** | 18 contrôles tenus, mesurés sur la chaîne réelle |
| **Fuite ou perte de données** | **aucun** | cloisonnement, journal, persistance et import mordus |
| **Tout le reste** (`V1.1`) | **Q-220, Q-221, Q-222** | inscrits au registre ; **Q-222 invalide le §5.6**, que la porte est chargée de vérifier |

**Ce que ce verdict dit du produit, et il faut le dire aussi nettement que le
refus.** *Rien dans le produit ne s'oppose à la mise en service pilote.* Je n'ai
trouvé **aucune** expression de `src/` ni de `cyber-gouvernance_V4/js/` qui
rebrousse — 37 et 333 expressions passées à des familles de sujets **plus larges
que celles du dépôt** —, aucune boucle imbriquée sur une entrée, aucun analyseur
non borné. Ce qui échoue est **le dispositif qui doit empêcher le prochain
défaut**, et deux nombres dans un document. Les trois constats se ferment en une
journée.

---

## 1. Les correctifs des trois passages — **tient / ne tient pas / non éprouvé**, avec la mutation jouée

C'est la section qui compte. Je n'ai repris **aucun** verdict d'un passage
précédent sans le rejouer, **y compris les deux que le 3ᵉ passage disait n'avoir
pas re-mordus**.

| # | Correctif | Verdict | Mutation jouée, et ce qui a rougi |
|---|---|---|---|
| **Q-216 (a) — le PRODUIT** : `interpreter()` lit par découpage | ✅ **TIENT** | Sur la fonction **compilée du dépôt**, sujet `'stream: ' + n espaces + 'x'` : **409 o → 0,225 ms · 1 609 → 0,072 · 3 209 → 0,020 · 200 009 → 0,285 ms** (l'auditeur du 3ᵉ passage avait mesuré **13 346 ms pour 3 204 o**). Contrôle symétrique : `interpreter('stream: Eicar-Test-Signature FOUND')` rend toujours `{etat:'infectee', signature:'Eicar-Test-Signature'}` |
| **Q-216 (b) — le GARDE-FOU** : `test/depot/cout-expressions.test.mjs` | ❌ **NE TIENT PAS** → **Q-220** | **trois** mutations, trois fois vert. Détail au §5 |
| **Q-219 (a) — la borne de péremption de 40 commits** | ✅ **TIENT, et elle mord à la frontière exacte** | Révision du §8 reculée à **41 commits** → `LA RÉVISION MESURÉE n'est pas distancée…` **rougit** ; reculée à **39** → **verte**. Le témoin (`LE CONTRÔLE MORD`) reste vert dans les deux cas |
| **Q-219 (b) — le lecteur de familles qui découvre** | ✅ **TIENT sur les trois formes** | (a) `journal 19` retirée + total ajusté → **rouge** ; (b) `journal-lecture` → `journal_lecture` → **rouge** (le trait d'union est bien lu) ; (c) famille `fantome 5` inventée + total ajusté → **rouge**. À chaque fois c'est `LES FAMILLES ANNONCÉES sont EXACTEMENT celles de la RÉVISION MESURÉE` qui parle |
| **Q-219 (c) — les CHIFFRES eux-mêmes** | ⚠️ **PARTIEL** → **Q-222** | **Rejoués un par un** : 19 familles comptées séparément (`annuaire 48 · api 272 · approbations 60 · auth 115 · base 274 · cycle 72 · deploiement 70 · depot 42 · documentation 25 · droits 84 · filiales 34 · import 97 · journal 19 · journal-lecture 70 · modules 39 · navigateur 167 · notifications 69 · pieces 89 · reprise 79`) → **somme 1 725**, exactement le total annoncé. Schéma relevé **dans `pg_catalog`** : 49 tables ✔, 16 migrations ✔, 196 politiques ✔, 73 clés étrangères (44/27/2) ✔, 11 composites `(id, filiale_id)` ✔, 9 unicités ✔, 14 contrôles ✔, 0 sans RLS ✔ — **mais 44 tables `cree_par` et 44 déclencheurs, là où le §8 dit 43** |
| **Q-218 — l'atomicité de la création de filiale a une morsure** | ✅ **TIENT** | **Le mutant exact du 3ᵉ passage** : `try { await journaliser(…) } catch { }` dans `src/filiales/index.ts`. `test/filiales/**` passe de **34/34** à **33 passés, 1 échec**, et l'échec est nommément `SI LE JOURNAL REFUSE, LA FILIALE N'EXISTE PAS (constat Q-218)`. Discriminant : aucun autre essai ne bouge |
| **Q-210 — les deux fuites de la porte S6** | ✅ **TIENT** — ***réserve du 3ᵉ passage levée*** | Le 3ᵉ passage écrit « verdict repris, pas rejoué ». Je les ai cassées **une par une** : (a) clause `"utilisateur_id" is not null` **retirée** de `resoudreDestinataires` → `MORSURE Q-196` **rougit**, 68/69 ; (b) `order by ("filiale_id" is null) asc, "filiale_id" asc, "id" asc` **inversé en `desc`** → `MORSURE Q-195` **rougit**, 68/69. **Chaque morsure ne rougit que sous SA mutation** |
| **Q-212 — les quatre sœurs à repli brut** | ⚠️ **PARTIEL** — ***réserve du 3ᵉ passage levée, et elle valait la peine*** → **Q-221** | (a) cinquième sœur `duree()` avec `return String(valeur)` → `AUCUNE QUATRIÈME SŒUR À REPLI BRUT n'a été ajoutée sans être nommée` **rougit** ✔ ; (b) **la même sœur, même défaut, écrite sur deux lignes** (`const brut = String(valeur); return brut;`) → **15 essais, 15 passés**. Le garde cherche `return\s+String\(` |
| **Q-215 / Q-208 — l'analyseur XLSX** | ✅ **tiennent** | `test/import/cout-analyseur.test.mjs` **6/6** ; `<row r>` de 200 000 chiffres → **13 ms** ; `r:id` complice `(a+)+$` → **0,9 ms** ; le rapport ×4 d'entrée / <×12 de temps est vert. Et **aucune** des 37 expressions de `src/` ne rebrousse sous mes propres familles (§2.2) |
| **Q-217** | ✅ **fermé** | L'exemption fautive a disparu avec le détecteur qu'elle servait. Aucune liste `FORMES_ADMISES` ne subsiste |
| **Q-214 a, e** | ✅ **présents** | `serveur.ts` → `connectionTimeout: 120 000`, `requestTimeout: 90 000` ; `auth/index.ts` → `Map` bornée avec éviction. Classe durcissement, non mordus par un essai dédié — **comme au registre** |
| **Q-214 b, c, d, f** | ⏱ **TRAITÉS — jamais tentés en trois passages** | Voir §4. **c est reproduit et chiffré pour la première fois** |

**Bilan** : **onze correctifs rejoués par mutation ou par mesure**, dont les
**deux que le 3ᵉ passage avait explicitement repris sans les rejouer** ;
**neuf tiennent**, **un ne tient pas** (le garde-fou de Q-216), **deux tiennent à
moitié** (le garde de Q-212, les chiffres de Q-219).

---

## 2. La chasse au **quatrième motif** — élargie hors de `src/import/`

### 2.1 Ce que le contrôle de Q-216 attrape, mesuré plutôt que lu

Le contrôle extrait chaque expression littérale de `src/`, la joue contre des
sujets **fabriqués** et lit sa croissance. La question n'est donc pas « quelles
formes reconnaît-il », mais **« quels sujets sait-il fabriquer »**. Il en fabrique
quatre familles, et **trois d'entre elles sont des transcriptions littérales des
trois constats déjà trouvés** :

| Famille | Ce qu'elle produit | Ce pour quoi elle a manifestement été écrite |
|---|---|---|
| répétition d'un signe du motif | `' '×n`, `'a'×n`, `'<'×n`… | forme générale |
| **`` `a: ${' '.repeat(n)}x` ``** | `a: ` puis n espaces | **exactement `clamav.ts` (Q-216)** |
| **`` `<x ${'a'.repeat(n)}` ``** | `<x ` puis n `a` | **exactement les balises XLSX (Q-197, Q-215)** |
| **`` `https://${'a'.repeat(n)}` ``** | | les contrôles d'URL de `config/` |
| morceaux littéraux du motif, répétés | `'<sheet'×n` | Q-215 et Q-197 |
| répétition + `!` (tailles 18/23) | `'a'×18 + '!'` | la forme d'école exponentielle |

**Aucune famille ne combine un préfixe littéral du motif avec un long
remplissage.** C'est le trou, et il est exactement de la même nature que celui
qu'il remplace : le détecteur précédent reconnaissait l'**orthographe** des
constats connus ; celui-ci fabrique les **sujets** des constats connus.

### 2.2 Ce que le produit, lui, ne porte pas — et je l'ai cherché plus large que le dépôt

J'ai écrit une mesure indépendante qui, pour **chaque** expression littérale,
extrait le **préfixe littéral** du motif et lui accole cinq remplissages
(`' '`, `'a'`, `'0'`, `'ab'`, `' a'`) et quatre queues (`''`, `'x'`, `'!'`, `'z '`),
à quatre tailles (400 → 3 200) :

| Ce que j'ai balayé | Expressions | Résultat |
|---|---|---|
| `backend/src/**` (54 fichiers `.ts`) | **37** à quantificateur non borné | **aucune ne rebrousse** |
| `cyber-gouvernance_V4/js/**` (`js/lib/` compris) | **333** | **aucune ne rebrousse** |

C'est la bonne nouvelle du passage, et elle est solide : **le produit livré n'a
pas de quatrième motif.** Ce qui manque est le filet.

### 2.3 Les coûts non bornés qui ne sont pas des expressions rationnelles

Mesurés sur le code **compilé** du dépôt, entrées hostiles :

| Ce que j'ai envoyé | Résultat |
|---|---|
| ZIP de 500 → 32 000 entrées (jusqu'à 3,1 Mo) | **≤ 4,2 ms**, puis refus au-delà de la borne d'entrées |
| ZIP avec 60 000 octets de queue (recherche du EOCD à reculons) | **1,7 ms** — linéaire |
| CSV 256 colonnes × 5 000 lignes (2,5 Mo) | **63,7 ms** — linéaire |
| XLSX à 8 000 chaînes partagées visées à l'envers | **15,6 ms** |
| XLSX à 1 600 lignes de numéros espacés de 9 999 | **2,5 ms** — `assemblerNumerotees` travaille bien sur les numéros distincts |
| multipart à 200 → 12 800 parties | **refusé** — « plus de 16 parties dans le corps » |
| multipart à 800 en-têtes de partie | **refusé** — « bloc d'en-têtes de partie hors borne » |
| multipart, 1 Mo de **quasi-frontières** | **0,7 ms** |
| `normaliserEnTete` sur 800 000 signes | **127,6 ms** — linéaire |
| `correspondanceEnTetes` | linéaire **par construction** : une `Map` par colonne du modèle, une recherche par en-tête |

Recensement statique des boucles imbriquées sur une entrée dans
`src/reprise/`, `src/import/`, `src/api/`, `src/consolidation/`, `src/cycle/` :
un seul candidat (`moteur.ts:460`, `manquantes.some(…)` dans une boucle), **borné
par le modèle** (≈ 30 colonnes), jamais par le fichier.

---

## 3. Ce que j'ai joué

| | |
|---|---|
| Banc du dépôt | `cd backend && set -a && source ~/.grc-essais.env && set +a && npm test` → **1 725 essais, 1 725 passés, 0 échec** (444 suites), joué **deux fois** — à l'ouverture (**164,3 s**) et en clôture (**162,5 s**), code 0 les deux fois ; `npm run verifier-types` **sans sortie**, code 0 |
| Comptes par famille | **19 familles comptées une par une** — voir §1, ligne Q-219 (c) |
| Contrôle **S15** | `npm audit --omit=dev` → **found 0 vulnerabilities**, code **0** |
| **S1 en direct** | `db/verifier_cloisonnement.sql` sous `grc_app` **sur la recette** → **107 contrôles · 107 réussis · 0 échoué**, code 0 |
| Schéma | Relevé **dans `pg_catalog`** sur la recette **et** sur une base neuve créée pour l'occasion et migrée par le vrai `db/migrate.mjs` (**16/16 migrations, code 0, 0 anomalie**) — c'est aussi le point 2 du §5 rejoué |
| Mutations de code | **copie isolée** du dépôt (`rsync` sans `.git`/`dist`), `tsc` privé, `node --test` sur la copie. **Six fichiers mutés en huit mutations, tous restaurés et vérifiés identiques.** Les trois mutations du `README` en place, restaurées dans la même commande |
| Sondes de coût | sur `interpreter`, `lireTableur`, `lireEntrees`, `analyserMultipart`, `normaliserEnTete`, `correspondanceEnTetes` — **compilés depuis `src/`** |
| Route réelle | `/api/connexion`, `/api/session/filiale-active`, `/api/donnees`, `/api/export`, `/api/consolidation`, `/api/filiales`, `/api/journal*`, `/api/entites/risques` (POST/PUT/DELETE), `/api/pieces/risques/:id` (POST/GET/DELETE), `/api/import/risques`, `/api/import/modeles`, `/api/modele`, `/api/sante` — **à travers Apache**, sous quatre comptes AD réels |
| Annuaire | `grc-ad` réel : **deux comptes jetables créés puis supprimés** (`s8quater.cible` pour le martèlement, **`s8q.temoin` comme témoin**) |
| Navigateur | **Chromium réel** (`/opt/pw-browsers`) → **Apache réel** (CSP du vhost) → serveur réel → PostgreSQL → **AD réel** ; connexion par le formulaire, **26 modules**, création + `F5` |
| TLS | chaîne validée **sans `-k`**, avec **`--capath /dev/null --cacert`** (le piège du `CLAUDE.md` §8) → `ssl_verify_result=0` ; TLS 1.0 et 1.1 → **`alert protocol version`**, sondés avec `-cipher 'ALL:@SECLEVEL=0'` (l'autre piège) ; TLS 1.2 accepté |
| Publication | `install.sh --verifier-publication` → **81 fichiers servis identiques au dépôt**, code 0 |

**La recette a été rendue dans l'état où je l'ai trouvée** : `risques` **2 → 2**,
`personnes` **6 → 6**, `filiales` **2 → 2** (aucune filiale créée — proscrit,
Q-155), `pieces_jointes` **0 → 0**, `imports` **21 → 21**. Les 250 lignes du
contrôle symétrique d'import, le risque créé au navigateur, la pièce jointe
légitime, la fiche d'annuaire du compte témoin et la ligne de quarantaine de mon
EICAR ont tous été retirés. **Trois résidus, tous assumés et déclarés** :
*(1)* la ligne `utilisateurs` de `s8q.temoin` — irretirable, `journal_audit` la
référence et le journal est en ajout seul ; c'est le comportement correct d'un
registre d'audit ; *(2)* les entrées de journal de mes sondes, par construction ;
*(3)* le dossier `quarantaine/ca` du 04/09, qui n'est pas le mien.

---

## 4. Les réserves des passages précédents — **traitées**

> *Une réserve écrite n'est pas une réserve traitée.* Les quatre lignes ci-dessous
> étaient au rapport du 3ᵉ passage comme « non re-mordu » ou « non tenté ». Aucune
> n'était coûteuse.

| Réserve | Ce que j'ai fait | Résultat |
|---|---|---|
| **Q-210 « verdict repris, pas rejoué »** | les deux morsures cassées une par une | **levée — les deux tiennent** (§1) |
| **Q-212 « verdict repris, pas rejoué »** | une cinquième sœur ajoutée, sous deux écritures | **levée, et elle rapporte un constat** : la forme canonique rougit, la forme sur deux lignes passe (**Q-221**) |
| **Q-214 b** — promotion avant `commit`, sans réconciliation disque↔base | relu | **toujours vrai.** `promouvoir()` est appelée **avant** la transaction d'insertion ; le rattrapage `retirerDuMagasin(...).catch(() => {})` couvre l'échec de la transaction mais **pas la mort du processus entre les deux**, et `reanalyserStock` itère sur les **lignes** de `pieces_jointes`, jamais sur les fichiers. Conséquence : un fichier orphelin sur disque après un arrêt brutal, que rien ne réclame. **Non reproductible ici sans tuer le service de la recette** — je ne l'ai pas fait |
| **Q-214 c** — quota lu puis consommé dans deux transactions | **reproduit et chiffré, sur base jetable, par le handler réel** | ⚠️ **CONFIRMÉ.** Occupé 4 096 o, **quota 8 287 o**, deux dépôts **concurrents** de 4 091 o : **A → 201, B → 201**, occupé final **12 278 o**, soit **+48 % au-dessus du quota**. ✅ **Mais le dépassement est BORNÉ à une rafale** : la rafale suivante rend **413 / 413** et n'ajoute rien. Le plafond du dépassement est donc *(concurrence × taille maximale)*, soit au pire ≈ 250 Mio sur un quota de 2 Gio — **12 %**, une fois. Cela **confirme le classement `V1.1`** au lieu de l'aggraver |
| **Q-214 d** — trois collections non bornées | recensé | **toujours vrai** : `src/pieces/depot.ts`, `src/approbations/index.ts` et `src/cycle/index.ts` ne portent **aucun** `limit`. Les `limit` du produit vivent ailleurs (`session.ts:289`, `moteur.ts:891`, `entites/index.ts`, `notifications/index.ts`) |
| **Q-214 f** — trois valeurs pour la borne de corps | **mesuré à l'octet près, par la route** | La borne **effective** est **27 262 976** : `27 262 976 o → 400` (le corps est lu et analysé, 82 ms), `27 262 977 o → 413 en 15 ms`. Le `.env` **déployé** porte bien `SERVEUR_TAILLE_MAX_CORPS=27262976`, égal au `LimitRequestBody` : **la fenêtre « refus en cours de corps » n'existe pas dans la configuration livrée**. Reste vrai, et c'est la moitié documentaire du constat : le commentaire de `deploy/apache/cyber-grc.conf:141` annonce toujours « bodyLimit de Fastify 26 214 400 o », qui est le **défaut du code**, pas la valeur livrée |
| **S9 « non re-sondée en direct »** | **sondée en direct, huit contrôles par la route** | **levée** (§6, S9) |

---

## 5. Les constats neufs

> Numérotés **à partir de Q-220**, vérifié par moi-même : le registre du
> `PLAN_EXECUTION` §7 porte **exactement 219 lignes** `Q-…` et s'arrête à
> **Q-219** ; `Q-220` et au-delà n'apparaissent **nulle part** dans le dépôt.

---

### Q-220 — Le contrôle de coût qui a remplacé l'interdit **ne couvre pas la classe qu'il nomme** : trois trous, dont un qui laisse passer la ligne même de Q-216 réécrite naturellement

**Classe : tout le reste (`V1.1`). Aucun chemin d'attaque vivant — le produit ne
porte aucune de ces formes. C'est le garde-fou qui est troué, pour la quatrième
fois de suite dans cette famille.**

L'entête de `backend/test/depot/cout-expressions.test.mjs` écrit :

> *« Il ne reconnaît rien. Il **extrait chaque expression de `src/`, la joue contre
> des sujets hostiles, et la chronomètre**. Une orthographe nouvelle ne le trompe
> pas, parce qu'il ne lit pas l'orthographe : il lit le temps. »*

Il lit le temps **sur les sujets qu'il sait fabriquer**, et il ne sait fabriquer
que ceux des trois constats déjà trouvés. Trois trous, mesurés :

#### (a) Un préfixe littéral suffit — et la ligne de Q-216 en a un dans la vraie vie

La réponse de `clamd` est `stream: <signature> FOUND`. La façon la plus naturelle
de la relire par expression est donc :

```ts
const trouve = /^stream:\s*(.+?)\s+FOUND$/u.exec(ligne);
```

**Mutation M2** — j'ai remis exactement cela à la place du découpage par `indexOf`,
dans `src/pieces/clamav.ts`, sur la copie isolée :

| Ce que j'ai joué sur le mutant | Résultat |
|---|---|
| `test/depot/cout-expressions.test.mjs` | **4 essais, 4 passés** — le contrôle ne voit rien |
| `test/pieces/**` en entier | **89 essais, 89 passés** |
| Coût réel **sur `interpreter()` compilé**, sujet `'stream: ' + n espaces + 'x'` | 409 o → **143 ms** · 809 → **182** · 1 609 → **1 306** · **3 209 o → 11 274 ms** |

Le contrôle attrape la forme **sans** préfixe (`^\s*[^:]*:…`), parce qu'il fabrique
littéralement `` `a: ${' '.repeat(n)}x` ``. Avec le préfixe `stream:`, aucune
famille ne produit un sujet qui commence par `stream:` **et** contient un long
remplissage — les « morceaux du motif » sont répétés (`'stream:'×n`), ce qui ne
déclenche rien. **Le contrôle rend ×1,0.**

Deux autres formes, réalistes dans ce dépôt, échappent de la même façon —
mesurées sur sujets choisis à la main :

| Forme | Le contrôle dit | Coût réel à 3 2xx octets |
|---|---|---|
| `/^\s*[Cc]ontent-[Dd]isposition\s*:\s*(.+?)\s*;\s*name=/u` | ×1,0 **VERT** | **14 306 ms** |
| `/^\/[^:]*:\s*(.+?)\s+FOUND$/u` (un chemin devant) | ×1,0 **VERT** | **13 714 ms** |
| `/^(ab\|a\|b)+$/u` (unité multi-signes + suffixe étranger) | ×1,0 **VERT** | 45 o → **72 ms**, ×11 par 8 signes ajoutés |

#### (b) L'extracteur est aveuglé par un `//` **dans une chaîne**, et par `return/…/`

`sansCommentaires()` retire tout ce qui suit `//` sur une ligne. Un `'//'` **dans
un littéral de chaîne** — la chose la plus banale du monde dès qu'on manipule une
URL — **efface donc la fin de la ligne**, expression comprise.

**Mutation M8**, dans `src/import/moteur.ts` :

```ts
const sansProtocole = valeur.split('//')[1] ?? valeur; const motif = /^\s*[^;]*;\s*(.+?)\s+fin$/u;
```

| Ce que j'ai joué | Résultat |
|---|---|
| `test/depot/cout-expressions.test.mjs` | **4 essais, 4 passés** |
| Coût réel de la forme posée | 404 o → 141 ms · 1 604 → 1 524 · **3 204 o → 12 242 ms** |

Deuxième forme aveugle, vérifiée séparément : `return/^(\w+\s?)+$/u.test(t)` —
sans espace après `return` — n'est pas extraite, la sentinelle arrière
`(?<![\w)\]$])` prenant le `n` de `return` pour un identifiant. **Ces deux trous
frappent aussi l'interdit `new RegExp` de `cout-analyseur.test.mjs`, qui emploie
le même retrait de commentaires.**

#### (c) L'interdit `new RegExp` a été **rétréci de tout `src/` à un seul fichier**, et les deux exemptions mesurées ont disparu avec lui

Avant Q-216, `cout-analyseur.test.mjs` balayait **tout `src/`** pour `new RegExp`
et tenait deux exemptions écrites, mesurées et motivées. Après, le balayage ne lit
plus que `src/import/tableur.ts`. Le commentaire qui remplace la liste affirme :

> *« Les deux contrôles couvrent donc deux moitiés disjointes. »*

**C'est faux** : la moitié « expression construite » ne fait plus qu'un fichier de
large, et la mesure ne peut rien pour elle — le fichier le dit lui-même (*« son
motif n'existe qu'à l'exécution »*).

**Mutation M1** — un motif construit depuis l'en-tête du fichier importé, posé
dans `src/import/moteur.ts` :

```ts
function colonneCorrespond(enTete: string, recherche: string): boolean {
  return new RegExp(`^(${recherche}+)+$`, 'u').test(enTete);
}
```

C'est **exactement la forme de Q-208 b** — les deux moitiés de la catastrophe
voyagent dans le même fichier. Résultat : `cout-expressions` **4/4**,
`cout-analyseur` **6/6**, et **aucun autre essai du dépôt ne balaie `src/` pour
`new RegExp`** (vérifié : deux occurrences de `includes('new RegExp')` dans tout
`test/`, toutes deux dans `cout-analyseur.test.mjs`, sur le seul `tableur.ts`).

Effet de bord immédiat : `src/pieces/multipart.ts:164` et `:166` **construisent
toujours** un `new RegExp` depuis `nom`. Ils sont sûrs — `nom` vaut `'name'` ou
`'filename'`, littéraux, aux deux seuls sites d'appel — mais **plus rien ne le
dit ni ne le vérifie**, alors qu'une exemption écrite et mesurée le faisait la
veille.

**Ce que le client ne perd PAS.** Rien aujourd'hui : `src/` et le frontend sont
propres (§2.2). Ce qui est perdu est la garantie que le **prochain** ne le sera
pas — et c'est la quatrième fois d'affilée que cette famille passe sous son filet.

**Pourquoi le banc ne le voit pas.** Parce que le banc **est** le filet. Ses quatre
morsures internes sont les quatre formes déjà connues ; aucune ne l'éprouve sur
une forme qu'il n'a pas servi à écrire. C'est le défaut de `formesARisque()`
déplacé d'un cran : on ne code plus en dur les **motifs**, on code en dur les
**sujets**.

**Correctifs proposés**, par ordre de rendement :
1. **fabriquer les sujets à partir du motif**, et non d'une liste : marcher
   l'expression, prendre son préfixe littéral consommable, et lui accoler chaque
   remplissage plausible (espace, alphanumérique, digramme) avec et sans queue
   étrangère. C'est ce que fait ma sonde ; elle tient en quarante lignes et elle
   attrape **les trois formes de (a)** ;
2. **retirer les commentaires par un vrai balayage lexical**, ou à tout le moins
   ne pas couper une ligne sur un `//` situé dans un littéral de chaîne — sinon
   la moitié des lignes qui manipulent une URL sont invisibles aux deux contrôles ;
3. **rendre à l'interdit `new RegExp` sa portée `src/` entière**, avec ses
   exemptions mesurées : la mesure et l'interdit ne sont disjoints que si
   l'interdit couvre tout ce que la mesure ne peut pas voir ;
4. accessoirement, `assert.ok(expressions.length >= 30)` avec **37** extraites
   laisse sept expressions disparaître en silence.

---

### Q-221 — Le garde de Q-212 reconnaît une **orthographe** : la même sœur écrite sur deux lignes lui échappe

**Classe : tout le reste (`V1.1`). Aucun chemin d'attaque vivant : les quatre
sœurs existantes sont toutes nommées.**

`test/depot/traductions.test.mjs` tient une liste écrite à la main,
`SOEURS_A_REPLI_BRUT = ['valeur','date','nombre','pourcentage']`, et — c'est ce qui
la rend légitime — un garde qui **rougit** si une cinquième apparaît sans être
nommée. Le garde cherche `/return\s+String\(/u` ligne à ligne.

| Mutation posée dans `cyber-gouvernance_V4/js/i18n/index.js` | `test/depot/traductions.test.mjs` |
|---|---|
| `function duree(v){ … if (!isFinite(n)) return String(v); … }` | **14 passés, 1 échec** ✔ |
| `function duree(v){ … if (!isFinite(n)) { const brut = String(v); return brut; } … }` | **15 passés, 0 échec** ✘ |

La seconde écriture a **exactement le même défaut** — une valeur venue de la base
ressort telle quelle, non échappée, et ses sites d'appel ne sont plus regardés par
`valeursNonEchappees()`. Un `console.warn` inséré avant le `return`, ou un simple
souci de lisibilité, suffit à sortir une sœur du contrôle **sans que rien ne le
dise**.

**Ce que le client risque** : le retour de Q-203 — une valeur stockée qui traverse
le dictionnaire sans échappement — le jour où quelqu'un ajoute une cinquième
fonction de formatage. C'est le motif que Q-212 avait précisément identifié :
*« corriger un symptôme dans un module laisse la cause en place »*.

**Correctif** : juger la **propriété** et non l'écriture — dans le corps d'une
fonction, tout `String(` appliqué à un paramètre et atteignant un `return` compte.
Ou, plus simple et suffisant ici : détecter `String(` **n'importe où** dans le
corps d'une fonction du fichier, quitte à exiger une exemption motivée pour les
conversions qui ne sont pas des replis — ce que la liste `SANS_REPLI_BRUT` sait
déjà faire, et qu'elle fait bien.

---

### Q-222 — Le §8 du `README` porte **deux chiffres faux**, dans le bloc réancré la veille pour Q-219

**Classe : tout le reste (`V1.1`) — mais c'est le point 6 du `PLAN_EXECUTION` §5,
que la porte est chargée de vérifier, et il est FAUX. C'est le second motif du
refus.**

| Ce que le §8 annonce (`backend/README.md:888`) | Ce que j'ai mesuré | Où |
|---|---|---|
| « **43 tables portant `cree_par`** » | **44** | recette **et** base neuve migrée par `db/migrate.mjs` |
| « **43 déclencheurs de création** » | **44** (`trg_%_creation`, aucun manquant) | idem |

Les tables sont : `actif_dependances, actif_risques, actifs, actions,
approbations, audits, clients, controles_schema, document_referentiels, documents,
evaluation_mesures, evaluations, exigences, filiales, groupes_ad, history,
imports, incident_actifs, incidents, mapping_exigences, mappings, mco_actions,
mesure_catalogue, mesure_mise_en_oeuvre, parametres, personnes, pieces_jointes,
prestataires, processus, processus_actifs, profil_domaines, profils,
referentiels_actifs, revues, risque_catalogue, risque_exigences, risques,
scenarios_pra, sessions, tests_pra, traitement_mesures, traitements, utilisateurs`
— **44**, et chacune porte son déclencheur.

**Restent exacts, et je les ai tous rejoués** : 1 725 essais / 1 725 passés,
**les 19 comptes par famille un par un**, 49 tables, 16 migrations, 196 politiques,
0 sans RLS activée ou forcée, 73 clés étrangères (44 `restrict`, 27 `cascade`,
2 `set null`), 11 composites `(id, filiale_id)`, 9 unicités `uq_*_id_filiale`,
14 contrôles dans `controles_schema`, `f_verifier_schema()` → 0 ligne,
`verifier_cloisonnement.sql` → 107·107·0, `npm audit` → 0.

**Pourquoi le banc ne le voit pas.** `chiffres-du-banc.test.mjs` garde le **compte
d'essais**, les **familles**, la **somme**, la **cohérence §5/§8/CHANGELOG**, la
**réalité de la révision** et désormais sa **péremption** — six propriétés, toutes
vérifiées, toutes vertes, et j'ai mordu les deux nouvelles. Il ne garde **aucun**
chiffre du **schéma** : ni les tables, ni les migrations, ni les politiques, ni
les déclencheurs. Ces huit nombres-là sont recopiés à la main dans un paragraphe
de prose, et **rien ne les confronte au catalogue**.

**Ce que le client perd** : peu, cette fois — un exploitant qui compte les
déclencheurs trouvera 44. Mais c'est le troisième passage de porte consécutif où
le point 6 est faux, et la deuxième fois **dans le geste même censé le fermer**.
Le §5 dit pourquoi cela compte : *un chiffre faux ne mesure plus rien — pire, il
rassure.*

**Correctif** : la même chose qu'on vient de faire pour les familles — **découvrir
au lieu de réciter**. Un essai qui lit les huit nombres du paragraphe de schéma et
les confronte à `pg_catalog` sur une base neuve coûte trente lignes, et il tient
tout seul. À défaut, retirer du §8 les nombres que rien ne garde.

---

## 6. La grille S1 → S18 — rejouée intégralement

Un contrôle sans objet est marqué « sans objet » ; un contrôle non rejoué est
marqué « non rejoué », et cela **ne vaut pas « passé »**.

| # | Contrôle | Comment je l'ai mesuré | Verdict |
|---|---|---|---|
| **S1** | Cloisonnement | Recette : **49 tables, 49 `relrowsecurity`, 49 `relforcerowsecurity`, 0 table à `filiale_id` sans force, 196 politiques** ; `grc_app` **`rolsuper=f`, `rolbypassrls=f`, 0 table possédée**. `verifier_cloisonnement.sql` → **107/107, code 0**. **Par la route** : `rssi.tls` (une filiale) ne voit **que TLS** dans `/api/consolidation` ; `rssi.groupe` voit **TLS et DEU** | ✅ **tient** |
| **S2** | Le périmètre ne vient jamais du navigateur | `GET /api/donnees?filiale=<l'autre>` et l'en-tête `x-filiale: <l'autre>` rendent **200 avec un contenu strictement identique** à l'appel nu — seul l'horodatage diffère (diff JSON à l'appui). `PUT /api/session/filiale-active` vers une filiale hors périmètre → **403 `hors_perimetre`** ; vers une filiale **inventée** → **403 identique**, aucun oracle d'existence. Un `id` proposé à la création → **400** ; un champ `version` dans `champs` → **400** | ✅ **tient** |
| **S3** | Journal inaltérable et complet | **Sous `grc_proprietaire`** : `update`, `update … where false`, `delete`, `truncate` sur `journal_audit` → **tous refusés « en ajout seul »**. `f_journal_audit_verifier(null)` → **0 anomalie** sur **554 entrées**. Complétude, fenêtre de mes sondes : `connexion_reussie ×5`, `connexion_echouee ×7`, `consultation_sensible ×10`, `refus_autorisation ×6` (un par 403), `export ×1`, `changement_perimetre ×2` | ✅ **tient** |
| **S4** | Verrouillage optimiste | Par la route : `PUT version:1` → **200**, second `PUT version:1` → **409 `conflit_version`**, `version:999` → **409**. Le client ne gagne pas en surenchérissant, et `version` est **structurelle** — la placer dans `champs` rend **400** | ✅ **tient** |
| **S5** | Aucune injection SQL | Recensement de `src/**` : **42** interpolations dans un gabarit SQL, remontées une par une. Toutes viennent d'`ident()` (liste blanche **ancrée** `^[a-z_][a-z0-9_]{0,62}$`), de `guillemeter()` (doublement des guillemets, alimenté par `pg_catalog`), d'un **type fermé** (`SourceRepartition`, sept couples), ou de **listes littérales** du fichier. **100 % des valeurs restent paramétrées** | ✅ **tient** |
| **S6** | Droits côté serveur | `direction` (Groupe, **lecture**, `export:false`) : `POST /api/entites/risques` → **403 `droit_insuffisant`** ; `POST /api/filiales` → **403** ; `GET /api/journal/verification` → **403**. `rssi.tls` : `PUT /api/session/filiale-active` hors périmètre → **403** | ✅ **tient** |
| **S7** | Export distinct de la lecture | `direction` : `GET /api/export` → **403** ; `GET /api/donnees` → **200**, **et tracé** `consultation_sensible`. `rssi.groupe` (`export:true`) : `GET /api/export` → **200, 4 387 octets**, tracé `export`. Les refus sont journalisés | ✅ **tient (lettre + trace)** ; la barrière sur `/api/donnees` reste **refusée par écrit**, au registre (Q-209) |
| **S8** | Secrets | `.env.example` : **0** affectation de secret non vide ; `/api/sante` n'en porte aucun (statut, version, environnement, heure, latence base) ; aucune réponse d'erreur n'en porte | ✅ **tient** |
| **S9** | Chaîne des pièces jointes | **Sondée en direct, par la route, à travers Apache** — la réserve du 3ᵉ passage est levée. `.exe` → **400** « formats admis : … » ; **EICAR nommé `.pdf`** → **400** « le contenu ne correspond pas à son extension » (la signature mord **avant** l'antivirus) ; **ELF nommé `.pdf`** → **400** idem ; **EICAR nommé `.txt`** → **400** « l'analyse antivirale a détecté une menace … mis en quarantaine » — **ClamAV réel** ; **`.docx` contenant `vbaProject.bin`** → **400** « les documents contenant des macros ne sont pas acceptés » ; PDF légitime → **201**, délivré en `content-disposition: attachment`, `nosniff`, `no-store` ; `DELETE` → **204**. Familles `test/pieces/**` **89/89** | ✅ **tient** |
| **S10** | Sortie et en-têtes | Via Apache : **HSTS** `max-age=31536000; includeSubDomains`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy`, **CSP stricte** (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`) ; cookie `grc_session` **HttpOnly ; SameSite=Strict ; Secure** ; `Cache-Control: no-store` sur la connexion. **Dans Chromium : 0 violation de CSP sur 26 modules**. TLS : chaîne validée **sans `-k`** et avec `--capath /dev/null` → `ssl_verify_result=0` ; TLS 1.0/1.1 → `alert protocol version` | ✅ **tient** |
| **S11** | Rythme et verrouillage | **Contre l'AD réel, sur un compte jetable créé pour cela** : 6 mots de passe faux → 6 × **401** ; puis **le bon mot de passe → 401**, et encore 401 plusieurs minutes après. **Et un TÉMOIN**, créé au même instant, dans le même groupe, depuis la même adresse : **200 du premier coup** — la mesure discrimine donc bien le martèlement, et non une configuration. Le compte martelé n'ayant **aucune ligne** dans `utilisateurs`, c'est le **compteur en mémoire** qui a tenu, exactement comme `src/auth/tentatives.ts` le décrit. **7 `connexion_echouee`** au journal. Message **identique** dans les deux cas — aucun oracle « ce compte est verrouillé ». Les deux comptes ont été supprimés de l'annuaire | ✅ **tient** |
| **S12** | Erreurs muettes | Corps invalide → `{"erreur":"donnee_invalide","message":"Le champ « nom » attend du texte.","reference":…}` ; JSON malformé → `donnee_invalide` « format ou type de contenu invalide » ; ressource inconnue → `ressource_inconnue`. **Aucune pile, aucun nom d'objet de base, aucun `detail`/`constraint` PostgreSQL** | ✅ **tient** |
| **S13** | Dénis de service applicatifs | Borne de corps mesurée **à l'octet** : 27 262 976 → **400** (82 ms), 27 262 977 → **413 en 15 ms**, 30 Mo **anonyme** → **413 en 14 ms** ; `Transfer-Encoding: chunked` → **411**. Analyseurs : multipart borné à **16 parties** et **8 Kio d'en-têtes** ; ZIP, CSV, XLSX linéaires (§2.3) ; **aucune** des 37 expressions de `src/` ne rebrousse. ⚠️ Le **trou est dans le garde-fou** (Q-220), pas dans le produit | ✅ **tient** |
| **S14** | Intégrité des opérations composites | **Par la route réelle** : import de **251 lignes dont une fautive**, `appliquer=oui` → **409, `applique:false`**, `risques` **2 → 2** ; **contrôle symétrique** : le même fichier privé de la ligne fautive → **200**, `risques` **2 → 252** (nettoyé ensuite). Création de filiale : mutant qui avale l'échec du journal → **1 échec ciblé** (Q-218) | ✅ **tient** |
| **S15** | Dépendances | `npm audit --omit=dev` → **found 0 vulnerabilities**, code **0** | ✅ **tient** |
| **S16** | Garde-fous branchés | `f_verifier_schema()` est appelé par `db/migrate.mjs` **et** par `deploy/install.sh` (`GARDE_FOU_SCHEMA`). **Morsure sur base jetable** : `alter table risques no force row level security` + `alter table actions disable row level security` → `f_verifier_schema()` rend **2 anomalies** (`risques: force_absente`, `actions: rls_desactivee`) et `migrate.mjs` **sort en code 7** avec le motif nommé. Sur la recette : **0 anomalie, 14 contrôles consignés** | ✅ **tient** |
| **S17** | Chemin complet réel | **Chromium réel → Apache réel (CSP du vhost) → serveur réel → PostgreSQL → AD réel** : démarrage **200**, connexion `rssi.groupe` par le **formulaire**, titre **« Cyber GRC — Dedienne Aerospace Toulouse »** (identité de filiale, L9), **26 modules sur 26 peints**, **0 violation de CSP, 0 erreur de page**. La seule erreur console est le **401 attendu** du `GET /api/session` d'avant-connexion. ⚠️ **Réserve honnête, inchangée** : Chromium n'emploie pas le magasin du système, la vérification du certificat y est donc levée ; la chaîne est vérifiée séparément par `curl` **sans `-k`** | ✅ **tient** |
| **S18** | Le produit fait son travail | Par le **formulaire réel** : `#/risques` → « Déclarer un risque » → saisie → « Créer le risque » → **aucun bandeau « champs non enregistrés »** → **`F5` complet** → **l'enregistrement est retrouvé**. Nettoyé ensuite par `DELETE …?version=1` → 200. Les 26 modules rendent tous du contenu | ✅ **tient** |

**Aucun des dix-huit contrôles n'est en échec, et aucun n'est marqué « non
rejoué ».** C'est la première fois sur les quatre passages de cette porte.

---

## 7. Ce que je n'ai pas pu éprouver

### 7.1 Impossible ici — et ce qu'il faudrait

| Ce qui n'est pas éprouvé | Pourquoi | Ce qu'il faudrait |
|---|---|---|
| **Q-214 b par la panne réelle** | Il faut **tuer le processus** entre `promouvoir()` et le `commit` ; sur la recette cela coupe le service pour tout le monde, et l'orphelin resterait sur disque | Un essai qui injecte un échec dans `avecTransaction` après la promotion, puis **balaie le disque** ; ou, mieux, une réconciliation disque↔base à ajouter à `reanalyserStock` — c'est le correctif, et il rend l'essai possible |
| **Q-220 par la route** | Le produit livré **n'est pas vulnérable** : les formes n'existent que dans mes mutants, et je ne déploie pas un mutant sur la recette. Le mécanisme est mesuré sur `interpreter()` **compilé**, le code exact de la route | Rien de plus à mesurer ; le correctif **est** la mesure manquante |
| **La vérification du certificat *dans* Chromium** | Chromium n'emploie pas le magasin du système (NSS) ; installer la racine dans un profil NSS pour ce seul contrôle ne mesurerait rien de plus | La chaîne est vérifiée par `curl` **sans `-k`**, avec `--capath /dev/null --cacert` → `ssl_verify_result=0` |
| **La création d'une filiale sur la recette** | Proscrit (Q-155 : une filiale active de plus fait basculer `f_perimetre_groupe()` à faux) | Éprouvée sur **base jetable**, handler réel, migrations réelles — nominal **et** morsure |
| **L'AD de production du client** | Règle de prudence inchangée | J'ai employé `grc-ad` et **créé mes propres comptes jetables**, puis je les ai supprimés |
| **L'envoi SMTP authentifié complet** | La recette n'a pas d'identifiants de relais | Reste à jouer chez le client (`PLAN_SERVEUR` §9) |

### 7.2 Non tenté — dit franchement

* **Le martèlement concurrent du pool n'a pas été refait.** Le 3ᵉ passage l'a
  mesuré (10 imports hostiles simultanés, ≤ 196 ms, `/api/sante` ≤ 68 ms) et rien
  n'a changé sur ce chemin depuis. **Verdict repris, pas rejoué** — je le nomme
  plutôt que de le maquiller.
* **Le frontend n'a pas été ré-audité pour l'injection.** Q-211 ferme le canal à
  la source (mordu au 3ᵉ passage) ; les 48 sites d'attribut restent non échappés,
  par décision écrite au registre. J'ai en revanche balayé **tout**
  `cyber-gouvernance_V4/js/` pour le coût des expressions (333 expressions, rien).
* **`test/reprise/**` et `test/cycle/**` n'ont pas été mordus** : verts dans les
  1 725, et hors du chemin des correctifs de cette porte.
* **Je n'ai pas rejoué les seize migrations sur la base de la recette** — seulement
  sur une base neuve créée pour l'occasion. Rejouer sur la recette n'aurait rien
  appris et l'aurait exposée.

---

## 8. Ce que cette porte enseigne

1. **Un garde-fou qui fabrique ses propres sujets d'épreuve les fabrique à
   l'image de ce qu'il connaît.** Le 3ᵉ passage a remplacé un détecteur qui codait
   en dur les **motifs** par une mesure qui code en dur les **sujets**. Le progrès
   est réel — la mesure ne se contourne pas par une réécriture du motif — mais la
   généralité promise par son entête n'existe pas : trois familles de sujets sur
   six sont des transcriptions littérales de Q-197, Q-215 et Q-216. **La question
   à poser à un garde-fou n'est pas « que reconnaît-il ? » mais « qu'est-il
   incapable de fabriquer ? ».**
2. **Élargir un contrôle en le déplaçant peut le rétrécir.** L'interdit
   `new RegExp` couvrait tout `src/` avec deux exemptions mesurées ; il ne couvre
   plus qu'un fichier, et les deux exemptions ont disparu — pendant que le
   commentaire affirme que les deux contrôles « couvrent deux moitiés disjointes ».
   Le remplacement d'un contrôle est le moment où l'on perd de la couverture sans
   le voir, parce qu'on regarde ce qu'on ajoute.
3. **Deux passages de suite, la leçon écrite n'a pas été appliquée à la ligne
   d'à côté.** Le 3ᵉ passage a démontré qu'un garde qui cherche une **orthographe**
   ne couvre pas sa classe, l'a écrit en toutes lettres — et le garde de Q-212,
   dans le même dépôt, cherche `return\s+String\(`. La leçon a été tirée sur un
   cas, pas sur la classe.
4. **Le point 6 du §5 est faux pour la troisième porte de suite, et pour la
   deuxième fois dans le geste censé le fermer.** Les chiffres qu'un essai garde
   sont exacts — les 19 familles, la somme, la révision, la péremption, tous
   mordus. Les chiffres que personne ne garde ont dérivé. *Un chiffre non gardé
   dérive ; ce n'est pas de l'inattention, c'est une propriété du chiffre.*
5. **Et la bonne nouvelle, qui doit être dite aussi nettement que le refus** :
   pour la première fois en quatre passages, **aucun des dix-huit contrôles n'est
   en échec, et aucun n'est « non rejoué »**. Le produit encaisse un EICAR réel, un
   `.docm` déguisé, un import à 251 lignes dont une fautive, un martèlement contre
   un AD réel avec témoin, deux écritures concurrentes, 26 modules sous la CSP
   livrée, et rend la base exactement dans l'état où il l'a trouvée. **Rien dans
   le produit ne s'oppose à la mise en service pilote ; ce qui reste à fermer est
   le filet, et il se ferme en une journée.**

---

> **Constats neufs : Q-220, Q-221, Q-222**, tous de la classe « tout le reste ».
> Chacun doit recevoir au registre du `PLAN_EXECUTION` §7 un **propriétaire nommé
> et une échéance** — *un constat chiffré et non attribué est un constat perdu.*
> **Q-222 conditionne la clôture de cette porte** (§5, point 6) et se ferme par la
> mesure, pas par une relecture. **Zéro constat des deux classes dures.**
