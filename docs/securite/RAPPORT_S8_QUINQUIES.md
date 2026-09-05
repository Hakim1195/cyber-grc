# Rapport de la porte S8 — **cinquième passage** — condition de mise en service

> **Révision auditée** : `ad0012c` (« Le relevé du §8 pointe sur a619d7f — 1742 essais,
> dix-neuf familles »), branche `claude/vague-3-planning-review-6zgbch`.
> **Auditeur** : SECU (5ᵉ passage) — n'a écrit aucune des lignes examinées, et n'écrit
> que ce fichier. **Aucun fichier du produit n'a été modifié dans le dépôt** : les six
> mutations de code ont vécu dans une copie isolée du scratchpad (`rsync` sans `.git`
> ni `dist`), restaurées et vérifiées identiques — `diff -rq` sur `backend/src`,
> `backend/test`, `backend/README.md` et `cyber-gouvernance_V4` : identiques.
> Aucun commit, aucun `git add`, aucun `git checkout`, aucun `git stash`.
> `git status --porcelain` **vide** en fin d'audit.
> **Date** : 05/09/2026. **Machine** : `SRV-Infra`, VM Debian 13 réelle, PostgreSQL
> 17.11, Apache 2.4.68 en service, Chromium/Playwright réels, contrôleur de domaine
> Samba `grc-ad` réel, ClamAV actif. La recette sert `https://grc.exemple.interne/` à
> la révision auditée — **81 fichiers servis identiques au dépôt**
> (`install.sh --verifier-publication`, code 0).

---

## 1. Verdict global

> ### ❌ **Porte S8 refusée — pour la cinquième fois, et pour la troisième fois d'affilée sur le DISPOSITIF.**
>
> **Les deux classes dures sont vides.** Aucun constat « bloque le fonctionnement »,
> aucun constat « fuite ou perte de données ». Les dix-huit contrôles de la grille
> tiennent, mesurés sur l'infrastructure réelle : cloisonnement **107/107** et par la
> route (`rssi.tls` voit **1** filiale dans `/api/consolidation`, `rssi.groupe` en voit
> **2**), journal en ajout seul refusé **jusqu'au compte propriétaire** (4 opérations sur
> 4) et chaîne à **0 anomalie sur 631 entrées**, verrouillage optimiste par la route,
> verrouillage de connexion mesuré **contre l'AD réel avec un témoin discriminant**,
> chaîne des pièces jointes **mordue par un vrai EICAR et un vrai `vbaProject.bin`**,
> import transactionnel **mordu par la route** (250 lignes, une fautive → 409, base
> inchangée) avec son contrôle symétrique, et **31 modules sur 31** peints dans Chromium
> sous la CSP livrée, **0 violation, 0 erreur de page**, création par formulaire
> survivant à un `F5`.
>
> **Quatre motifs de refus, et les deux premiers sont les points 3 et 6 du
> `PLAN_EXECUTION` §5, que la porte est explicitement chargée de vérifier :**
>
> **1. Le banc N'EST PAS VERT — il est intermittent** (constat **Q-227**). Mon premier
> `npm test` a rendu **1 742 essais, 1 741 passés, 1 ÉCHEC, code 1** ; le second, **1
> 742/1 742, code 0**. Le fichier fautif est `test/depot/cout-expressions.test.mjs`,
> c'est-à-dire **le garde-fou même que le constat Q-225 venait de réparer** par « le
> meilleur de trois passes ». Joué seul vingt fois : **1 échec sur 20**. Le §8 du
> `README` annonce `tests 1742 · pass 1742 · fail 0` — vrai une fois sur deux.
>
> **2. Le point 6 du §5 est de nouveau faux** (constat **Q-228**), pour la **quatrième
> porte consécutive**, et cette fois **dans la section même qui déclare avoir été
> rejouée**. Le bloc `#### Lot L1 — rejoué sur base neuve` du `README` §8 porte **neuf
> nombres faux** — 48 tables, 7 migrations, 192 politiques, 71 clés étrangères, 43
> `restrict` / une seule `set null`, 43 tables `cree_par` / 43 déclencheurs, 31
> `f_init_tracabilite`, 9 garde-fous — là où la base neuve migrée en porte **49, 16,
> 196, 73, 44/27/2, 44/44, 32, 14**. Le contrôle neuf de Q-222 est vert parce qu'il
> emploie `motif.exec()` : **il ne lit que la PREMIÈRE occurrence** de chaque phrase.
>
> **3. Le garde-fou de coût des expressions a QUATRE trous, tous mesurés** (constat
> **Q-226**), et deux d'entre eux ferment **les deux moitiés** du dispositif. Le plus
> net : `RegExp(...)` **sans le mot-clé `new`** — strictement équivalent en JavaScript —
> échappe aux deux interdits, qui cherchent la chaîne littérale `new RegExp`. La forme
> exacte de Q-208 b, réécrite ainsi, coûte **8 394 ms pour un en-tête de 30 signes** et
> le garde rend **quatre essais, quatre passés**. C'est la **cinquième** fois que cette
> famille passe sous le garde-fou censé l'arrêter.
>
> **4. Et pour la première fois depuis le 3ᵉ passage, un défaut du PRODUIT** (constat
> **Q-230**) : **une pièce jointe survit à l'enregistrement qu'elle documente.**
> Mesuré par la route : risque créé, PDF déposé, `DELETE` du risque → **200** ; la ligne
> `pieces_jointes` reste, le fichier reste sur le disque, et `GET` sur la pièce rend
> encore **200 avec son contenu**. Rien ne la purge, rien ne la liste, et le quota de la
> filiale continue de la compter.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **aucun** | 18 contrôles tenus, mesurés sur la chaîne réelle |
| **Fuite ou perte de données** | **aucun** | cloisonnement 107/107 et par la route, journal, persistance et import mordus ; **Q-230 en est le plus proche et ne l'est pas** : la RLS borne toujours l'orphelin à sa filiale |
| **Tout le reste** (`V1.1`) | **Q-226, Q-227, Q-228, Q-229, Q-230, Q-231** | inscrits au registre ; **Q-227 invalide le §5.3 et Q-228 le §5.6**, que la porte est chargée de vérifier |

**Ce que ce verdict dit du produit, et il faut le dire aussi nettement que le refus.**
*Rien dans le produit ne s'oppose à la mise en service pilote.* Aucune expression de
`src/` ne rebrousse, aucune injection n'atteint le DOM sous la CSP réelle — j'ai
ré-audité le frontend, ce que le 4ᵉ passage avait laissé en réserve : **31 écrans et 4
fiches de détail** peuplés de noms hostiles, **0 élément injecté, 0 violation de CSP**.
Le pool encaisse **dix imports hostiles simultanés en ≤ 75 ms** avec `/api/sante` à
**≤ 35 ms** — l'autre réserve du 4ᵉ passage, levée. Ce qui échoue, ce sont **quatre
garde-fous** et **une pièce jointe qui ne s'en va pas**.

---

## 2. Les correctifs éprouvés — **tient / ne tient pas / non éprouvé**, avec la mutation jouée

C'est la section qui compte. Les cinq garde-fous refaits depuis le 4ᵉ passage ont été
attaqués un par un ; je n'ai repris aucun verdict sans le rejouer.

