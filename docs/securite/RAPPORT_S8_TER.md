# Rapport de la porte S8 — **troisième passage** — condition de mise en service

> **Révision auditée** : `df2ddb0` (« Q-215 : le troisième déni de service du même
> analyseur, et l'interdit recalibré »), branche
> `claude/vague-3-planning-review-6zgbch`.
> **Auditeur** : SECU (3ᵉ passage) — n'a écrit aucune des lignes examinées, et
> n'écrit que ce fichier. **Aucun fichier du produit n'a été modifié dans le
> dépôt** : toutes les mutations ont vécu dans une copie isolée du scratchpad,
> restaurées et vérifiées identiques (`diff -rq` sur `backend/src`,
> `backend/test` et `cyber-gouvernance_V4` : identiques). Aucun commit, aucun
> `git add`, aucun `git checkout`. `git status --porcelain` vide en fin d'audit.
> **Date** : 05/09/2026. **Machine** : `SRV-Infra`, VM Debian 13 réelle,
> PostgreSQL 17.11, Apache 2.4.68 en service, Chromium/Playwright réels
> (`/opt/pw-browsers`), contrôleur de domaine Samba `grc-ad` réel. La recette
> sert `https://grc.exemple.interne/` en permanence, à la révision auditée.

---

## Verdict global

> ### ❌ **Porte S8 refusée — et, pour la première fois en trois passages, sur rien qui touche au comportement du produit.**
>
> **Les deux classes dures sont vides.** Aucun constat « bloque le
> fonctionnement », aucun constat « fuite ou perte de données ». **Q-215 est
> fermé, et je l'ai mordu** : la forme exacte réintroduite fait rougir le banc, et
> par la route réelle à travers Apache un classeur hostile de **1 210 octets** —
> celui qui bloquait la boucle **20,15 s** au passage précédent — rend **409 en
> 100 ms**, `/api/sante` restant à **22 ms** pendant l'import. Dix imports
> hostiles simultanés répondent tous en **≤ 196 ms**, sonde de disponibilité à
> **68 ms** au pire, **0 réponse non-200**. Les six autres correctifs du premier
> passage tiennent ; j'en ai re-mordu deux moi-même (**Q-211** et **Q-213**), sans
> reprendre le verdict de mon prédécesseur.
>
> **Le refus tient au `PLAN_EXECUTION` §5, point 6**, que la porte est
> explicitement chargée de vérifier (« *Une livraison n'est acceptée que si tous
> ces points sont vrais. C'est ce que vérifie la porte.* »), et dont la note dit
> mot pour mot que *l'auditeur qui trouve un chiffre faux le compte comme un
> constat, pas comme une coquille*. Le §8 de `backend/README.md` annonce **1 030
> essais et 11 familles** là où le banc en rend **1 719 et 19** ; **48 tables, 7
> migrations, 192 politiques et 9 garde-fous** là où la base en porte **49, 16,
> 196 et 14**. Le `CLAUDE.md` se contredit lui-même — **1 143** au §8, **1 705**
> plus bas, **1 143** encore ensuite. **Aucun des deux passages précédents n'a
> vérifié ce point de la grille** ; c'est le constat **Q-219**.
>
> **S'y ajoutent trois constats de méthode, tous de la classe `V1.1`, et le
> premier est le plus utile** : l'interdit qui a remplacé la vigilance après
> Q-215 **ne couvre pas la classe qu'il prétend couvrir**. Il ignore
> `[\s\S]*?` — *la forme exacte que le commentaire du fichier nomme comme
> l'origine de Q-197* — et son exonération d'ancre est **posée à la ligne**, si
> bien qu'elle laisse passer **cinq** occurrences de `[^x]*` dans `src/`, dont
> **la plus coûteuse de tout l'arbre** : `pieces/clamav.ts:118`, mesurée à
> **13 346 ms pour 3 204 octets**. Le recensement « quatre occurrences mesurées
> et admises » en voit **quatre sur neuf**.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **aucun** | Q-215 fermé et mordu ; rien de neuf |
| **Fuite ou perte de données** | **aucun** | cloisonnement, journal et persistance mordus |
| **Tout le reste** (`V1.1`) | **Q-216, Q-217, Q-218, Q-219** | inscrits au registre ; **Q-219 conditionne la clôture de la porte** (§5.6) |

**Ce que ce verdict dit du produit.** Il fonctionne, et il tient sous ce que j'ai
pu lui envoyer : des sondes par la route réelle à travers Apache, un navigateur
réel sous la CSP livrée, un annuaire réel, une base réelle. La dette qui reste est une
dette de **dispositif** — un garde-fou troué, deux correctifs sans morsure, des
chiffres périmés — et non de comportement. C'est une différence de nature avec
les deux passages précédents, et elle mérite d'être dite : **le produit n'est plus
ce qui échoue à cette porte ; c'est ce qui l'entoure.**

---

## 1. Q-215 et les six autres correctifs — **tient / ne tient pas / non éprouvé**, avec la mutation jouée

C'est la section qui compte. Pour chaque correctif : ce que j'ai cassé, et ce qui
a rougi. Je n'ai repris **aucun** verdict du deuxième passage sans le rejouer.

| # | Correctif | Verdict | Mutation jouée, et ce qui a rougi |
|---|---|---|---|
| **Q-215** | `cheminPremiereFeuille` lit par `elementsXml` ; interdit élargi à la **forme** et à **tout `src/`** | ✅ **TIENT** — mais **l'interdit qui le protège est troué** (Q-216) | **M1** : j'ai remis `/<sheet\b([^>]*)\/?>/u` à sa place → `cout-analyseur.test.mjs` **rougit** en nommant la ligne : `369: const feuilleTrouvee = /<sheet\b([^>]*)\/?>/u.exec(classeur);` — ⚠️ **ce numéro n'existe pas dans le fichier** : le détecteur compte les lignes *après* avoir retiré les commentaires de bloc, la ligne réelle étant la **645**. Détail mineur, mais il envoie le lecteur au mauvais endroit d'un fichier de 950 lignes. **Par la route réelle** (Apache) : `workbook.xml` = `<sheet` × 64 000, archive de **1 210 o** → **409 en 0,100 s**, `/api/sante` à **22 ms** pendant ce temps. Le correctif est bon **sur sa forme**. Voir **Q-216** pour la forme voisine qu'il ne voit pas. |
| **Q-208** | `numeroLigne` par balayage ; `cheminPremiereFeuille` par égalité de chaînes | ✅ **tient** | Les deux essais de coût du banc mordent : `<row r>` de 200 000 chiffres → **13,8 ms** (l'auditeur du 1ᵉʳ passage avait mesuré 35 472 ms) ; `r:id="(a+)+$"` avec sujet complice → **0,9 ms** (contre 2 040 ms). L'essai de **rapport** (`×4 d'entrée < ×12 de temps`) est présent et vert. |
| **Q-209** | `/api/donnees` journalise `consultation_sensible` ; barrière `GRC-EXPORT` **délibérément** absente | ✅ **tient, mesuré par la route** | Compte `direction` (Groupe, lecture, `export:false`) sur la recette : `GET /api/export` → **403**, `GET /api/donnees` → **200**, et le journal porte, dans la fenêtre, `consultation_sensible` « Chargement du jeu de données complet de la filiale active » **et** « Consultation de la synthèse consolidée du groupe ». Trois `refus_autorisation` pour les trois refus. |
| **Q-210** | Deux morsures pour les fuites de relance Q-195/Q-196 | ⏸️ **non re-mordu par moi** | Le 2ᵉ passage les a mordues une par une et les a vues rougir ; j'ai priorisé Q-211 et Q-213, dont l'échec coûte plus cher. Les deux essais existent et sont verts dans les 1 719. **Dit franchement : verdict repris, pas rejoué.** |
| **Q-211** | Les quatre signes `"`, `<`, `>`, `&` refusés **à la source** | ✅ **TIENT — mordu, et round-trip réel** | **Mutation** : `if (false && /["<>&]/u.test(identifiant))` → `test/api/identifiants.test.mjs` **rougit sur deux essais** (« les quatre signes sont refusés, un par un » et « LE CAS EXACT DU CONSTAT : un identifiant qui casse un attribut »), le contrôle symétrique restant vert. **Round-trip réel** : `GET /api/export` sur la recette (25 collections, 15 enregistrements, `grc-backup` v13), relu par `POST /api/reprise` sur base jetable → `remplacer` **200, `champsIgnores: []`**, 15 créés ; `fusionner` **200, `champsIgnores: []`**, 15 mis à jour. **Contre-épreuve** : le même fichier avec `id: 'x"><img src=1 onerror=alert(9)>'` → **400 `donnee_invalide`**, **0 ligne en base**. |
| **Q-212** | Les **quatre** sœurs à repli brut + garde mécanique | ⏸️ **non re-mordu par moi** | Le 2ᵉ passage a ajouté une cinquième sœur et vu le garde la nommer. Vert dans les 1 719. **Verdict repris, pas rejoué.** |
| **Q-213** | Trace de création de filiale écrite **dans** la transaction | ✅ **TIENT — mordu** ; ⚠️ mais **la propriété d'atomicité n'a aucune morsure au banc** (Q-218) | **Nominal**, base jetable, handler réel : `POST /api/filiales {code:'ZZZ'}` → **201**, `filiales` 2 → 3, et **une** entrée au journal portant `entite_id` = l'identifiant rendu, `valeurs_apres = {code:'ZZZ', statut:'active', raison_sociale:'Filiale Éprouvette', groupes_ad_a_creer:30}`, acteur `admin.grc`. **Mutation** : `journaliser` lève pour `creation`/`filiales` → **HTTP 500, `filiales` reste à 2, aucune ligne `ZZZ`, aucune entrée au journal**. Le journal qui refuse fait bien échouer la création. |
| **Q-214 a, e** | Délais Fastify ; `Map` de revalidation bornée | ✅ **présents** | `serveur.ts:90-91` → `connectionTimeout: 120 000`, `requestTimeout: 90 000` ; `auth/index.ts` → borne + éviction. Classe durcissement `V1.1`, non mordus par un essai dédié — **comme au registre**. **b, c, d, f restent ouverts**, inchangés. |

**Bilan** : **cinq correctifs re-mordus par moi** (Q-215, Q-208, Q-209, Q-211,
Q-213) — **tous tiennent** ; **deux repris sans rejeu** (Q-210, Q-212), et je le
dis plutôt que de laisser croire le contraire ; **Q-214 a/e présents**.

---

## 2. La chasse au **quatrième motif** — ce que j'ai cherché, et ce que j'ai trouvé

Le passage précédent a écrit, en conclusion : *« la parade n'est pas un troisième
interdit plus fin »*. J'ai donc commencé par mesurer **ce que l'interdit posé
attrape réellement**, plutôt que de relire l'analyseur une quatrième fois.

### 2.1 L'interdit mord sur sa propre forme — et **seulement** sur elle

`formesARisque()` (`test/import/cout-analyseur.test.mjs`) accuse une ligne si
elle contient `new RegExp`, **ou** si elle porte `[^…][*+]` **et** que la ligne ne
contient pas `/^`. Trois trous, mesurés :

| Ce qui échappe | Pourquoi | Ce que ça coûte, mesuré |
|---|---|---|
| **`[\s\S]*?` et `.*?`** | le détecteur exige littéralement `[^` | **M2** ci-dessous : **931 o → 2 625 ms**, banc **entièrement vert** |
| **l'exonération d'ancre est posée à la LIGNE** | `!/\/\^/u.test(ligne)` — un `/^` **ailleurs sur la ligne** disculpe tout le reste | **5** occurrences de `[^x]*` de `src/` ne sont **jamais** accusées, dont `clamav.ts:118` à **13 346 ms pour 3 204 o** |
| **`[^x]{n,}`, les quantificateurs imbriqués `(…+)+`, le multi-ligne** | non couverts par les deux règles | non mesuré (pas d'occurrence dans `src/`) |

### 2.2 **M2 — la mutation qui compte** : la forme que le fichier lui-même désigne

Le commentaire d'`elementsXml` (`tableur.ts:512`) écrit, en toutes lettres, que la
forme évidente — **`<nom …>([\s\S]*?)</nom>` répétée par `exec`** — est
« quadratique dès qu'une balise n'est pas refermée, et c'est le constat Q-197 ».
J'ai remis exactement cette forme à la place du correctif de Q-215 :

```ts
const feuilleTrouvee = /<sheet\b([\s\S]*?)\/?>/u.exec(classeur);
```

| Ce que j'ai joué | Résultat |
|---|---|
| `test/import/cout-analyseur.test.mjs` | **7 essais, 7 passés** — l'interdit ne voit rien, les mesures ne portent pas sur cette forme |
| **`npm test` entier** sur le mutant | **1 719 essais, 1 712 passés, 7 échecs** — et les **7 sont exactement** ceux que la copie isolée **non mutée** produit (essais qui interrogent `git ls-files` / `git ls-tree`, absents du miroir). **Différence avec le banc de référence : zéro.** |
| Coût réel du mutant, sur `lireTableur` compilé | 2 000 `<sheet` → 669 o → **10,9 ms** · 8 000 → 721 o → **176 ms** · 16 000 → 792 o → **573 ms** · 32 000 → **931 o → 2 625 ms** — soit **×3,6 à ×4,6 pour ×2 d'entrée** |

Autrement dit : **le quatrième motif est écrivable aujourd'hui, il coûte le même
prix que le troisième, et rien dans le dépôt ne le verrait passer.**

### 2.3 Les **quatre exemptions** : leurs conclusions tiennent, **une de leurs justifications est fausse**

Mesuré sur le code compilé du dépôt, sujets hostiles :

| Exemption | Ce que dit `FORMES_ADMISES` | Ce que j'ai mesuré | Verdict |
|---|---|---|---|
| `import/modele.ts:330` — `.replace(/[^a-z0-9]+/gu, '')` | « remplacement global sans suffixe qui échoue — 200 000 signes en 0,4 ms » | `normaliserEnTete` : 50 000 → **8,8 ms**, 200 000 → **28,4 ms**, 800 000 → **103,3 ms** — **linéaire** | ✅ **juste par la FORME** (un remplacement global ne rebrousse pas). Le chiffre cité (0,4 ms) est celui de l'expression seule, pas de la fonction ; sans conséquence |
| `pieces/multipart.ts:72` — `frontiereDe` | « **sujet borné à 8 Kio (`MAX_ENTETES_OCTETS`)** » | **la borne citée ne s'applique PAS à cette ligne** — voir ci-dessous. Coût : 8 190 o → 0,33 ms, 262 144 o → **1,03 ms** — linéaire | ⚠️ **conclusion juste, justification fausse** → **Q-217** |
| `pieces/multipart.ts:164` et `:166` — `parametreDe` | « sujet borné à 8 Kio et nom de paramètre **littéral** » | la borne **existe et mord** : un `content-disposition` de 8 000 o coûte **0,69 ms**, un de 64 000 o est **refusé avant** d'atteindre la ligne (0,10 ms). Les deux seuls sites d'appel passent `'name'` et `'filename'`, littéraux | ✅ **juste** |

**Pourquoi la borne de `frontiereDe` n'existe pas.** `analyserMultipart(corps,
String(requete.headers['content-type'] ?? ''))` appelle `frontiereDe(enteteContentType)`
**à sa première instruction** (`multipart.ts:91`). `MAX_ENTETES_OCTETS` est vérifiée
**plus loin, dans la boucle** (`:112`), et sur le **bloc d'en-têtes d'une partie du
corps** — un autre sujet. L'en-tête HTTP `content-type`, lui, n'est borné que
**dans d'autres fichiers** : `LimitRequestFieldSize 8190` du
`deploy/apache/durcissement-global.conf` derrière le frontal, et le `maxHeaderSize`
de Node sur le chemin direct `127.0.0.1:3001` — celui-là même que le dépôt défend
ailleurs (`serveur.ts:114`, Q-214 a).

### 2.4 Ailleurs que dans les expressions rationnelles — **quatre analyseurs relus, aucun défaut**

| Analyseur | Ce que j'ai vérifié | Résultat |
|---|---|---|
| **CSV** (`tableur.ts:229`) | l'automate borne **au fil de l'eau** (Q-198) : `construire` passe à faux à la borne, `champ` cesse d'être alimenté au-delà de `CARACTERES_MAX_CELLULE`, les colonnes sont coupées à `finirChamp` | **linéaire**, mémoire bornée à 5 002 lignes × 256 colonnes |
| **XLSX** (`elementsXml`, `attribut`, `indiceColonne`, `assemblerNumerotees`) | les recherches partent d'un curseur qui **n'avance jamais à reculons** ; `numeroLigne` refuse au-delà de 7 chiffres ; `assemblerNumerotees` travaille sur les numéros **distincts**, jamais sur un intervalle | **linéaire** |
| **filtre LDAP** (`auth/filtre-ldap.ts`) — *réserve des deux passages précédents* | `echapperValeur` + `substituerLogin` + `encoderFiltre` sur un login de 64 à **65 536** signes hostiles (`*()\ `) | **linéaire** : 64 → 1,1 ms ; 65 536 → **21,8 ms**. Le login est borné à **256** par `LONGUEUR_MAX_IDENTIFIANT` et le corps à **4 Kio** (`greffon.ts:125`). L'analyseur **récursif** de filtres n'est **pas atteignable** : une parenthèse du login sort en `\28` |
| **ClamAV** (`pieces/clamav.ts`) | `interpreter()` est **catastrophique** (§ Q-216), mais son sujet est la réponse d'un démon local de confiance et la fonction **n'a aucun autre appelant** dans `src/` ni dans `test/` | **pas de chemin d'attaque** ; le trou est celui du **garde-fou**, pas du produit |

### 2.5 Le frontend

Balayage des mêmes formes sur `cyber-gouvernance_V4/js/` (hors `js/lib/`) :
**une seule** occurrence, `services/backup.js:108` — `.replace(/[^A-Za-z0-9]+/g, "_")`,
remplacement global sur un nom de fichier. Même forme sûre que `modele.ts:330`.

---

## 3. Ce que j'ai joué

| | |
|---|---|
| Banc du dépôt | `cd backend && set -a && source ~/.grc-essais.env && set +a && npm test` → **1 719 essais, 1 719 passés, 0 échec** (442 suites, **165,4 s**) ; `npm run verifier-types` **sans sortie** |
| Contrôle **S15** | `npm audit --omit=dev` → **found 0 vulnerabilities**, code de sortie **0** |
| **S1 en direct** | `db/verifier_cloisonnement.sql` joué sous `grc_app` **sur la recette** → **107 contrôles · 107 réussis · 0 échoué**, code **0** |
| Mutations | **copie isolée** du dépôt (`mir/`, `rsync` sans `.git` ni `dist`), `tsc` privé, `node --test` sur la copie. Jamais sous `backend/test/`, jamais un commit. **quatre fichiers mutés en cinq mutations, tous restaurés et vérifiés identiques** |
| Sondes de coût | sur `lireTableur`, `interpreter`, `frontiereDe`, `analyserMultipart`, `normaliserEnTete`, `encoderFiltre` — tous **compilés depuis `src/`**, le code exact des routes |
| Route réelle | `POST /api/import/risques` à travers **Apache**, avec sonde de disponibilité concurrente sur `/api/sante` ; **10 imports hostiles simultanés** |
| Recette (lecture et écriture, nettoyée) | `/api/session`, `/api/donnees`, `/api/export`, `/api/consolidation`, `/api/filiales`, `/api/journal/verification`, `/api/entites/*`, `/api/import/*` — comptes AD réels `admin.grc`, `rssi.groupe`, `rssi.tls`, `direction` |
| Base | PostgreSQL 17.11 : catalogue de la recette `cyber_grc` (S1, S3, S16) ; bases neuves migrées par le vrai `db/migrate.mjs` pour toutes les mutations |
| Navigateur | **Chromium réel** (`/opt/pw-browsers`) → **Apache réel** (CSP du vhost) → **serveur réel** → PostgreSQL → **AD réel** ; connexion `rssi.groupe`, 12 modules, création par formulaire, `F5` |
| Annuaire | `grc-ad` réel : **compte jetable créé puis supprimé** (`s8ter.cible`) pour éprouver S11 sans verrouiller un compte de recette |
| TLS | chaîne validée **sans `-k`** et **avec `--capath /dev/null --cacert`** (le piège du `CLAUDE.md` §8) → `ssl_verify_result=0` ; TLS 1.0 et 1.1 → **`alert protocol version`** (sondés avec `-cipher 'ALL:@SECLEVEL=0'`, l'autre piège) |

**La recette a été laissée intacte** : `risques` **2 → 2**, `personnes` **6 → 6**,
`filiales` **2 → 2** (aucune filiale créée — proscrit, Q-155 : la création a été
éprouvée sur base jetable). Toutes les bases jetables ont disparu — il ne reste
que `cyber_grc`. **Un seul résidu, et il est assumé** : la ligne `utilisateurs`
du compte jetable `s8ter.cible` **ne peut pas être retirée**, parce que
`journal_audit.utilisateur_id` la référence et que le journal est en **ajout
seul**. C'est le comportement correct d'un registre d'audit, et je le note plutôt
que de le contourner.

---

## 4. Ce que j'ai éprouvé et qui **TIENT** — la grille S1 → S18

Un contrôle sans objet est marqué « sans objet » ; un contrôle non rejoué est
marqué « non rejoué », et cela **ne vaut pas « passé »**.

| # | Contrôle | Comment je l'ai mesuré | Verdict |
|---|---|---|---|
| **S1** | Cloisonnement | Recette : `pg_class` → **49 tables, 49 `relforcerowsecurity`, 49 `relrowsecurity`, 0 table à `filiale_id` sans force**, **196 politiques** ; `grc_app` **`rolsuper=f`, `rolbypassrls=f`**, **0 table possédée**. `verifier_cloisonnement.sql` → **107/107, code 0**. **Par la route** : `rssi.tls` (une filiale) ne voit qu'elle dans `/api/consolidation` **et** dans `/api/donnees` ; `rssi.groupe` en voit deux. ⚠️ Même le **propriétaire** ne peut pas lire une table cloisonnée sans déclarer `grc.filiales` — mesuré par accident, en `psql` | ✅ **tient** |
| **S2** | Le périmètre ne vient jamais du navigateur | `GET /api/donnees?filiale=<l'autre>` → **200 avec ses propres données** ; en-tête `x-filiale: <l'autre>` → **idem** ; `PUT /api/session/filiale-active` vers une filiale hors périmètre → **403 `hors_perimetre`**. Un `id` proposé à la création → **400** | ✅ **tient** |
| **S3** | Journal inaltérable et complet | **En direct sous `grc_proprietaire`** : `update`, `update … where false`, `delete`, `truncate` sur `journal_audit` → **tous refusés « en ajout seul »**. `f_journal_audit_verifier(null)` → **0 anomalie** sur 503 entrées. Complétude : `consultation_sensible` pour `/api/donnees` et `/api/consolidation`, `refus_autorisation` pour chaque 403, `connexion_echouee` ×7 pour le martèlement, `creation`/`filiales` **nommant la filiale** (Q-213) | ✅ **tient** |
| **S4** | Verrouillage optimiste | Par la route : deux `PUT` sur `version:1` → **200** puis **409 `conflit_version`** ; `version:999` → **409**. Le client ne gagne pas en surenchérissant, et `version` est **structurelle** (hors de `champs`) | ✅ **tient** |
| **S5** | Aucune injection SQL | Recensement de `src/**` : **3** interpolations dans un gabarit `query(...)`, toutes des noms de point de reprise passés par `ident()` — liste blanche **ancrée** `^[a-z_][a-z0-9_]{0,62}$`. Les autres interpolations visent des **noms d'objet** issus de types fermés (`SourceRepartition` : sept couples, `tsc` refuse le huitième), de listes littérales (`personnes`) ou d'`ident()`. **100 % des valeurs restent paramétrées** | ✅ **tient** |
| **S6** | Droits côté serveur | `direction` (Groupe, **lecture**, `export:false`) : `POST /api/entites/risques` → **403** ; `POST /api/filiales` → **403** ; `GET /api/journal/verification` → **403**. `rssi.tls` : `PUT /api/session/filiale-active` hors périmètre → **403** | ✅ **tient** |
| **S7** | Export distinct de la lecture | `direction` : `GET /api/export` → **403** « autorisation distincte » ; `GET /api/donnees` → **200** — **et tracé** `consultation_sensible` (Q-209). Le refus d'export est journalisé | ✅ **tient (lettre + trace)** ; la barrière sur `/api/donnees` reste **refusée par écrit**, au registre |
| **S8** | Secrets | `.env.example` : aucune affectation de secret non vide ; `/api/sante` n'en porte aucun ; aucune réponse d'erreur n'en porte | ✅ **tient** |
| **S9** | Chaîne des pièces jointes | Familles `test/pieces/**` **vertes** dans les 1 719 ; ClamAV `active`. **Non re-sondée en direct par moi** — la porte S5 l'a couverte contrôle par contrôle | ⚪ **passé (banc, rejoué)** |
| **S10** | Sortie et en-têtes | Via Apache : **HSTS** `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy`, **CSP stricte** (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`) ; cookie `grc_session` **HttpOnly ; SameSite=Strict ; Secure** ; `Cache-Control: no-store` sur la connexion. **Dans Chromium : 0 violation de CSP** sur 12 modules | ✅ **tient** |
| **S11** | Rythme et verrouillage | **En direct, contre l'AD réel, sur un compte jetable créé pour cela** : 6 mots de passe faux → 6 × **401** ; puis **le bon mot de passe → 401**. En base : `tentatives_echouees = 5`, `verrouille_jusqu_a = 10:34:21+00`. Au journal : **7 `connexion_echouee`**. Le message est **identique** dans les deux cas — aucun oracle « ce compte est verrouillé ». Compte supprimé de l'annuaire après mesure | ✅ **tient** |
| **S12** | Erreurs muettes | Corps invalide → `{"erreur":"donnee_invalide","message":"Le champ « code » doit être une chaîne de caractères.","reference":…}` — **aucune pile, aucun nom d'objet de base**. `?depuis=-1`, `?depuis=abc`, `?depuis=10^20` → **400** sans détail | ✅ **tient** |
| **S13** | Dénis de service applicatifs | Corps de **30 Mo** → **413 en 14 ms** ; `Transfer-Encoding: chunked` → **411** ; pool **borné à 10** ; `statement_timeout` **15 s** et `idle_in_transaction_session_timeout` posés **par connexion** (`db/pool.ts:256`) ; `connectionTimeout` 120 s / `requestTimeout` 90 s (Q-214 a) ; journal **paginé** (défaut 50, plafond 500) et export **borné à 50 000** ; reprise bornée (**64 Mio**, **2 000 000 nœuds**, profondeur **16**). **Import hostile × 10 en parallèle** → tous **≤ 196 ms**, `/api/sante` **≤ 68 ms**, 0 non-200. `f_journal_audit_verifier(null)` sur une chaîne de **50 000** entrées → **9 ms** | ✅ **tient** — le trou est dans le **garde-fou** (Q-216), pas dans le produit |
| **S14** | Intégrité des opérations composites | **Mordu** : journal en panne → `POST /api/filiales` **500**, `filiales` inchangée, **aucune** ligne partielle (Q-213). Familles `test/import/transaction.test.mjs` et `test/approbations/**` vertes | ✅ **tient** |
| **S15** | Dépendances | `npm audit --omit=dev` → **0 vulnérabilité**, code **0** | ✅ **tient** |
| **S16** | Garde-fous branchés | Recette : `f_verifier_schema()` → **0 anomalie**, **14 contrôles** au registre `controles_schema` (le README en annonce 9 — voir **Q-219**). Morsure du banc (`test/base/demonstration.test.mjs`) verte dans les 1 719 | ✅ **tient** |
| **S17** | Chemin complet réel | **Chromium réel → Apache réel (CSP du vhost) → serveur réel → PostgreSQL → AD réel** : démarrage 200, connexion `rssi.groupe` par le **formulaire** (`#login-identifiant`/`#login-motdepasse`/`#login-btn`), titre **« Cyber GRC — Dedienne Aerospace Toulouse »** (identité de filiale, L9), parcours de **12 modules** tous peints, **0 violation de CSP, 0 erreur de page**. La seule erreur console est le **401 attendu** du `GET /api/session` d'avant-connexion. ⚠️ **Réserve honnête** : Chromium n'utilise pas le magasin du système, j'ai donc dû lever la vérification du certificat **dans le navigateur** ; la chaîne TLS est vérifiée séparément par `curl` **sans `-k`** et avec `--capath /dev/null` | ✅ **tient** |
| **S18** | Le produit fait son travail | Par le **formulaire réel** : `#/risques` → « Déclarer un risque » → saisie → **« Créer le risque »** → **aucun bandeau « champs non enregistrés »** (Q-201/Q-207) → **`F5` complet** → **l'enregistrement est retrouvé**. Nettoyé ensuite par `DELETE /api/entites/risques/:id?version=…` → 200 | ✅ **tient** |

---

## 5. Les constats neufs

> Numérotés **à partir de Q-216** : le registre du `PLAN_EXECUTION` §7 porte
> **exactement 215 lignes** et s'arrête à **Q-215** ; `Q-216` et au-delà
> n'apparaissent **nulle part** dans le dépôt (vérifié par balayage sur `*.md`,
> `*.ts`, `*.mjs`, `*.sql`, `*.sh`).

---

### Q-216 — L'interdit qui a remplacé la vigilance **ne couvre pas la classe qu'il nomme** : il ignore `[\s\S]*?`, et son exonération d'ancre laisse passer **la ligne la plus coûteuse de `src/`**

**Classe : tout le reste (`V1.1`). Aucun chemin d'attaque vivant — c'est le
garde-fou qui est troué, pas le produit.**

Le correctif de Q-215 a fait la bonne analyse — *« ce qui est dangereux n'est pas
l'origine du motif, c'est sa forme »* — et l'a traduite en un détecteur qui, lui,
ne l'implémente qu'à moitié :

```js
if (ligne.includes('new RegExp')) return true;
return /\[\^[^\]]*\][*+]/u.test(ligne) && !/\/\^/u.test(ligne);
```

**a) Il ne connaît qu'une seule écriture de la classe négative.** `[\s\S]*?` et
`.*?` ne portent pas `[^`, et passent. Or **le fichier lui-même** désigne
`<nom …>([\s\S]*?)</nom>` comme *« la forme évidente … quadratique dès qu'une
balise n'est pas refermée, et c'est le constat Q-197 »* (`tableur.ts:512`).

*Reproduction* — j'ai remis cette forme exacte à la place du correctif :

```ts
const feuilleTrouvee = /<sheet\b([\s\S]*?)\/?>/u.exec(classeur);
```

| `<sheet` × k dans `workbook.xml` | archive `.xlsx` | temps de blocage |
|---|---|---|
| 2 000 | 669 o | 10,9 ms |
| 8 000 | 721 o | 176,3 ms |
| 16 000 | 792 o | 573,1 ms |
| 32 000 | **931 o** | **2 625,3 ms** |

— **×3,6 à ×4,6 pour ×2 d'entrée**, c'est-à-dire la même quadratique que Q-215,
au même endroit, pour la même taille de fichier. **Et le banc entier reste vert** :
1 719 essais, 1 712 passés, **7 échecs strictement identiques** à ceux que la copie
isolée **non mutée** produit (essais qui interrogent `git`, absents du miroir).

**b) L'exonération d'ancre est posée à la LIGNE, pas à l'expression.** Un `/^`
n'importe où sur la ligne disculpe toute la ligne. Conséquence mesurée : sur les
**neuf** occurrences de `[^x][*+]` que porte `src/`, le détecteur en accuse
**quatre** — celles qui sont dans `FORMES_ADMISES` — et **en exonère cinq en
silence** :

| Ligne exonérée | Mesure du pire cas (1 000 / 2 000 / 4 000 signes) |
|---|---|
| `config/index.ts:462` `/^https?:\/\/[^\s/]+/` | 0,1 / 0,0 / 0,0 ms |
| `config/index.ts:561` `/^ldaps?:\/\/[^\s/]+/` | 0,1 / 0,0 / 0,0 ms |
| `config/index.ts:732` `/^[^@\s]+@[^@\s]+$/` | 0,1 / 0,0 / 0,0 ms |
| `notifications/message.ts:89` `/^https?:\/\/[^\s/$.?#][^\s]*$/u` | 0,1 / 0,0 / 0,0 ms |
| **`pieces/clamav.ts:118`** `/^\s*[^:]*:\s*(.+?)\s+FOUND$/u` | **400 / 3 269 / 25 611 ms** |

Sur `interpreter()` compilé, avec un sujet `'a: ' + n espaces + 'x'` :
**1 604 o → 1 618 ms**, **3 204 o → 13 346 ms** — **×8 de temps pour ×2 d'entrée**.
Le `^` de cette expression ancre `\s*` ; il n'ancre **ni** l'ambiguïté entre `\s*`
et `[^:]*`, **ni** le `(.+?)\s+` qui suit. **La ligne la plus catastrophique de
tout `src/` est celle que le balayage ne regarde pas** — et elle est deux mille
fois plus chère que les quatre qu'il a mesurées et admises.

**Ce que le client ne perd PAS, et il faut le dire.** `interpreter()` n'a **aucun
appelant** hors de `clamav.ts`, et son sujet est la réponse du démon local
(`stream: <signature> FOUND\0`) : ni le nom du fichier déposé ni son contenu n'y
entrent. **Il n'y a pas de chemin d'attaque.** Ce qui est en cause est le
dispositif : après **trois** motifs trouvés par **trois** portes successives dans
**le même fichier**, le garde-fou censé arrêter le quatrième en laisserait passer
un identique, et n'a jamais vu le pire des existants.

**Pourquoi le banc ne le voit pas.** Parce que le banc *est* le détecteur : il n'y
a aucune mesure de coût pour la forme de Q-215 (`cout-analyseur.test.mjs`
n'engendre que des `workbook.xml` **bien formés** ; son fabricant `classeur()`
écrit toujours un `<sheet …/>` valide), et le recensement de `src/` s'arrête là où
son expression s'arrête.

**Correctif proposé** — deux gestes, pas un troisième interdit :
1. **mesurer**, pas seulement lire : un essai qui fabrique le `workbook.xml`
   hostile (`<sheet` × k, sans `>`) et vérifie le **rapport** de coût, comme
   `cout-analyseur.test.mjs` le fait déjà pour `<row>` et pour `r:id`. Une mesure
   ne se laisse pas contourner par une réécriture du motif ;
2. **porter l'exonération sur l'expression, pas sur la ligne**, et étendre la
   forme reconnue à `[\s\S]`, `[^]`, `.` sous `s`, aux quantificateurs `{n,}` et
   aux quantificateurs imbriqués. Puis **mesurer** `clamav.ts:118` et le corriger ou
   l'inscrire avec son chiffre — 13 346 ms n'est pas une exemption, c'est un aveu.

---

### Q-217 — Une des deux exemptions de `FORMES_ADMISES` **est fondée sur une borne qui ne s'applique pas à elle**

**Classe : tout le reste (`V1.1`). Conclusion juste, justification fausse.**

`FORMES_ADMISES['pieces/multipart.ts']` écrit : « **sujet borné à 8 Kio
(`MAX_ENTETES_OCTETS`)** et nom de paramètre littéral ». C'est vrai des lignes
**107 et 109** (`parametreDe`), dont le sujet est un en-tête **de partie** — la
borne est vérifiée avant, et **elle mord** : mesuré, un `content-disposition` de
64 000 o est refusé avant d'atteindre la ligne (0,10 ms), un de 8 000 o coûte
0,69 ms.

C'est **faux** de la ligne **72** (`frontiereDe`), qui reçoit
`String(requete.headers['content-type'])` — l'en-tête **HTTP** — à la **première
instruction** d'`analyserMultipart` (`multipart.ts:91`), c'est-à-dire **avant**
que `MAX_ENTETES_OCTETS` n'ait été consultée une seule fois. Cet en-tête n'est
borné que **dans d'autres fichiers** : `LimitRequestFieldSize 8190`
(`deploy/apache/durcissement-global.conf:44`) derrière le frontal, et le
`maxHeaderSize` de Node sur le chemin direct `127.0.0.1:3001` — chemin que le
dépôt défend explicitement ailleurs (`serveur.ts:114`, et c'est le motif même de
Q-214 a).

**Ce que le client ne perd pas** : rien. J'ai mesuré l'expression sur des sujets
hostiles (`;` + n espaces ; `;boundary=` répété ; guillemet jamais refermé), à
8 190, 16 384, 65 536 et **262 144** octets : **1,03 ms au pire**, croissance
**linéaire**. Elle est sûre — mais **pas pour la raison écrite**.

**Pourquoi c'est un constat et pas une coquille** : le passage précédent a posé
lui-même la règle — *« le discriminant n'est pas la forme du motif, c'est si le
sujet est borné, ce qu'aucune analyse statique ne peut décider ; une liste est
donc le bon outil, et quelqu'un doit mesurer avant d'y ajouter »*. Une exemption
qui **nomme la mauvaise borne** casse exactement ce contrat : le relecteur suivant
ira vérifier `MAX_ENTETES_OCTETS`, la trouvera bien posée, et conclura à tort.
C'est le motif « la sûreté vit dans un autre fichier » que Q-212 a déjà coûté.

**Correctif** : réécrire l'exemption de `:72` en nommant sa **vraie** borne — le
frontal et `maxHeaderSize` —, ou borner le `content-type` dans `frontiereDe`
elle-même, ce qui a l'avantage de ne dépendre d'aucun autre fichier.

---

### Q-218 — La propriété que Q-213 a ajoutée — **la trace est dans la transaction** — n'a **aucune morsure** au banc

**Classe : tout le reste (`V1.1`). C'est Q-210, réappliqué au correctif du
passage précédent.**

`test/filiales/creation.test.mjs:141` (« LA CRÉATION LAISSE UNE TRACE QUI NOMME LA
FILIALE ») vérifie qu'une entrée existe, qu'elle porte le bon `entite_id`, le
`code`, la `raison_sociale` et le `statut`. **Il ne vérifie pas** ce que le
correctif a réellement apporté : que **si le journal refuse, la filiale n'est pas
créée**. Un correctif qui écrirait la trace dans une transaction séparée — ou qui
avalerait son échec, comme le faisait `onResponse` — passerait cet essai.

**Mutation jouée** : j'ai enveloppé l'appel à `journaliser` de
`filiales/index.ts` dans un `try { … } catch { }`, sans rien changer d'autre. La
trace continue donc d'être écrite ; seule l'**atomicité** disparaît.

| Ce que j'ai joué sur le mutant | Résultat |
|---|---|
| `test/filiales/**` | **33 essais, 33 passés, 0 échec** |
| **`npm test` entier** | **1 719 essais, 1 712 passés, 7 échecs** — les **mêmes 7** que la copie isolée non mutée |

**Ce que le client risque** : rien aujourd'hui — le correctif est juste, je l'ai
mordu à l'endroit qui compte (§1, Q-213 : journal en panne → 500, `filiales`
inchangée). Mais la propriété la plus structurante du correctif — *une filiale ne
peut pas exister sans son entrée au registre qui fait preuve en audit ISO 27001* —
**se réintroduirait en silence** à la première réécriture. C'est mot pour mot ce
que le registre reproche à Q-195/Q-196 : *« fermé dans le code, pas dans le
banc »*.

**Correctif** : un essai qui **fait échouer** `journaliser` pour
`creation`/`filiales` (couture d'essai ou déclencheur temporaire) et asservit les
trois faits : **500**, `filiales` inchangée, `journal_audit` inchangé.

---

### Q-219 — Le §8 du `README` et le `CLAUDE.md` annoncent des chiffres **faux**, et le garde-fou qui les surveille est **vert par construction**

**Classe : tout le reste (`V1.1`) — mais c'est le point 6 du `PLAN_EXECUTION` §5,
que la porte est chargée de vérifier, et il est FAUX. C'est le motif du refus.**

Le §5 dit : *« Une livraison n'est acceptée que si **tous** ces points sont vrais.
C'est ce que vérifie la porte »*, et son point 6 : *« `backend/README.md` §8
reflète l'état réel »*, avec cette note — *« l'auditeur qui trouve un chiffre faux
le compte comme un **constat**, pas comme une coquille : un exploitant qui vérifie
une installation compare ce chiffre au réel, et faux, il ne mesure plus rien —
**pire, il rassure** »*.

**Rejoué, ce 05/09/2026, à la révision `df2ddb0` :**

| Ce que le document annonce | Où | Ce que j'ai mesuré | Écart |
|---|---|---|---|
| `npm test → tests 1030 · pass 1030 · fail 0` | `backend/README.md:863` | **1 719 · 1 719 · 0** | **+689** |
| 11 familles (`base api reprise navigateur deploiement depot documentation auth droits annuaire modules`) | `README.md:864-869` | **19** familles — s'y ajoutent `approbations`, `cycle`, `filiales`, `import`, `journal`, `journal-lecture`, `notifications`, `pieces` | **8 familles entières absentes** |
| « **48 tables** en **7 migrations** » | `README.md:874-875` | **49 tables**, **16 migrations** (`001` → `016`) | **+1 / +9** |
| « **192 politiques** » | `README.md:875` | **196** | **+4** |
| « **9 garde-fous** découverts, joués, consignés » / « 9 contrôles consignés dans `controles_schema` » | `README.md:871, 878` | **14** | **+5** |
| « Le banc rend **1 143 essais, 1 143 passés** » | `CLAUDE.md:47` | 1 719 | **+576** |
| « rend **1 705 essais, 1 705 passés** » | `CLAUDE.md:789` | 1 719 | **+14**, et **contredit la ligne 47 du même fichier** |
| « elles font partie des **1 143** essais du banc » | `CLAUDE.md:1000` | 1 719 | **+576** |

Restent **exacts**, et je les ai rejoués : `verifier_cloisonnement.sql` →
**107 · 107 · 0**, code 0 ; `f_verifier_schema()` → **0 ligne** ;
`npm audit --omit=dev` → **0 vulnérabilité**.

**Pourquoi le banc ne le voit pas — et c'est le plus instructif.**
`test/documentation/chiffres-du-banc.test.mjs` existe précisément pour cela, il
est **vert**, et il a **raison de l'être** : il juge le `README` contre **la
révision que le `README` nomme lui-même** (`d217fbb`, 04/09/2026), jamais contre
l'arbre. Son entête explique pourquoi — jugé contre l'arbre, il resterait rouge
toute la vague et *« un banc qui échoue quatre fois sur cinq apprend à être
ignoré »* (Q-64). L'arbitrage est bon **pendant** une vague. **Il cesse de l'être
à la porte** : le document est alors censé être remis à jour, et le §5 le dit —
*« la passe de documentation est une étape de la fermeture de porte, pas une
demande après coup … elle se joue **avec** le rejeu de la grille »*. Elle n'a pas
été jouée : la révision mesurée du `README` date d'avant les vagues 4 et 5
entières.

Le fichier avoue d'ailleurs sa propre limite : *« Il ne compte pas les essais en
les exécutant … le total annoncé n'est confronté qu'à lui-même »*, et cite le
constat **Q-87, resté ouvert**, dont il dit qu'il *« a laissé passer, jusqu'à la
porte S3, les cinq chiffres faux du constat Q-90 »*. **Le même mécanisme vient de
laisser passer huit chiffres faux jusqu'à la porte S8**, et les deux passages
précédents ne l'ont pas relevé.

**Ce que le client perd** : la seule chose que le §8 promet — un point de
comparaison. Un exploitant qui installe et compare trouvera **689 essais** de
plus, **huit familles** qu'aucun document ne nomme, **neuf migrations** de plus
que le schéma annoncé. Il en conclura, comme le `README` le prévoit lui-même à sa
ligne 894, qu'il *« cesse de se servir du document comme d'un contrôle »*.

**Correctif** : la passe de documentation du §5.6 — rejouer, réécrire le bloc de
mesure du §8 avec `df2ddb0` (ou la révision de clôture) comme point de mesure,
réconcilier le §5, le §8 et le `CHANGELOG`, et **retirer du `CLAUDE.md` les deux
chiffres qui ne sont scopés à aucune révision** : un chiffre sans point de mesure
est invérifiable, et deux chiffres contradictoires dans le même fichier sont pires
qu'aucun.

---

## 6. Ce que je n'ai pas pu éprouver

**La distinction compte** : sept passages de porte ont reconduit « Apache n'est
pas éprouvé » alors que l'installer prenait une minute. J'ai donc **commencé** par
les réserves écrites des deux passages précédents.

### 6.1 Réserves des passages S8 et S8 bis — **trois levées, une non tentée**

| Réserve, reconduite **deux fois** | Ce que j'ai fait | Résultat |
|---|---|---|
| **Le martèlement concurrent du pool** (« le coût unitaire est mesuré, pas la mise en concurrence ») | **10 imports hostiles simultanés** par la route réelle, sonde de disponibilité en parallèle | **levée** — 10 × 409 en **≤ 196 ms**, `/api/sante` **≤ 68 ms**, **0 réponse non-200**. Le pool de 10 n'est pas épuisé, l'analyse ayant lieu **avant** la transaction |
| **`src/auth/filtre-ldap.ts`** (« le coût du pire cas n'a pas été relu ») | relu **et mesuré** : `echapperValeur` + `substituerLogin` + `encoderFiltre` sur 64 → 65 536 signes hostiles | **levée** — **linéaire** (21,8 ms à 65 536, soit **256× la borne réelle** de 256 signes). L'analyseur récursif n'est pas atteignable : `(` du login sort en `\28` |
| **`GET /api/journal/verification`** (« sa borne de lecture n'a pas été vérifiée ») | appelée sur la recette ; paramètres hostiles ; **et la fonction mesurée sur une chaîne de 50 000 entrées**, base jetable | **levée** — 200 en **50 ms** sur 503 entrées ; `?depuis=-1`, `?depuis=abc`, `?depuis=10^20` → **400** ; `f_journal_audit_verifier(null)` → **6 ms à 5 000 entrées, 9 ms à 50 000** : le coût est négligeable et la réponse ne porte que les **anomalies**, donc reste petite. Un `statement_timeout` de 15 s borne le reste |
| **Q-214 b, c, d, f** | **non tenté** — points de durcissement `V1.1` déjà inscrits, avec propriétaire et échéance | inchangés au registre |

### 6.2 Impossible ici — et ce qu'il faudrait

| Ce qui n'est pas éprouvé | Pourquoi | Ce qu'il faudrait |
|---|---|---|
| **Q-216 par la route** | Le produit livré **n'est pas vulnérable** : la forme n'existe que dans mon mutant, et je ne déploie pas un mutant sur la recette. Le mécanisme est mesuré sur `lireTableur` compilé (le code exact de la route) | Rien à mesurer de plus ; l'essai de coût manquant est le correctif |
| **`clamav.ts:118` par un chemin d'attaque** | Il n'y en a pas : `interpreter()` n'a aucun autre appelant, et son sujet vient d'un démon local de confiance | Rien — sauf si un jour la réponse de clamd devient influençable ; c'est ce que l'inscription au registre doit garder à l'esprit |
| **La vérification du certificat *dans Chromium*** | Chromium n'emploie pas le magasin du système (NSS) ; installer la racine dans un profil NSS pour ce seul contrôle ne mesurait rien de plus | La chaîne est vérifiée par `curl` **sans `-k`** *et* avec `--capath /dev/null --cacert` → `ssl_verify_result=0`. TLS 1.0/1.1 refusés, sondés avec `-cipher 'ALL:@SECLEVEL=0'` |
| **La création d'une filiale sur la recette** | Proscrit (Q-155 : une filiale active de plus fait basculer `f_perimetre_groupe()` à faux) | Éprouvée deux fois sur **base jetable**, handler réel, migrations réelles — nominal **et** morsure |
| **L'AD de production du client** | Règle de prudence inchangée : le cas négatif verrouille des comptes réels | Rien — j'ai employé `grc-ad` et **créé mon propre compte jetable** pour éprouver S11, puis je l'ai supprimé |
| **L'envoi SMTP authentifié complet** | La recette n'a pas d'identifiants de relais ; en fabriquer n'aurait pas de sens | L'égression noyau et la bannière 220 ont été mesurées au passage précédent ; le dialogue AUTH reste à jouer chez le client |

### 6.3 Non tenté — dit franchement

* **Q-210 et Q-212 ne sont pas re-mordus par moi.** Le 2ᵉ passage les a mordus un
  par un et vus rougir ; j'ai porté mon effort sur Q-211 et Q-213, dont l'échec
  coûte plus cher, et sur la chasse au quatrième motif. **Verdict repris, pas
  rejoué** — c'est exactement le geste que ce chantier reproche, et je préfère le
  nommer plutôt que de le maquiller.
* **S9, la chaîne des pièces jointes**, n'est pas re-sondée en direct : couverte
  par la porte S5 contrôle par contrôle, et par la famille `test/pieces/**` verte
  dans les 1 719.
* **Le recensement S5 est un échantillon**, pas l'exhaustif du 1ᵉʳ passage : j'ai
  balayé `src/**` pour les interpolations dans un gabarit `query(...)` (3, toutes
  par `ident()`) et remonté quatre autres sites jusqu'à leur origine littérale.
* **Le frontend n'a pas été re-audité pour l'injection** : Q-211 ferme le canal
  **à la source**, ce que j'ai mordu ; les 48 sites d'attribut restent non
  échappés, par décision écrite au registre.

---

## 7. Ce que cette porte enseigne

1. **Un interdit doit être MESURÉ, pas seulement écrit — même quand il est
   mécanique.** Le passage précédent a remplacé un commentaire par un contrôle,
   ce qui était le bon geste ; mais le contrôle n'a jamais été confronté à une
   forme qu'il ne connaissait pas. Il « mord » sur les trois formes des portes
   précédentes — parce que ce sont celles avec lesquelles il a été écrit. La
   parade n'est pas un quatrième interdit : c'est **une mesure de coût par
   recherche de l'analyseur**, qu'aucune réécriture du motif ne contourne.
2. **Un détecteur qui exonère à la LIGNE ne mesure pas ce qu'il croit.**
   `!/\/\^/u.test(ligne)` a paru une bonne idée — « une expression ancrée ne
   rebrousse pas » — et elle est fausse dès qu'une ligne porte deux expressions,
   ou une expression dont le `^` n'ancre pas la partie dangereuse. Elle exonère
   la ligne **la plus coûteuse de tout `src/`**, deux mille fois plus chère que
   les quatre qu'elle a mesurées.
3. **Le troisième passage a trouvé, dans le correctif du deuxième, le même geste
   que le deuxième reprochait au premier.** Q-213 a fermé « dans le code, pas dans
   le banc » exactement comme Q-195/Q-196 (Q-210) — par un correctif écrit dans le
   commit qui condamnait cette pratique. **Une leçon qu'on écrit n'est pas une
   leçon qu'on applique** ; seule la mutation le dit.
4. **Le point 6 de la définition de « terminé » n'avait jamais été rejoué.** Deux
   passages ont mesuré dix-huit contrôles de sécurité et laissé, à côté, un §8 qui
   annonce **1 030 essais pour 1 719** et **7 migrations pour 16**. Le garde-fou
   des chiffres est vert **par construction**, et son propre entête dit qu'il
   n'attrape pas ce cas (Q-87, ouvert). *La grille ne se lit pas seule : le §5 en
   fait partie.*
5. **Et la bonne nouvelle, qui mérite d'être dite aussi nettement que les
   constats** : après trois passages, **le produit ne figure plus parmi les
   causes de refus**. Cloisonnement mordu, journal inaltérable jusque sous le
   propriétaire, verrouillage optimiste, verrouillage de connexion mesuré contre
   un AD réel, création par le formulaire réel qui survit à un `F5`, dix imports
   hostiles simultanés absorbés en deux dixièmes de seconde. **Ce qui reste à
   fermer est du dispositif, et cela se ferme en une journée.**

---

> **Constats neufs : Q-216, Q-217, Q-218, Q-219**, tous de la classe « tout le
> reste ». Chacun doit recevoir au registre du `PLAN_EXECUTION` §7 un
> **propriétaire nommé et une échéance** — *un constat chiffré et non attribué est
> un constat perdu.* **Q-219 conditionne la clôture de cette porte** (§5, point 6)
> et se ferme par la passe de documentation, pas par du code. **Zéro constat des
> deux classes dures : la vague n'est arrêtée par rien.**