| # | Correctif | Verdict | Mutation jouée, et ce qui a rougi |
|---|---|---|---|
| **Q-220 (a) — le préfixe se DÉRIVE du motif** | ✅ **TIENT sur les deux mutations exactes du 4ᵉ passage**, ❌ **NE TIENT PAS sur la classe** → **Q-226 (b)** | Les familles fabriquent bien `morceau + espaces + x` et `morceau + 'a'×n`, plus le préfixe à **un seul signe**. Mais **aucune ne combine préfixe + remplissage + QUEUE ÉTRANGÈRE**. Mutation **M-C** dans `src/pieces/clamav.ts` : `/^stream:([a-z]+)+$/u` — coût réel **`stream:`+18 a+`!` → 4,3 ms · 22 → 85 ms · 26 → 612 ms · 30 → 9 560 ms** ; le garde rend **5 essais, 5 passés**, rapport **×1,0**. Le témoin sans préfixe (`(a+)+$`) est vu à **×66,1** : c'est le préfixe, et lui seul, qui aveugle |
| **Q-220 (b) — le contenu des chaînes est neutralisé** | ❌ **NE TIENT PAS** → **Q-226 (c) et (d)** | `sansChaines()` ne traite que `'` et `"` — **les gabarits sont laissés tels quels, par choix écrit dans le fichier**. Mutation **M-D** : un **seul `/`** dans un gabarit, sur la même ligne (`` const chemin = `${base}/lignes`; const motif = /^ligne:\s*(.+?)\s+fin$/u; ``) → **5/5 vert**, alors que le motif coûte **12 574 ms pour 3 207 o**. **Contrôle symétrique** : le gabarit remplacé par une concaténation, **motif identique** → **ROUGE**, `import/moteur.ts:278 … ×Infinity … ^ligne:\s*(.+?)\s+fin$`. Mutation **M-E** : `return '/*';` dans une chaîne — `sansCommentaires()` retire les commentaires de bloc **avant** de neutraliser les chaînes, donc tout jusqu'au `*/` suivant disparaît → **5/5 vert** sur le même motif à 12 574 ms |
| **Q-220 (c) — l'interdit `new RegExp` rendu à tout `src/`** | ❌ **NE TIENT PAS** → **Q-226 (a)** | La portée est bien revenue à tout `src/`, avec son exemption mesurée. Mais l'interdit cherche `ligne.includes('new RegExp')` — une **orthographe**. Mutation **M-A** dans `src/import/moteur.ts` : `return RegExp(\`^(${recherche}+)+$\`, 'u').test(enTete);` — **la forme exacte de Q-208 b, sans `new`** → `cout-expressions` **5/5**, `cout-analyseur` **7/7**, banc muet. Coût réel : en-tête de **18 signes → 17,7 ms · 22 → 44,7 · 26 → 502,9 · 30 → 8 394,2 ms**. Les **deux** fichiers qui portent l'interdit (`cout-expressions.test.mjs:423,439` et `cout-analyseur.test.mjs:243,257`) cherchent la même chaîne |
| **Q-225 — « le meilleur de trois passes »** | ❌ **NE TIENT PAS** → **Q-227** | Aucune mutation nécessaire : **le banc du dépôt a rougi de lui-même**. `npm test` #1 → **1 741/1 742, 1 échec, code 1** (`LE CONTRÔLE MORD` : *Q-197 — l'alternative appariée : croissance ×4,4 pour ×3 d'entrée, sous le rapport de ×5*). `npm test` #2 → **1 742/1 742, code 0**. Le fichier seul, **20 passages : 1 échec** (`Q-215 — la classe négative littérale : croissance ×1,0`). Mesuré au repos, trois relevés du même calcul : Q-197 → **×4,66 / ×9,03 / ×7,69** pour un seuil de **5** ; Q-215 → `grand` = **1,04 à 1,28 ms** pour un `PLANCHER_MS` de **1** |
| **Q-221 — le garde des sœurs i18n EXÉCUTE** | ✅ **TIENT** pour ce qu'il mesure, ❌ **l'exemption ne tient pas** → **Q-229** | Le garde charge bien le module et fait passer un témoin dans chaque fonction exportée : la sœur à deux lignes du 4ᵉ passage serait vue, et il a trouvé `dateLongue`/`dateHeure`. **Mais `t` et `tHtml` sont exemptés sur une prémisse fausse.** Mesuré en exécutant le module du dépôt : `I18n.t('commun.confirmerSuppressionMultiple', {n: '<img src=x onerror=alert(1)>'})` rend **`Confirmer la suppression de <img src=x onerror=alert(1)> élément(s) ?`** — la balise **survit**. Le seul garde de ce second argument, `interpolationsNonEchappees`, est ancré sur `/\$\{\s*t\(/g` : trois écritures du même défaut passent (détail au §5) |
| **Q-222 — six nombres du `README` confrontés au catalogue** | ⚠️ **PARTIEL** → **Q-228** | Le contrôle est juste et il mord : j'ai **échangé** 196 et 192 entre les deux blocs du `README` → **rouge**, `politiques : le README dit 192, le catalogue en porte 196` ; remis 196 aux deux → **vert**. Mais il emploie `motif.exec()` : **il ne voit que la première occurrence**, et le second bloc du même document porte neuf nombres faux. Le nombre de **déclencheurs de création** — l'un des **deux** chiffres de Q-222 — **n'est gardé nulle part** |
| **Q-223 — `--desinstaller`** | ⚠️ **PARTIEL** → **Q-231** | ✅ **Ce qui tient, mesuré en extrayant le bloc par ses ancres** : deux passages de suite → **code 0** les deux fois ; sur une machine où rien n'est installé → **code 0** ; l'ordre arrêt-avant-retrait ; la conservation des clichés ; le refus d'un export vide ; le non-rechargement d'un Apache en défaut. ❌ **Ce qui ne tient pas** : `install.sh:531-533` pose et **active** `/etc/apache2/conf-available/cyber-grc-durcissement.conf` — durcissement de **portée SERVEUR** — et `desinstaller()` ne le mentionne **jamais** (0 occurrence, comme le fichier d'essai). Et l'étape 6 supprime `$CONFIG` **avant** que l'étape 7 n'y lise `LDAP_PREFIXE_GROUPES` : mesuré avec le **vrai** `lire_variable`, mode par défaut → « les groupes **ACME-*** » ; `--avec-les-donnees` → « les groupes **GRC-*** » |
| **Q-224 — le cliché avant migration** | ✅ **TIENT** | Les quatre branches sont jouées par le banc et je les ai relues sur le vrai script : le cliché n'est pris qu'au **code 10** de `migrate.mjs --verifier` ; un échec **arrête** l'installation ; la rétention garde cinq clichés. ⚠️ **Le piège du tuyau n'existe pas** : `install.sh:59` porte `set -Eeuo pipefail`, donc l'échec de `pg_dump` traverse bien le `| gzip`. Le harnais du banc pose `set -uo pipefail` — il **coïncide** avec le réel, il ne le maquille pas. Réserve honnête au §6 : le banc ne joue jamais un **troisième** code de sortie (2, 3, 4, 5), qui fait sauter le cliché en silence — sans conséquence aujourd'hui, la migration qui suit partageant le même environnement et échouant de même |
| **Q-210 / Q-211 / Q-212 / Q-213 / Q-215 / Q-216 / Q-217 / Q-218 / Q-219** | ✅ **présents, verts au banc** | **Non re-mordus par moi**, et je le dis plutôt que de le laisser croire : le 4ᵉ passage les a mordus un par un, aucun de mes constats ne les touche, et j'ai porté mon effort sur ce qui a été écrit **depuis**. Les essais correspondants sont dans les 1 742 |
| **Q-214 a, e** | ✅ **présents** | `serveur.ts` → `connectionTimeout: 120 000`, `requestTimeout: 90 000` ; `auth/index.ts` → `Map` bornée avec éviction |
| **Q-214 b, d** | ⏱ **TOUJOURS OUVERTS, relus** | **b** : `promouvoir()` est appelée ligne **601**, la transaction d'insertion ouvre ligne **603** ; le rattrapage `retirerDuMagasin(...).catch(…)` couvre l'échec de la transaction, **pas la mort du processus entre les deux**, et rien ne réconcilie disque↔base. **d** : `src/pieces/depot.ts`, `src/approbations/index.ts` et `src/cycle/index.ts` ne portent **toujours aucun** `limit` (0, 0, 0) |

**Bilan** : **huit correctifs attaqués par mutation ou par mesure** ; **deux tiennent**
(Q-224, et Q-223 pour sa moitié éprouvée), **quatre ne tiennent pas** (Q-220 a/b/c,
Q-225), **deux tiennent à moitié** (Q-221, Q-222). Neuf correctifs plus anciens sont
présents et verts, **non re-mordus** — dit franchement.

---

## 3. Ce que j'ai joué

| | |
|---|---|
| Banc du dépôt | `cd backend && set -a && source ~/.grc-essais.env && set +a && npm test`, **deux fois**. #1 : **1 742 essais, 1 741 passés, 1 ÉCHEC**, 448 suites, **167,8 s**, **code 1**. #2 : **1 742 / 1 742 / 0**, **168,5 s**, **code 0**. `npm run verifier-types` **sans sortie**, code 0 |
| Le fichier fautif, isolé | `node --test test/depot/cout-expressions.test.mjs` × **20** → **19 verts, 1 rouge** ; plus trois relevés indépendants du même calcul (§2) |
| Contrôle **S15** | `npm audit --omit=dev` → **found 0 vulnerabilities**, code **0** |
| **S1 en direct** | `db/verifier_cloisonnement.sql` sous `grc_app` **sur la recette** → **107 contrôles · 107 réussis · 0 échoué**, code 0. Catalogue : **49 tables, 49 `relrowsecurity`, 49 `relforcerowsecurity`, 196 politiques** ; `grc_app` **`rolsuper=f`, `rolbypassrls=f`, 0 table possédée** |
| Schéma | Relevé **dans `pg_catalog`** sur une **base neuve** créée pour l'occasion et migrée par le vrai `db/migrate.mjs` : 49 · 16 · 196 · 73 (44 `restrict`, 27 `cascade`, 2 `set null`) · 44 `cree_par` · **44 déclencheurs `trg_*_creation`** (`f_init_tracabilite` **32**, `f_init_creation` 10, `f_init_horodatage` 2) · 11 composites · 9 unicités · 14 contrôles · **0 sans RLS** · `f_verifier_schema()` → **0 anomalie** |
| Mutations de code | **copie isolée** du dépôt, `node --test` sur la copie. **Cinq fichiers mutés en six mutations** (M-A → M-E, plus l'échange de nombres du `README`), **tous restaurés et vérifiés identiques** |
| Sondes de coût | sur les formes de M-A, M-C, M-D, M-E et sur les quatre témoins du garde — chronométrées avec **le calcul exact du garde**, réimplémenté à l'identique |
| Route réelle | `/api/connexion`, `/api/session`, `/api/session/filiale-active`, `/api/donnees`, `/api/export`, `/api/consolidation`, `/api/filiales`, `/api/journal*`, `/api/entites/{risques,clients,personnes,actions}` (POST/PUT/DELETE), `/api/pieces/risques/:id[/:pj]` (POST/GET/DELETE), `/api/import/risques`, `/api/import/modeles`, `/api/sante` — **à travers Apache**, sous **quatre comptes AD réels** |
| Annuaire | `grc-ad` réel : **deux comptes jetables créés puis supprimés** (`s8q5.cible` pour le martèlement, **`s8q5.temoin`** comme témoin) |
| Navigateur | **Chromium réel** (`/opt/pw-browsers`) → **Apache réel** (CSP du vhost) → serveur réel → PostgreSQL → **AD réel** ; connexion par le formulaire, **31 modules**, création + `F5`, puis un second passage **dédié à l'injection** |
| TLS | chaîne validée **sans `-k`**, avec **`--capath /dev/null --cacert`** (le piège du `CLAUDE.md` §8) → `ssl_verify_result=0`, code 200 ; TLS 1.0 et 1.1 → **`alert protocol version`**, sondés avec `-cipher 'ALL:@SECLEVEL=0'` (l'autre piège) ; TLS 1.2 accepté |
| Bloc `desinstaller` | extrait **par ses ancres** du vrai `install.sh`, joué dans un bac à sable avec `rm` **réel** et `lire_variable` **réel** — c'est ce que le banc ne fait pas |
| Publication | `install.sh --verifier-publication` → **81 fichiers servis identiques au dépôt**, code 0 |

**La recette a été rendue dans l'état où je l'ai trouvée** : `risques` **2 → 2**,
`personnes` **6 → 6**, `clients` **0 → 0**, `filiales` **2 → 2** (aucune filiale créée
— proscrit, Q-155). Tout ce que j'ai créé a été retiré par la route : quatre
enregistrements hostiles, deux enregistrements de sonde, les trois lignes de l'import
symétrique, la pièce jointe légitime, la pièce jointe orpheline de Q-230, la fiche
d'annuaire du compte témoin, et les deux comptes AD jetables. **Trois résidus, tous
assumés et déclarés** : *(1)* la ligne `utilisateurs` de `s8q5.temoin` — irretirable,
`journal_audit` la référence et le journal est en ajout seul ; c'est le comportement
correct d'un registre d'audit ; *(2)* les entrées de journal et les trois lignes
`imports` de mes sondes (21 → 24), par construction ; *(3)* la ligne de quarantaine de
mon EICAR (`pieces_jointes` 0 → 1, `etat_analyse = infectee`), que la route ne sait pas
retirer une fois son porteur supprimé — **et c'est très exactement le constat Q-230**.

---

## 4. Ce qui TIENT — la grille S1 → S18, rejouée intégralement

Un contrôle sans objet est marqué « sans objet » ; un contrôle non rejoué est marqué
« non rejoué », et cela **ne vaut pas « passé »**.

| # | Contrôle | Comment je l'ai mesuré | Verdict |
|---|---|---|---|
| **S1** | Cloisonnement | Recette : `verifier_cloisonnement.sql` → **107 / 107 / 0**, code 0. Catalogue : **49 tables, RLS activée ET forcée 49/49, 196 politiques**, `grc_app` sans `bypassrls`, **0 table possédée**. **Par la route** : `GET /api/consolidation` rend **1 filiale (TLS)** à `rssi.tls` et **2 (DEU, TLS)** à `rssi.groupe` | ✅ **tient** |
| **S2** | Le périmètre ne vient jamais du navigateur | `GET /api/donnees`, `?filiale=<l'autre>` et l'en-tête `x-filiale: <l'autre>` rendent **200 avec un contenu STRICTEMENT identique** (comparaison JSON, hors horodatage) — 4 690 octets dans les trois cas. `/api/consolidation?filiale=<DEU>` sous `rssi.tls` rend toujours **TLS seule**. `PUT /api/session/filiale-active` vers une filiale hors périmètre → **403 `hors_perimetre`** ; vers une filiale **inventée** → **403 au message identique**, aucun oracle d'existence. Un `id` proposé à la création → **400** ; un champ `version` dans `champs` → **400** | ✅ **tient** |
| **S3** | Journal inaltérable et complet | **Sous `grc_proprietaire`** : `update`, `update … where false`, `delete`, `truncate` sur `journal_audit` → **les quatre refusés**, `Table journal_audit en ajout seul`. `f_journal_audit_verifier(null)` → **0 anomalie** sur **631 entrées**. Complétude, fenêtre de mes sondes : `consultation_sensible ×9`, `connexion_reussie ×8`, `connexion_echouee ×7`, `refus_autorisation ×6` (un par 403), `suppression ×5`, `modification ×3`, `creation ×2`, `analyse_antivirus ×2`, `import ×1`, `export ×1` | ✅ **tient** |
| **S4** | Verrouillage optimiste | Par la route : `PUT version:1` → **200**, second `PUT version:1` → **409 `conflit_version` / `GRC03`**, `version:999` → **409**. Le client ne gagne pas en surenchérissant ; `version` placée dans `champs` rend **400** | ✅ **tient** |
| **S5** | Aucune injection SQL | Recensement de `src/**` : **72** interpolations dans un gabarit SQL. Toutes viennent d'`ident()` (liste blanche **ancrée** `^[a-z_][a-z0-9_]{0,62}$`, qui **lève** hors liste), de `guillemeter()` (doublement des guillemets, alimenté par `pg_catalog`), d'un fragment **littéral du fichier** (`empreinte`, `LISTE_COLONNES`) ou d'une liste bâtie depuis le registre / le catalogue. Les occurrences de `personneId` sont dans des **messages de journal**, pas dans du SQL | ✅ **tient** |
| **S6** | Droits côté serveur | Compte `direction` (Groupe, **lecture**, `export:false`) : `POST /api/entites/risques` → **403 `droit_insuffisant`** ; `POST /api/filiales` → **403** ; `GET /api/journal/verification` → **403**. `rssi.tls` : `PUT /api/session/filiale-active` hors périmètre → **403**. Chaque refus est journalisé | ✅ **tient** |
| **S7** | Export distinct de la lecture | `direction` : `GET /api/export` → **403** (« L'export des données est une autorisation distincte de la consultation »), `GET /api/donnees` → **200** et tracé `consultation_sensible`. `rssi.groupe` (`export:true`) : `GET /api/export` → **200, 4 387 octets**, tracé `export` | ✅ **tient (lettre + trace)** ; la barrière sur `/api/donnees` reste **refusée par écrit** (Q-209) |
| **S8** | Secrets | `.env.example` : **0** affectation de secret non vide (les seules valeurs sont ports, hôtes, bornes) ; `/api/sante` n'en porte aucun (statut, application, version, environnement, heure, durée, latence base) ; aucune réponse d'erreur n'en porte ; aucun secret en clair dans les sources suivies | ✅ **tient** |
| **S9** | Chaîne des pièces jointes | **Par la route, à travers Apache.** `.exe` → **400** « Formats admis : … » ; **EICAR nommé `.pdf`** → **400** « le contenu ne correspond pas à son extension » (la signature mord **avant** l'antivirus) ; **ELF nommé `.pdf`** → **400** idem ; **EICAR nommé `.txt`** → **400** « L'analyse antivirale a détecté une menace … mis en quarantaine » — **ClamAV réel** ; **`.docx` contenant `vbaProject.bin`** → **400** « les documents contenant des macros ne sont pas acceptés » ; PDF légitime → **201**, délivré en `content-disposition: attachment`, `nosniff`, `no-store`, `content-type: application/pdf` ; `DELETE` → **204**. ⚠️ **Le huitième contrôle — la rétention — a un trou** : voir **Q-230** | ✅ **tient sur ses sept premiers contrôles** |
| **S10** | Sortie et en-têtes | Via Apache : **HSTS** `max-age=31536000; includeSubDomains`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, COOP/CORP, `Permissions-Policy`, **CSP stricte** (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`) ; cookie `grc_session` **HttpOnly ; SameSite=Strict ; Secure** ; `Cache-Control: no-store` sur la connexion. **Dans Chromium : 0 violation de CSP sur 31 modules, deux fois.** TLS : chaîne validée **sans `-k`** avec `--capath /dev/null` → `ssl_verify_result=0` ; TLS 1.0/1.1 → `alert protocol version` ; TLS 1.2 accepté | ✅ **tient** |
| **S11** | Rythme et verrouillage | **Contre l'AD réel, sur un compte jetable créé pour cela** : 6 mots de passe faux → 6 × **401** ; puis **le bon mot de passe → 401**. **Et un TÉMOIN**, créé au même instant, dans le même groupe, depuis la même adresse : **200 du premier coup**. La mesure discrimine donc le martèlement et non une configuration. Message **identique** dans les deux cas — aucun oracle « ce compte est verrouillé ». **7 `connexion_echouee`** au journal. Les deux comptes ont été supprimés de l'annuaire | ✅ **tient** |
| **S12** | Erreurs muettes | Corps invalide → `donnee_invalide` « Le champ « nom » attend du texte. » ; JSON malformé → `donnee_invalide` « format ou type de contenu invalide » ; ressource inconnue → **404 `ressource_inconnue`**. **Aucune pile, aucun nom d'objet de base, aucun `detail`/`constraint` PostgreSQL** ; chaque réponse porte une `reference` opaque | ✅ **tient** |
| **S13** | Dénis de service applicatifs | Borne de corps mesurée **à l'octet** : **27 262 976 → 400** (le corps est lu et analysé, 128 ms), **27 262 977 → 413 en 5 ms**, **30 Mo anonyme → 413 en 5 ms** ; `Transfer-Encoding: chunked` → **411**. **Dix imports hostiles simultanés** (classeur de 1 112 o portant 64 000 `<sheet`) → **10 × 400 en ≤ 75 ms**, `/api/sante` **≤ 35 ms**, **0 non-200 sur 40 sondes**. ⚠️ Le **trou est dans le garde-fou** (Q-226), pas dans le produit | ✅ **tient** |
| **S14** | Intégrité des opérations composites | **Par la route réelle** : import de **250 lignes dont une fautive**, `appliquer=oui` → **409**, `applique:false`, `creees:0`, `enErreur:1`, ligne **138** nommée avec sa colonne et sa valeur ; `risques` **2 → 2**. **Contrôle symétrique** : trois lignes saines du même fichier → **200**, `applique:true`, `creees:3`, `risques` **2 → 5** (nettoyé ensuite) | ✅ **tient** |
| **S15** | Dépendances | `npm audit --omit=dev` → **found 0 vulnerabilities**, code **0** | ✅ **tient** |
| **S16** | Garde-fous branchés | `f_verifier_schema()` est appelée par `db/migrate.mjs` **et** par `deploy/install.sh` (`GARDE_FOU_SCHEMA`, lignes 1850-1907). **Morsure sur base jetable** : `alter table risques no force row level security` + `alter table actions disable row level security` → `f_verifier_schema()` rend **2 anomalies** (`actions: rls_desactivee`, `risques: force_absente`) et `migrate.mjs` **sort en code 7** en les nommant. Avant sabotage : **0** | ✅ **tient** |
| **S17** | Chemin complet réel | **Chromium réel → Apache réel (CSP du vhost) → serveur réel → PostgreSQL → AD réel** : démarrage **200**, connexion `rssi.groupe` par le **formulaire**, titre **« Cyber GRC — Dedienne Aerospace Toulouse »** (identité de filiale, L9), **31 modules sur 31 peints**, **0 violation de CSP, 0 erreur de page**. Les deux seules erreurs console sont un **401 attendu** (`GET /api/session` d'avant-connexion) et un **403 identifié** : l'écran `/journal` appelle `GET /api/journal?limite=50`, refusé à `rssi.groupe`, et **l'écran le dit proprement** (« Le journal n'a pas pu être lu. Votre profil n'a pas accès ») sans proposer de recharger — c'est le comportement voulu par Q-25. ⚠️ **Réserve honnête, inchangée** : Chromium n'emploie pas le magasin du système ; la chaîne est vérifiée séparément par `curl` **sans `-k`** | ✅ **tient** |
| **S18** | Le produit fait son travail | Par le **formulaire réel** : `#/risques` → « Déclarer un risque » → saisie → validation → **aucun bandeau « champs non enregistrés »** → **`F5` complet** → **l'enregistrement est retrouvé**. Les 31 modules rendent tous du contenu. Nettoyé ensuite par la route | ✅ **tient** |

**Aucun des dix-huit contrôles n'est en échec, et aucun n'est marqué « non rejoué ».**
C'est la deuxième fois de suite. **Le produit n'est pas ce qui fait refuser cette
porte** — sauf sur le huitième contrôle de S9, la rétention, où **Q-230** ouvre un trou
que la grille ne nomme pas explicitement.

---

## 5. Les constats neufs

> Numérotés **à partir de Q-226**, vérifié par moi-même : le registre du
> `PLAN_EXECUTION` §7 porte **exactement 225 lignes** `| **Q-…**` et s'arrête à
> **Q-225** ; `Q-226` et au-delà n'apparaissent **nulle part** dans le dépôt.

---

### Q-226 — Le contrôle de coût des expressions a **quatre trous**, et deux d'entre eux ferment **les deux moitiés** du dispositif

**Classe : tout le reste (`V1.1`). Aucun chemin d'attaque vivant — le produit livré ne
porte aucune de ces formes. C'est le garde-fou qui est troué, pour la CINQUIÈME fois
d'affilée dans cette famille.**

Le fichier promet, dans son entête : *« Il ne reconnaît rien. Il extrait chaque
expression de `src/`, la joue contre des sujets hostiles, et la chronomètre. »* Les
quatre mutations ci-dessous ont toutes été posées dans une copie isolée du dépôt, dans
des fichiers du chemin réel, et jouées contre le garde-fou du dépôt.

#### (a) `RegExp(...)` **sans `new`** — l'interdit cherche une orthographe

`RegExp(motif)` est strictement équivalent à `new RegExp(motif)` en JavaScript. Les
**deux** contrôles qui bannissent la construction d'expression cherchent la chaîne
littérale `'new RegExp'` :

* `test/depot/cout-expressions.test.mjs:423` et `:439` ;
* `test/import/cout-analyseur.test.mjs:243` et `:257`.

**Mutation M-A** — la forme **exacte** de Q-208 b, dans `src/import/moteur.ts` :

```ts
export function colonneCorrespond(enTete: string, recherche: string): boolean {
  return RegExp(`^(${recherche}+)+$`, 'u').test(enTete);
}
```

| Ce que j'ai joué | Résultat |
|---|---|
| `test/depot/cout-expressions.test.mjs` | **5 essais, 5 passés** |
| `test/import/cout-analyseur.test.mjs` | **7 essais, 7 passés** |
| Coût réel, en-tête venu du fichier importé | 18 signes → **17,7 ms** · 22 → **44,7** · 26 → **502,9** · **30 → 8 394,2 ms** |

Le motif d'attaque est celui de Q-208 b, mot pour mot : *un octet du fichier importé
devient un motif*. Trente signes dans un en-tête de colonne gèlent le serveur huit
secondes et demie.

#### (b) Une **exponentielle derrière un préfixe littéral** — les familles ne la fabriquent pas

Les familles combinent bien, depuis Q-220 : `morceau + espaces + x`, `morceau + 'a'×n`,
`signe isolé + espaces + x`, `morceau répété`, et `signe répété + '!'` aux **tailles 18
et 23**. Aucune ne combine **préfixe + remplissage + queue étrangère**.

**Mutation M-C**, dans `src/pieces/clamav.ts` — reconnaître un flux « propre » nommé :

```ts
if (/^stream:([a-z]+)+$/u.test(ligne)) { return { etat: 'saine', resultat: ligne }; }
```

| Ce que j'ai joué | Résultat |
|---|---|
| `test/depot/cout-expressions.test.mjs` | **5 essais, 5 passés**, rapport **×1,0** |
| Coût réel sur `'stream:' + n × 'a' + '!'` | 18 → **4,3 ms** · 22 → **85,0** · 26 → **612,2** · **30 → 9 560,2 ms** |
| Témoin : la même forme **sans** préfixe (`(a+)+$`) | le garde la voit à **×66,1** |

Pourquoi les familles la manquent, mesuré : `morceau + 'a'×n` **réussit** (une suite de
minuscules satisfait `([a-z]+)+$`) et coûte zéro ; `morceau + espaces + x` échoue à la
première alternative et coûte zéro ; `'a'×18 + '!'` échoue sur l'ancre `^stream:` et
coûte zéro. **Le préfixe est le seul discriminant, et il aveugle.**

#### (c) Un **seul `/` dans un gabarit** avale l'expression de la ligne

`sansChaines()` neutralise `'` et `"`. Les gabarits (accent grave) sont **laissés tels
quels, par choix écrit** dans le fichier. Or un `/` dans un gabarit, sur la même ligne
qu'une expression, fait démarrer l'extracteur au mauvais endroit : il consomme jusqu'au
`/` **ouvrant** de la vraie expression, et le `/` fermant est rejeté par la sentinelle
arrière (`$` la précède). **L'expression n'est jamais extraite.**

**Mutation M-D**, dans `src/import/moteur.ts` :

```ts
const chemin = `${base}/lignes`; const motif = /^ligne:\s*(.+?)\s+fin$/u;
```

| Ce que j'ai joué | Résultat |
|---|---|
| `test/depot/cout-expressions.test.mjs` | **5 essais, 5 passés** |
| Coût réel du motif posé | 407 o → **140,9 ms** · 1 007 → **399,4** · 2 007 → **3 231,7** · **3 207 o → 12 573,7 ms** |
| **Contrôle symétrique** : gabarit remplacé par `base + 'X' + 'lignes'`, **motif identique** | **ROUGE** — `import/moteur.ts:278  l'entrée grandit et le temps coûte ×Infinity … ^ligne:\s*(.+?)\s+fin$` |

Le discriminant est net : **seul le gabarit change**, et le verdict bascule.

#### (d) Un `'/*'` **dans une chaîne** efface tout jusqu'au `*/` suivant

`sansCommentaires()` retire les commentaires de bloc par
`.replace(/\/\*[\s\S]*?\*\//gu, …)` — **avant** que `sansChaines()` n'ait neutralisé
quoi que ce soit. Un `'/*'` dans un littéral — un motif de glob, la chose la plus banale
du monde — efface donc tout le code jusqu'au prochain `*/` du fichier.

**Mutation M-E**, dans `src/import/moteur.ts` :

```ts
export function motifDeGlob(): string { return '/*'; }
export function etiquetteDeLigne(ligne: string): string | null {
  const motif = /^ligne:\s*(.+?)\s+fin$/u;      // le même motif à 12 574 ms
  return motif.exec(ligne)?.[1] ?? null;
}
```

→ `test/depot/cout-expressions.test.mjs` : **5 essais, 5 passés.**

#### (e) Robustesse : une exponentielle que les familles ATTEIGNENT **fige** le banc

Le `PLAFOND_MS` ne protège que si `exec` **rend la main**. Posé
`/^stream:\s*([\w.-]+\s?)+FOUND$/u` dans `clamav.ts`, la famille `morceau + 'a'×1000`
fabrique un sujet exponentiel de **mille** signes : `node --test` sur ce seul fichier a
dépassé **180 s** et a dû être tué. Mesuré sur les petites tailles, la croissance ne
laisse aucun doute : `'stream:' + 16 a` → **0,3 ms** · 20 → **0,9** · 24 → **13,2** ·
26 → **44,7 ms**. Le garde essaie **1 000** en premier. Le fichier écrit lui-même
qu'*« un essai qui se fige est un essai qu'on finit par retirer »*.

**Ce que le client ne perd PAS.** Rien aujourd'hui : `src/` est propre — les 37
expressions à quantificateur non borné passent le contrôle, et le banc les mesure. Ce
qui est perdu est la garantie que le **prochain** le sera.

**Pourquoi le banc ne le voit pas.** Parce que le banc **est** le filet. Ses quatre
morsures internes sont les quatre formes déjà connues ; aucune ne l'éprouve sur une
forme qu'il n'a pas servi à écrire. Et **la portée** est celle de `backend/src/**.ts` :
les **333 expressions du frontend**, balayées à la main par le 4ᵉ passage, ne sont
gardées par personne.

**Correctifs proposés**, par ordre de rendement :

1. **juger la propriété, pas l'orthographe** : toute expression **construite** se
   reconnaît à ce qu'un identifiant nommé `RegExp` est **appelé**, avec ou sans `new`.
   Un motif `\bRegExp\s*\(` couvre les deux ; c'est une ligne ;
2. **combiner les familles** au lieu de les juxtaposer : *préfixe × remplissage ×
   queue*, aux **deux** échelles (quadratique 1 000/3 000, exponentielle 18/23). Le
   trou (b) disparaît, et le trou (e) avec lui — une exponentielle sous préfixe se voit
   à vingt signes et rend la main ;
3. **neutraliser aussi les gabarits**, en gardant les `${…}` : le contenu littéral d'un
   gabarit n'a jamais porté d'expression, seules ses interpolations en portent ;
4. **retirer les chaînes AVANT les commentaires de bloc**, ou faire les deux en une
   seule passe lexicale — l'ordre actuel donne au `/*` d'une chaîne le pouvoir
   d'effacer du code ;
5. accessoirement, poser une **borne de temps par essai** (`node --test --test-timeout`)
   pour qu'une forme catastrophique fasse rougir au lieu de figer.

---

### Q-227 — **Q-225 n'est pas fermé** : le banc est intermittent, et la même mesure rend le contrôle **muet** sur le produit

**Classe : tout le reste (`V1.1`) — mais c'est le point 3 du `PLAN_EXECUTION` §5
(« C'est prouvé — les tests passent »), et le §8 du `README` annonce un chiffre qui
n'est vrai qu'une fois sur deux.**

| Ce que j'ai joué | Résultat |
|---|---|
| `npm test` — **premier** passage | **1 742 essais, 1 741 passés, 1 ÉCHEC**, 448 suites, 167,8 s, **code 1** |
| `npm test` — **second** passage | **1 742 / 1 742 / 0**, 168,5 s, **code 0** |
| `test/depot/cout-expressions.test.mjs` seul, **20 passages** | **19 verts, 1 rouge** |

L'essai qui échoue est `LE CONTRÔLE MORD — sur les QUATRE formes trouvées par les portes
successives`, dans le fichier **que Q-225 venait de réparer**. Deux messages distincts,
selon la passe :

* `Q-197 — l'alternative appariée : croissance ×4,4 pour ×3 d'entrée, sous le rapport de ×5` ;
* `Q-215 — la classe négative littérale : croissance ×1,0`.

**La cause, mesurée.** J'ai réimplémenté à l'identique le calcul de `pireCroissance()`
et l'ai joué trois fois **au repos** :

| Forme | rapport obtenu | `petit` | `grand` | seuil |
|---|---|---|---|---|
| Q-197 `<x>([\s\S]*?)</x>` | **×4,66** puis ×9,03 puis ×7,69 | 0,519 / 0,246 / 0,270 ms | 2,42 / 2,22 / 2,08 ms | `RAPPORT_MAX = 5` |
| Q-215 `<sheet\b([^>]*)\/?>` | ×9,19 / ×8,85 / ×8,99 | 0,139 ms | **1,04 à 1,28 ms** | `PLANCHER_MS = 1` |

Les deux témoins vivent **des deux côtés de leur seuil**. Le `grand` de Q-215 est à
**1,0–1,3 ms** pour un plancher de **1** : une passe un peu plus rapide et la famille
entière est écartée, `pire` reste à son initialisation `{rapport: 1}`, et l'essai rend
**×1,0**. Le `petit` de Q-197 est à **0,25–0,52 ms**, c'est-à-dire **dans le bruit** :
« le meilleur de trois passes » ne stabilise pas un dénominateur sous la milliseconde,
il en réduit seulement la variance — le raisonnement de Q-225 est juste, mais il ne
suffit pas à cette échelle.

**Et c'est la conséquence grave, celle qui dépasse un banc rouge.** Le même bruit qui
fait échouer le témoin fait **passer** une vraie expression de `src/` : un motif
quadratique mesuré à ×4,4 est déclaré sain, **en silence**. Le témoin échoue
bruyamment ; le produit passe sans un mot. *Un contrôle dont le discriminant vit dans
le bruit ne discrimine pas — il tire à pile ou face, et il ne le dit que dans un sens.*

**Ce que le client perd** : un banc qui échoue une fois sur deux est un banc qu'on
apprend à relancer plutôt qu'à lire — c'est le constat **Q-64**, mot pour mot, et il
avait été payé cher.

**Correctif** : ne pas lire un rapport entre deux mesures sous la milliseconde.
Choisir les tailles pour que le **petit** soit déjà au-dessus du plancher (viser
5–10 ms), ou boucler `exec` un nombre fixe de fois à chaque taille jusqu'à sortir du
bruit, ou — plus robuste — mesurer **trois** tailles et lire la pente sur un
logarithme, une quadratique étant reconnaissable à une pente de 2 même bruitée.

---

### Q-228 — Le `README` §8 porte un **second bloc** de chiffres du schéma, faux de neuf nombres, et le garde de Q-222 ne lit que le **premier**

**Classe : tout le reste (`V1.1`) — mais c'est le point 6 du `PLAN_EXECUTION` §5, faux
pour la QUATRIÈME porte consécutive, et cette fois dans la section qui déclare avoir
été rejouée.**

Le contrôle neuf `test/documentation/chiffres-du-schema.test.mjs` fait ce qu'il annonce
— je l'ai mordu — mais il emploie `motif.exec(texte)` : **une seule occurrence, la
première**. Le `README` en porte deux, dans la **même section** `### Fait et vérifié en
exécution`.

Mesuré sur une **base neuve migrée par le vrai `db/migrate.mjs`** :

| Ce que le bloc `#### Lot L1 — rejoué sur base neuve` annonce | Ligne | Réel |
|---|---|---|
| « **48 tables**, obtenues **aujourd'hui** en **7 migrations** » | 1159 | **49** et **16** |
| « **192 politiques** » | 1169 | **196** |
| « **71 clés étrangères** » | 1172 | **73** |
| « **43** en `restrict`, 27 en `cascade`, **une seule** en `set null` » | 1173 | **44 / 27 / 2** |
| « les **43 tables** portant `cree_par` … **43 relevés** » | 1202-1203 | **44 / 44** |
| « `f_init_tracabilite` (**31**), `f_init_creation` (10), `f_init_horodatage` (2) » | 1204 | **32 / 10 / 2** |
| « elle découvre ses contrôles … **9** aujourd'hui » | 1213 | **14** |
| « 48 tables, RLS activée et forcée **48/48**, **192 politiques** » | 1440 | **49**, **49/49**, **196** |

**Morsure du garde, et contre-épreuve.** J'ai **échangé** les deux nombres de
« politiques » entre les deux blocs :

| Mutation du `README` | `chiffres-du-schema.test.mjs` |
|---|---|
| §8 porte **192**, le §L1 porte **196** | **2 passés, 1 échec** — `politiques : le README dit 192, le catalogue en porte 196` ✔ |
| les **deux** blocs portent **196** | **3 passés, 0 échec** |
| l'état du dépôt : §8 porte **196**, le §L1 porte **192** | **3 passés, 0 échec** ✘ |

Le garde ne juge donc que la position, pas la propriété.

**Et un nombre de Q-222 reste non gardé.** Q-222 portait sur **deux** chiffres : les
tables `cree_par` **et les déclencheurs de création**. Le contrôle neuf couvre le
premier ; **aucun essai du dépôt ne compte les déclencheurs** — vérifié, `trg_*_creation`
n'apparaît nulle part dans `test/documentation/`. Le second des deux chiffres du constat
qui a créé ce garde-fou n'est pas gardé par lui.

**Ce que le client perd** : peu en absolu — mais c'est le troisième passage de porte où
un exploitant qui compte trouve autre chose que ce que le document annonce, et le §5 dit
pourquoi cela compte : *un chiffre faux ne mesure plus rien — pire, il rassure.*

**Correctif** : `matchAll` au lieu d'`exec`, et **toutes** les occurrences confrontées
au catalogue — un nombre répété dans un document est un nombre à tenir deux fois.
Ajouter le compte des déclencheurs. Et, pour le bloc L1 : soit le réancrer comme le §8
l'a été, soit dire explicitement qu'il décrit **l'état à la clôture du lot L1** et le
dater — un relevé historique est légitime, un relevé historique qui dit « aujourd'hui »
ne l'est pas.

---

### Q-229 — Le garde des sœurs i18n exempte `t` et `tHtml` sur une **prémisse fausse**, et le seul contrôle de leur second argument reconnaît une **orthographe**

**Classe : tout le reste (`V1.1`). Aucune des trois formes n'existe dans le produit —
je les ai cherchées une par une.**

Le garde de Q-221 **exécute**, et c'est un vrai progrès : il charge le module et fait
passer un témoin hostile dans chaque fonction exportée. Il exempte `t` et `tHtml` avec
ce motif écrit : *« leur argument est une clé écrite dans le code, jamais une valeur
stockée »*. Deux choses sont fausses.

**1. `t` a un SECOND argument, et c'est une donnée substituée telle quelle.** Mesuré en
exécutant le module du dépôt dans un bac à sable :

```
I18n.t('commun.confirmerSuppressionMultiple', { n: '<img src=x onerror=alert(1)>' })
  → « Confirmer la suppression de <img src=x onerror=alert(1)> élément(s) ? »   balise : PRÉSENTE
I18n.tHtml(même clé, même valeur)
  → « Confirmer la suppression de &lt;img src=x onerror=alert(1)&gt; élément(s) ? »  balise : ABSENTE
```

Le seul garde de ce second argument est `interpolationsNonEchappees()`, ancré sur
`/\$\{\s*t\(/g`. **Trois écritures du même défaut** posées dans un module du frontend,
dans une copie isolée :

| Forme posée dans `js/modules/risques.js` | `test/depot/traductions.test.mjs` |
|---|---|
| **témoin** — `` `<p>${t("risques.pourTraiter", { nom: r.nom })}</p>` `` | **14 passés, 1 échec** ✔ |
| `` `<p>${I18n.t("risques.pourTraiter", { nom: r.nom })}</p>` `` | **15 passés, 0 échec** ✘ |
| `` `<p>${r.nom ? t("risques.pourTraiter", { nom: r.nom }) : ""}</p>` `` | **15 passés, 0 échec** ✘ |
| `el.innerHTML = t("risques.pourTraiter", { nom: r.nom });` | **15 passés, 0 échec** ✘ |

La forme qualifiée n'est pas hypothétique : `js/core/ui.js:26` écrit déjà
`window.I18n.t(cle, valeurs)`.

**2. La prémisse « une clé écrite dans le code » n'est tenue par rien.** `js/app.js:286`
appelle déjà `t(meta.s)` avec une **variable** — inoffensif ici, `meta` venant de la
table `ROUTE_META` du dépôt, mais **rien ne l'impose**, et `brut()` rend la clé telle
quelle quand le dictionnaire ne la connaît pas : mesuré, `I18n.t('<img src=x
onerror=alert(1)>')` rend **exactement** cette chaîne. `t` **est** un passe-plat au sens
du garde ; il est exempté par son nom.

**3. `SANS_REPLI_BRUT` est devenu du code mort.** La liste (`esc`, `remplir`, chacune
avec son motif) n'a plus **aucun** usage : une seule occurrence dans le fichier, sa
déclaration. Le fichier professe pourtant, deux paragraphes plus haut, qu'*« une
exemption devenue sans objet fait rougir aussi »*.

**Ce que le client risque** : le retour de Q-203 par la **seconde** moitié de la chaîne
— non plus la valeur qui traverse le dictionnaire, mais celle qu'on y substitue — le
jour où quelqu'un écrit `${I18n.t(...)}` ou met un `t(` derrière une conditionnelle.

**Correctif** : ancrer sur l'**appel**, pas sur les deux signes qui le précèdent —
chercher `\bt\(` (qualifié ou non) **partout dans un gabarit**, et apparier les
parenthèses comme le fichier sait déjà le faire ; couvrir aussi les affectations à
`innerHTML`/`insertAdjacentHTML`. Et soit retirer `SANS_REPLI_BRUT`, soit le rebrancher.

---

### Q-230 — **Une pièce jointe survit à l'enregistrement qu'elle documente** : la ligne, le fichier, le quota — et aucun chemin pour la retrouver

**Classe : tout le reste (`V1.1`) — c'est celui de mes six constats qui touche le
PRODUIT, et le plus proche de la seconde classe dure sans y appartenir : la RLS borne
toujours l'orphelin à sa filiale.**

**Reproduit par la route réelle, à travers Apache, sous `rssi.groupe` :**

| Geste | Résultat mesuré |
|---|---|
| `POST /api/entites/risques` | **201**, `RISK-1788612149938-…` |
| `POST /api/pieces/risques/<risque>` avec un PDF légitime | **201**, `PJ-1788612149984-…` ; `pieces_jointes` **1 → 2** |
| `DELETE /api/entites/risques/<risque>?version=1` | **200 `{"supprime":true}`** |
| `pieces_jointes` après suppression du porteur | **2** — la ligne est intacte, `entite_id` pointe sur un risque qui n'existe plus |
| Le fichier sur le disque | `/var/lib/cyber-grc/pieces-jointes/02/0c/020c…6b7`, **69 octets, présent** |
| `GET /api/pieces/risques/<risque supprimé>/<pj>` | **200**, avec le contenu du document |

**La cause, lue dans le schéma et dans le code** :

* `pieces_jointes` porte un lien **polymorphe** (`entite_type`, `entite_id`) et **aucune
  clé étrangère** vers l'entité — relevé dans `pg_constraint` : la seule clé étrangère
  de la table vise `filiales` ;
* `src/entites/index.ts` ne mentionne **jamais** `pieces_jointes` : la suppression d'une
  entité ne les regarde pas ;
* le seul `delete from "pieces_jointes"` de tout `src/` est celui de la route de
  suppression **d'une pièce** (`src/pieces/depot.ts:263`) ;
* rien ne réconcilie : `reanalyserStock` itère sur les **lignes** et les ré-analyse ;
  `src/cycle/` n'exporte les pièces qu'à la sortie de filiale.

**Ce que le client perd — quatre choses, et la troisième est la plus gênante :**

1. **Le quota** : `volumeFiliale()` somme `taille_octets` sur **toutes** les lignes de la
   filiale. Un orphelin consomme le quota pour toujours, et personne ne peut le libérer
   depuis l'interface.
2. **Le disque** : le fichier reste, sans réclamant.
3. **La rétention et l'effacement** : un document attaché à un risque supprimé — donc
   supprimé du point de vue de l'utilisateur — **reste téléchargeable**. Dans un outil
   qui sert de preuve en audit ISO 27001 et qui porte un registre RGPD, « supprimer » qui
   ne supprime pas est une promesse rompue, et le droit à l'effacement de l'article 17
   ne s'arrête pas à la ligne métier.
4. **L'inaccessibilité** : l'interface liste les pièces **par entité**. L'entité n'existe
   plus : la pièce n'est plus ni listable, ni supprimable par un geste d'utilisateur. Il
   faut connaître l'identifiant du porteur disparu — ce que seule une lecture du journal
   d'audit ou de la base permet.

**Pourquoi le banc ne le voit pas.** `test/pieces/**` (89 essais) éprouve les huit
contrôles du dépôt, la délivrance, la quarantaine, le quota, la ré-analyse et la
suppression **de la pièce**. **Aucun essai du dépôt ne supprime le PORTEUR d'une pièce**
— vérifié : aucun `DELETE /api/entites` dans `test/pieces/`. Les deux moitiés sont
éprouvées séparément, et le défaut vit exactement entre elles. C'est le motif du 5ᵉ
passage de la porte S2 : *le défaut n'était dans aucun fichier, il était entre deux.*

**Correctif** : la suppression d'une entité doit, **dans la même transaction**, retirer
ses pièces (lignes et fichiers) — ou, si l'on veut conserver la pièce comme preuve,
l'attacher explicitement à autre chose et **le dire**. À défaut, une réconciliation
périodique qui balaie `pieces_jointes` et vérifie que le porteur existe : elle fermerait
du même geste la moitié de **Q-214 b**, dont le symptôme est le miroir de celui-ci (un
fichier sans ligne, au lieu d'une ligne sans porteur).

---

### Q-231 — La désinstallation laisse en place le **durcissement Apache de portée serveur**, et annonce le **mauvais préfixe** de groupes AD dans le seul mode où il est irrécupérable

**Classe : tout le reste (`V1.1`).**

#### (a) Un durcissement global posé par un produit qui n'est plus là

`deploy/install.sh:531-533` installe et **active** un fichier de configuration de
**portée serveur** :

```bash
install -m 0644 "$SOURCE/deploy/apache/durcissement-global.conf" \
                /etc/apache2/conf-available/cyber-grc-durcissement.conf
a2enconf -q cyber-grc-durcissement
```

Le bloc `desinstaller()` ne le mentionne **jamais** : zéro occurrence de
`durcissement`, `a2disconf` ou `conf-available`. Le fichier d'essai
`test/deploiement/desinstallation.test.mjs` non plus : zéro occurrence. Sur cette
machine, à cette heure, le lien existe :

```
/etc/apache2/conf-enabled/cyber-grc-durcissement.conf -> ../conf-available/cyber-grc-durcissement.conf
```

Après un `--desinstaller`, Apache continue donc d'appliquer **à tous les autres sites de
la machine** : `ServerTokens Prod`, `ServerSignature Off`, `TraceEnable Off`,
`FileETag None`, `RequestReadTimeout header=20-40,MinRate=500 body=20,MinRate=500`,
`LimitRequestLine 8190`, `LimitRequestFields 100`, `LimitRequestFieldSize 8190`,
`Timeout 60`, `KeepAlive On`, `MaxKeepAliveRequests 200`, `KeepAliveTimeout 5`. Le
`a2dismod -f autoindex` de l'installation n'est pas davantage rétabli.

**Ce que le client perd** : un site voisin qui a besoin d'en-têtes plus longs
(`LimitRequestFieldSize`), d'un `Timeout` supérieur ou d'un client lent se met à échouer
— et le produit qui impose ces bornes **a été désinstallé**. Le diagnostic est presque
impossible. C'est très exactement ce que le bloc lui-même dit vouloir éviter : *« on
couperait les autres sites de la machine en croyant faire le ménage »*.

#### (b) Le préfixe des groupes AD est lu **après** que sa source a été détruite

L'étape 6 fait `rm -rf "$DONNEES" "$JOURNAUX" "$CONFIG"` ; l'étape 7 appelle
`lire_variable LDAP_PREFIXE_GROUPES`, qui lit `$CONFIG/env`. **Mesuré**, bloc extrait
par ses ancres du vrai `install.sh`, avec un `rm` **réel** et le **vrai** `lire_variable`
recopié du script, sur un bac à sable portant `LDAP_PREFIXE_GROUPES=ACME-` :

| Mode | Ce que la désinstallation annonce |
|---|---|
| par défaut (données conservées) | « Les groupes « **ACME-*** » de l'Active Directory du client ne sont PAS retirés » ✔ |
| `--avec-les-donnees` | « Les groupes « **GRC-*** » … » ✘ — le repli `${prefixe:-GRC-}` |

Autrement dit : **dans le seul mode qui détruit la configuration**, donc le seul où
l'exploitant ne pourra plus retrouver le préfixe nulle part, le script lui donne la
**mauvaise** liste. Vingt-trois groupes `ACME-*` restent orphelins dans l'annuaire du
client, et le message dit d'en chercher d'autres.

**Pourquoi le banc ne le voit pas — et c'est la réponse à la question posée.** Le
fichier d'essai **double** `lire_variable() { printf ''; }`. Les deux branches rendent
donc la chaîne vide, les deux impriment le repli `GRC-`, et l'assertion
(`/GRC-.*Active Directory|Active Directory.*ne sont PAS/`) **accepte le repli**. La
doublure ne cache pas un geste : elle **efface la seule variable qui distinguait les deux
branches**.

**Ce qui TIENT, et que j'ai mesuré au passage** : deux `--desinstaller` de suite →
**code 0** les deux fois, journal identique ; sur une machine où rien n'est installé →
**code 0**, sans mensonge ; l'ordre arrêt-avant-retrait ; la conservation des clichés de
`$SAUVEGARDES` ; le refus d'un export vide ; le non-rechargement d'un Apache en défaut.

**Correctifs** : *(1)* `a2disconf cyber-grc-durcissement` puis
`rm -f /etc/apache2/conf-available/cyber-grc-durcissement.conf`, **avant** le
`configtest` — et un essai qui compare ce qu'`install.sh` pose sous `/etc` à ce que
`desinstaller()` retire, plutôt qu'une liste écrite deux fois ; *(2)* lire le préfixe
**au début** de `desinstaller()` et le garder en variable locale ; *(3)* dans l'essai,
donner à `lire_variable` une valeur **distincte du repli**, sans quoi il ne peut rien
distinguer.

---

## 6. Ce que je n'ai pas pu éprouver

### 6.1 Impossible ici — et ce qu'il faudrait

| Ce qui n'est pas éprouvé | Pourquoi | Ce qu'il faudrait |
|---|---|---|
| **Q-214 b par la panne réelle** | Il faut **tuer le processus** entre `promouvoir()` (`src/pieces/index.ts:601`) et le `commit` (`:603`) ; sur la recette cela coupe le service pour tout le monde | Un essai qui injecte un échec dans `avecTransaction` après la promotion **et balaie le disque**. Le correctif de **Q-230** — une réconciliation `pieces_jointes` ↔ disque — ferme les deux d'un même geste |
| **`--desinstaller` en vrai sur cette machine** | Proscrit par le brief : il retirerait la recette | Éprouvé comme le fait le banc, **bloc extrait par ses ancres** — mais avec `rm` **réel** et `lire_variable` **réel**, ce qui a suffi à sortir Q-231 (b). Un conteneur jetable resterait plus complet pour (a) |
| **Q-226 par la route** | Le produit livré **n'est pas vulnérable** : les quatre formes n'existent que dans mes mutants, et je ne déploie pas un mutant sur la recette | Rien de plus à mesurer ; le correctif **est** la mesure manquante |
| **La création d'une filiale sur la recette** | Proscrit (Q-155) | Non tenté cette fois ; le 4ᵉ passage l'a éprouvé sur base jetable, nominal **et** morsure. **Verdict repris, pas rejoué** |
| **La vérification du certificat *dans* Chromium** | Chromium n'emploie pas le magasin du système (NSS) | La chaîne est vérifiée par `curl` **sans `-k`**, `--capath /dev/null --cacert` → `ssl_verify_result=0` |
| **L'AD de production du client** | Règle de prudence inchangée | J'ai employé `grc-ad` et créé mes propres comptes jetables, puis je les ai supprimés |
| **L'envoi SMTP authentifié complet** | La recette n'a pas d'identifiants de relais | Reste à jouer chez le client (`PLAN_SERVEUR` §9) |

### 6.2 Non tenté — dit franchement

* **Je n'ai pas re-mordu Q-210, Q-211, Q-212, Q-213, Q-215, Q-216, Q-217, Q-218 ni
  Q-219.** Le 4ᵉ passage les a mordus un par un et les a vus rougir ; aucun de mes six
  constats ne les touche ; j'ai porté l'effort sur ce qui a été écrit **depuis**.
  **Verdicts repris, pas rejoués** — je le nomme plutôt que de le maquiller.
* **Le troisième code de sortie du bloc `sauvegarde` n'est joué par personne.**
  `migrate.mjs --verifier` peut rendre 1, 2, 3, 4 ou 5 ; le bloc ne prend un cliché
  qu'au **10**, et le banc ne double que 0 et 10. Sans conséquence aujourd'hui — la
  migration qui suit partage le même environnement et échoue de même —, mais c'est un
  chemin non éprouvé dans un bloc dont tout le propos est de ne jamais migrer sans
  retour arrière.
* **`test/reprise/**` et `test/cycle/**` n'ont pas été mordus** : verts dans les 1 742,
  et hors du chemin des correctifs de cette porte.
* **Je n'ai pas rejoué les seize migrations sur la base de la recette** — seulement sur
  une base neuve créée pour l'occasion. Rejouer sur la recette n'aurait rien appris et
  l'aurait exposée.
* **Je n'ai pas éprouvé le coût des expressions du frontend** au-delà de ce que le 4ᵉ
  passage avait balayé à la main (333 expressions, rien). Je note en revanche que
  **rien ne les garde** : `cout-expressions.test.mjs` ne lit que `backend/src/**.ts`.

---

## 7. Ce que cette porte enseigne

1. **Un garde-fou se contourne par la SYNTAXE tant qu'il lit du texte.** Q-215 a montré
   qu'un détecteur d'orthographe ne couvre pas sa classe ; Q-220 l'a montré une seconde
   fois ; Q-221 une troisième. Et le remplaçant de Q-220 (c) cherche toujours la chaîne
   `new RegExp` — alors que `RegExp(...)` sans `new` est **le même appel**. La question
   à poser à un garde-fou n'est pas « que reconnaît-il ? » mais **« quelle écriture du
   même comportement ne reconnaît-il pas ? »**, et la réponse se trouve en écrivant la
   chose autrement, pas en relisant le code.
2. **Un contrôle dont le discriminant vit dans le bruit ne se trompe que dans un sens —
   et c'est le mauvais.** Q-227 : le témoin échoue **bruyamment** une fois sur vingt,
   ce qui se voit ; une vraie expression quadratique passerait **en silence**, ce qui ne
   se voit pas. Un essai intermittent n'est pas seulement pénible : c'est la preuve
   affichée qu'il rend des verdicts faux, et les verdicts faux qui rassurent ne
   s'affichent jamais.
3. **Corriger un chiffre là où il est faux laisse tous les autres endroits où il est
   écrit.** Q-222 a été fermé par un contrôle juste ; il lit `exec()`, donc une seule
   occurrence, et le même document répétait les mêmes affirmations trois cents lignes
   plus bas. *Un nombre écrit deux fois est un nombre à garder deux fois* — et
   `matchAll` coûte huit signes.
4. **Une doublure qui rend la même valeur dans les deux branches n'éprouve aucune des
   deux.** Q-231 (b) : `lire_variable() { printf ''; }` efface la seule variable qui
   distinguait le mode par défaut du mode destructeur. Le banc jouait bien la fonction,
   dans le bon ordre, avec les bonnes commandes — et regardait un endroit où les deux
   chemins avaient été rendus identiques par le harnais lui-même.
5. **Un défaut vit rarement dans un fichier ; il vit entre deux.** Q-230 : la
   suppression d'une entité est éprouvée, la suppression d'une pièce jointe est
   éprouvée, et **personne n'a supprimé une entité qui portait une pièce**. Les 89
   essais de `test/pieces/**` et les essais d'entités sont tous justes, séparément.
6. **Et la bonne nouvelle, qui doit être dite aussi nettement que le refus** : pour la
   deuxième porte de suite, **aucun des dix-huit contrôles n'est en échec ni « non
   rejoué »**, et les **deux réserves** que le 4ᵉ passage avait laissées sont levées —
   le pool encaisse dix imports hostiles simultanés sans qu'une sonde de disponibilité
   dépasse 35 ms, et le frontend ne laisse passer **aucune** injection sur 31 écrans et
   4 fiches peuplés de noms hostiles, sous la CSP livrée. Cinq des six constats portent
   sur le **filet**, pas sur le produit ; le sixième, **Q-230**, est un défaut de
   rétention qui se ferme par une transaction et une réconciliation.

---

> **Constats neufs : Q-226, Q-227, Q-228, Q-229, Q-230, Q-231** — tous de la classe
> « tout le reste ». Chacun doit recevoir au registre du `PLAN_EXECUTION` §7 un
> **propriétaire nommé et une échéance** — *un constat chiffré et non attribué est un
> constat perdu.* **Q-227 conditionne le point 3 du §5** et **Q-228 le point 6** ; tous
> deux se ferment par la mesure, pas par une relecture. **Zéro constat des deux classes
> dures.**
