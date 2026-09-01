# Porte de sécurité S2 (7ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-SEPTIES**, agent indépendant. Je n'ai écrit aucune des lignes
> examinées, ni aucun des six rapports précédents. Travail en **lecture seule** sur le
> dépôt : le seul fichier que je crée est celui-ci, et toutes mes mutations ont vécu
> dans une copie hors dépôt.
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, révision
> examinée **`41ed654`** (« Registre : les cinq constats du 6e passage sont fermés »).
>
> Références : `docs/PLAN_EXECUTION.md` §4 (les dix-huit contrôles), §7 (journal des
> portes, registre des **trente-cinq** constats) ; `docs/securite/RAPPORT_S2_SEXIES.md` ;
> `backend/db/CONVENTIONS.md` §16 à §24 ; `backend/README.md` §8 ; `docs/PLAN_SERVEUR.md`.
>
> Date : 01/09/2026.

---

## 1. Le verdict

> ### ❌ **PORTE REFUSÉE** — **1 bloquant**, **2 majeurs**, **3 mineurs**. **Deux contrôles de la grille sont en échec : S17 et S18.**

**J'ai installé Apache sur la machine, et j'ai servi le frontend livré avec les blocs du
vhost livré. La page d'accueil de l'application répond `403 Forbidden`.**

C'est la première fois de ce chantier que le vhost passe sous un vrai Apache. Personne ne
l'avait fait — le sixième passage l'écrit noir sur blanc dans son §8 : *« Restent non
éprouvés : `LimitRequestBody`, la redirection TLS, `mod_deflate`, les `DirectoryMatch` et
`<FilesMatch>` »*. La liste blanche du constat **Q-31**, écrite après ce rapport, est
précisément un `<FilesMatch>`, et c'est elle qui referme la porte d'entrée.

Le motif est à **négation** : `^(?!.*\.(html|js|css|…)$)`. Apache évalue un `<Files>` sur
le **dernier segment du chemin**, et pour une requête de répertoire — `GET /`, celle que
tape tout utilisateur — ce segment est la **chaîne vide**. La chaîne vide ne finit par
aucun type publiable : la négation est vraie, `Require all denied` s'applique, et
`DirectoryIndex index.html` n'est jamais atteint, l'autorisation étant décidée avant le
gestionnaire.

```
GET /            → 403 Forbidden
GET /index.html  → 200   l'application se charge, 25 écrans, 0 violation CSP, 0 erreur
```

Le contournement existe (`/index.html`) et **n'est écrit nulle part**. Pire : la
vérification manuelle que `deploy/install.sh` prescrit à l'exploitant après installation
est `curl … https://<hôte>/index.html → 200 attendu` — elle passe pendant que
l'application est injoignable à son adresse.

| # | Constat neuf | Gravité |
|---|---|---|
| **Q-36** | **La liste blanche du vhost refuse la page d'accueil.** `GET /` rend **403** sous un Apache réel, avec les blocs du fichier livré : le motif inversé est vrai pour le **basename vide** d'une requête de répertoire. La chaîne complète est cassée — `http://hôte` → 308 → `https://hôte/` → **403**. Régression du correctif **Q-31**, accepté au 6ᵉ passage ; avant lui, `/` rendait 200 | 🔴 **bloquant** |
| **Q-37** | **Un essai du banc est vert parce qu'un binaire manque.** `test/deploiement/install-blocs.test.mjs:207` vérifie `sortie.includes('fichier non publiable') === false` — or le message de **succès** du bloc est *« aucun fichier non publiable »*, qui contient la chaîne. L'essai ne passe que parce que le bloc meurt sur `rsync` avant de l'imprimer. `rsync` installé — ce que fait `install.sh` lui-même — `npm test` rend **595/596**. Et le « contrôle symétrique », dont c'est toute la raison d'être, ne prouve rien | 🟠 majeur |
| **Q-38** | **Q-33 est inscrit « ✅ corrigé » au registre sans qu'une ligne d'essai ait été écrite.** Les **trois** mutations du 6ᵉ passage laissent le banc vert : recalage d'adresse **50/50**, vidage avant rechargement **50/50**, abandon avant transaction **172/172**. `git diff` le confirme : aucun fichier d'essai n'a bougé pour ce constat. Deuxième occurrence, un passage plus tard, du motif de **Q-32** — et cette fois dans un constat qui portait lui-même sur une absence de couverture | 🟠 majeur |
| **Q-39** | **La « référence » d'un incident est choisie par le client.** `requestIdHeader: 'x-request-id'` (`src/serveur.ts:69`) : l'en-tête traverse le vhost livré, devient `requete.id`, donc la `reference` rendue au client **et** l'identifiant de corrélation du journal technique. Deux requêtes peuvent porter la même. C'est le principe du `CONVENTIONS.md` §17.8 — *l'acteur d'une entrée de journal n'est pas fourni par le client* — appliqué en base et pas à la couche HTTP | 🔵 mineur |
| **Q-40** | **Le registre a une case d'état vide.** La ligne **Q-28** de `docs/PLAN_EXECUTION.md` §7 porte 6 barres verticales là où toutes les autres en portent 7 : la colonne « État » — celle que le `CLAUDE.md` §8 ordonne de lire — est absente pour ce constat | 🔵 mineur |
| **Q-41** | **Q-4, sixième signalement.** `backend/README.md` §5 annonce « **564 essais** » et « **Quatre familles d'essais** » (base 272 · api 172 · reprise 77 · navigateur 43) : il y en a **596** en **cinq** familles, `test/deploiement/` n'est nommé nulle part, et `test/navigateur/` en porte 50 | 🔵 mineur |

**Ce que je n'ai pas réussi à casser, et qu'il faut dire.** Le cœur serveur ne bouge
toujours pas : **111 sondes hostiles** n'ont fait bouger ni le périmètre, ni une frontière
de filiale, ni une requête SQL. Le cloisonnement rend **107/107** et s'effondre proprement
au sabotage (**103/107**, code 3, « CLOISONNEMENT EN DÉFAUT »). **Vingt-cinq** des
vingt-neuf mutations et sabotages que j'ai appliqués mordent ; **trois** ne mordent pas, et
ce sont les trois du même constat (Q-33) ; une a été écartée parce qu'elle ne compilait
pas, et rejouée autrement. Et surtout, le résultat qui compte le
plus pour S17 : **les 25 écrans du menu, sous un Apache réel, derrière `mod_proxy`, avec la
CSP du fichier livré, rendent 0 écran vide, 0 erreur de script et 0 violation de CSP.** Le
produit fonctionne — dès lors qu'on lui donne l'adresse `/index.html`.

**Ce qu'il reste à faire est étroit, et c'est ce qui rend le refus frustrant** : ancrer le
motif du `<FilesMatch>` sur autre chose que la chaîne vide (Q-36), une assertion à
resserrer (Q-37), trois essais à écrire pour de bon (Q-38).

---

## 2. Comment cette porte a été jouée

Rien de ce qui suit ne repose sur la lecture seule du code ni sur la démonstration de son
auteur. Chaque affirmation porte la commande qui la produit.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2vii`**, neuve (`db/dev/preparer_base_dev.sh --base grc_audit_s2vii --recreer`), recréée après chaque sabotage de schéma, plus les bases jetables d'`ouvrirBaseEssai` |
| Copie de travail | **Copie complète du produit hors du dépôt** (`…/scratchpad/s2vii/copie`), où vivent **toutes** les mutations |
| Serveur | `construireServeur()` réel, monté une trentaine de fois, en `developpement` et en `production`, par `inject()` **et** sur un vrai port |
| **Apache** | **`apt-get install apache2` — 2.4.58.** Vhost d'essai **extrait du fichier livré** par script (`fabriquer-vhost-complet.py`) : en-têtes, CSP, `LimitRequestBody`, bloc `<Directory>`, `DirectoryIndex`, les trois blocs de refus, `ProxyPass`, les `RequestHeader unset`. Seuls le TLS, le port et la cible du proxy sont remplacés — il n'y a ici ni certificat ni service systemd |
| **rsync** | **`apt-get install rsync` — 3.2.7.** Les règles de filtre d'`install.sh`, extraites du fichier, jouées pour de bon sur l'arborescence réelle |
| Navigateur | Playwright / Chromium ; les 50 essais de `test/navigateur/`, rejoués **seize fois** sous mutation ; une marche des 25 écrans **derrière Apache** |
| Sondes écrites par moi | 6 fichiers : 111 sondes hostiles, mesures de bornes, de saturation, de coût avant décision, gabarit de S12 |
| Mutations | **26 mutations de code** appliquées une par une, compilées, jouées, annulées, plus **3 sabotages de schéma** sur base vivante |

### Ce que j'ai vérifié de mon propre outillage avant d'accuser le code

C'est la règle du chantier, et elle m'a évité d'écrire quatre sottises.

1. **Ma copie rend exactement ce que rend le dépôt**, avant toute modification de la
   machine :

   ```
   dépôt : npm test → tests 596 · pass 596 · fail 0   (110,7 s)
   copie : npm test → tests 596 · pass 596 · fail 0   (110,1 s)
   ```

2. **`pg_isready` d'abord.** `/var/run/postgresql:5432 - accepting connections`. Le
   `README` §8 prévient qu'un banc qui rétrécit sans rougir est le symptôme le plus
   trompeur qui soit ; je l'ai vérifié avant de compter quoi que ce soit.

3. **Mon fichier de secours a fait rougir deux essais, et ce n'était pas le produit.**
   Mon outil de mutation déposait `sync.js.original` **dans l'arborescence du frontend**.
   Or `test/deploiement/frontend-publiable.test.mjs` balaie exactement cette
   arborescence : l'extension `original` n'est pas publiable, et deux essais tombaient.
   Vérifié séparément — même fichier déposé, sans aucune mutation : mêmes deux échecs.
   **C'était mon instrument, pas le code.** Le fichier de secours vit désormais hors de
   l'arbre.

4. **Trois de mes « fuites » d'injection SQL étaient des faux positifs de mon propre
   motif.** Mon détecteur cherchait `pg_` dans la réponse ; il trouvait le nom d'entité
   que je venais moi-même d'envoyer (`« pg_class » n'est pas une entité connue`). Ce
   n'est pas une fuite, c'est un écho de mon entrée — relu un par un.

5. **Ma première mesure de S12 et de Q-10 était fausse faute d'un en-tête.** Mon appel ne
   posait pas `content-type: application/json` : le serveur rendait **415** partout, et
   j'aurais conclu que la barrière fail-closed ne coûtait rien. Corrigé, la mesure est
   celle du §5, Q-10.

6. **Mon premier `psql` de la démonstration de cloisonnement sortait en 0 avec quatre
   échecs affichés**, et j'ai failli en faire un constat. J'avais omis
   `-v ON_ERROR_STOP=1`, que le `README` §5 prescrit. Avec l'option : **code 3**. Le
   dispositif est juste, c'est ma ligne de commande qui ne l'était pas.

7. **Trois de mes mutations ont fait échouer `tsc`** (`TS2304`, `TS6133`). `tsconfig.json`
   ne porte pas `noEmitOnError` : `dist/` était donc bien réécrit et la mutation
   atteignait le banc. Je le dis parce que l'inverse aurait rendu ces trois résultats
   nuls, et je les ai relus à ce titre.

8. **Mon sabotage de `identifiantDerive` par renommage ne compilait pas** ; rejoué en
   re-salant l'empreinte avec `Math.random()`, il mord — le serveur refuse de démarrer.

### Contrôles d'environnement, joués avant tout le reste

```
$ pg_isready                                → /var/run/postgresql:5432 - accepting connections
$ git status --porcelain                    (vide, avant / pendant / après)
$ git log -1 --format="%H %s"
41ed6548dc6f620c8eb499c5305617d2aeb32a59 Registre : les cinq constats du 6e passage sont fermés

$ npm run verifier-types                    → aucune erreur
$ npm audit --omit=dev                      → found 0 vulnerabilities
$ npm audit                                 → found 0 vulnerabilities
$ npm test                                  → tests 596 · pass 596 · fail 0   (AVANT rsync)
$ npm test                                  → tests 596 · pass 595 · fail 1   (APRÈS rsync — voir Q-37)

$ node db/migrate.mjs --verifier            → « garde-fous du schéma : aucune anomalie », code 0
$ psql -X -q -v ON_ERROR_STOP=1 -U grc_app -f db/verifier_cloisonnement.sql
  | contrôles | réussis | échoués |
  |       107 |     107 |       0 |     (code 0)
```

Machine : Node 22.22.2, **PostgreSQL 16.13** (la cible est 17), `psql` 16.13, Playwright
global, Chromium, **Apache 2.4.58** et **rsync 3.2.7 que j'ai installés** — c'est la
différence de ce passage avec les six précédents, et c'est elle qui produit le bloquant.

> ⚠️ **Le chiffre `595/596` est une conséquence de MON changement de machine.** Le banc
> était vert avant que j'installe `rsync`, et il l'est resté sur toutes mes mesures
> antérieures. Ce n'est pas une régression du code : c'est un essai dont le vert dépendait
> de l'absence d'un binaire. Le constat **Q-37** l'explique en entier, et le fait que
> `install.sh` installe lui-même `rsync` est ce qui le rend sérieux.

---

## 3. Le sort des trente-cinq constats du registre

**Je n'ai fermé aucun constat sur la foi d'un texte.** Vingt-six fermetures sont rejouées
par mutation ou par sabotage ; le reste est vérifié par exécution ou par relevé du
catalogue.

| # | Annoncé | Ce que j'ai joué | Verdict |
|---|---|---|---|
| **Q-1** | ✅ corrigé | `OCTETS_ALEA` ramené de 16 à **5 octets (40 bits)** : `identifiants.test.mjs` → **2 rouges** (« SOUS LE PLANCHER NORMÉ », « LA FORME EST VÉRIFIÉE SUR TOUT L'ÉCHANTILLON ») ; `routes.test.mjs` → **le serveur ne démarre plus**, 5 essais rouges dont « LE GÉNÉRATEUR QUI ÉCRIT : 250 créations d'affilée, 250 identifiants distincts » | ✅ **fermé et rejoué** |
| **Q-2** | ✅ corrigé | `identifiantDerive()` re-salée d'un `Math.random()` (mutation qui compile) → **le serveur refuse de démarrer**, `verrou-mise-en-oeuvre.test.mjs` s'effondre | ✅ **fermé et rejoué** |
| **Q-3** | ✅ corrigé | Les cinq comportements neufs, mutés un par un : entropie de `UI.genId` (via Q-32), `ordonnerCreations` ré-indexée par identifiant → **rouge**, canari de doublons → **rouge**, `signalerRetrecissement` → **rouge** (via le filet à deux canaux), `|| aDesModificationsEnAttente()` retiré → **rouge** | ✅ **fermé et rejoué** |
| **Q-4** | ✅ corrigé | Relu `README` §8 et `CHANGELOG`. `006_entropie_et_commentaires.sql` est **désormais nommé** dans les deux, et le compte de migrations est juste (**6**). Mais le §5 annonce toujours « 564 essais » et « **Quatre** familles », `test/deploiement/` n'existe pour aucun des deux documents, et `test/navigateur/` y vaut 43 pour 50 | ❌ **rouvert** — constat **Q-41** |
| **Q-5** | ✅ corrigé (`005`) | Sabotage sur base vivante : `drop function f_verifier_couverture_rls()` → `migrate.mjs --verifier` sort en **code 7**, en nommant `point_appel` et en expliquant qu'« un contrôle observé à la dernière application a disparu » | ✅ **fermé et rejoué** |
| **Q-6 (a)(b)(c)** | ✅ corrigés | Relevé **dans le catalogue** de `grc_audit_s2vii` : les commentaires corrigés sont bien en place, cités par leur constat | ✅ **fermés** |
| **Q-7** | ✅ corrigé | `grep -rn "Math.random" backend/src/` → **aucune occurrence**. Les seuls tirages sont `randomBytes` et `randomUUID` | ✅ **fermé** |
| **Q-8** | ✅ corrigé sur le fond | `parcourirEcarts` est bien le parcours unique. **Toujours aucun essai de performance** : la mesure « 3 ms au lieu de 41 » ne vit que dans un commentaire — observation §6, inchangée depuis le 6ᵉ passage | ✅ **fermé** sur le fond ; observation §6 |
| **Q-9** | ouvert, reporté **L7** | Voir Q-20 pour la mesure. Le report tient, avec une nuance que j'écris au §6 | ✅ **report défendable** |
| **Q-10** | ouvert, reporté **L3** | Rejoué en `production` : `GET /api/donnees` → **503 en 10,2 ms** ; `POST /api/reprise` avec un corps de **11,5 Mo** → **503 en 73,4 ms**. Le facteur est de **7**, payé avant toute décision et sans authentification. Le remède (`onRequest`) est bien de L3 (condition E4) | ✅ **report défendable** — la mesure confirme le registre, à la baisse |
| **Q-11** | ◐ refus argumenté | `repriseIndisponible` (`datastore.js:924`) : `statut === 404 \|\| statut === 405`, et rien d'autre. Le bandeau est éprouvé **dans les deux sens** (identifiant court → il nomme la réécriture ; identifiant canonique → il se tait) | ✅ **l'argument tient** |
| **Q-12** | ✅ corrigé | `grep -rn "Vault\." js/ index.html` hors `vault.js` → une seule occurrence, `js/app.js`. L'en-tête dit exactement cela | ✅ **fermé** |
| **Q-13** | ✅ corrigé | `grep -rn "Math.random\|randomBytes\|getRandomValues\|randomUUID" backend/src/reprise/` → **aucune**. `identifiantDeFichier` dérive et marque `-d-` | ✅ **fermé** |
| **Q-14** | ✅ corrigé (`006`) | Sabotage sur base vivante : `f_generer_id` remplacée par un **remplissage** de 32 signes constants → `migrate.mjs --verifier` sort en **code 7**, `[entropie_identifiants] f_generer_id → identifiant_entropie_faible` | ✅ **fermé et rejoué** |
| **Q-15** | ✅ corrigé | `reprendreRenommages()` retiré du `finally` de `cycle()` → **rouge** : « après le renommage, et SANS aucun autre geste, la page revient au repos » | ✅ **fermé et rejoué** |
| **Q-16** | ouvert, **vague 3** | Vérifié en propre : **0 capture d'identifiant en variable locale** dans les 26 modules (`const/let/var id = <objet>.id` → aucune occurrence), **39 navigations par `dataset.id`**, et les **25 écrans** parcourus derrière un Apache réel sous la CSP livrée : 0 écran vide, 0 erreur de script, 0 violation | ✅ **report défendable** |
| **Q-17** | ✅ corrigé (`006`) | Voir Q-14 : la mesure est en bits, position par position, et elle voit le remplissage | ✅ **fermé et rejoué** |
| **Q-18** | ✅ corrigé (`006`) | Relevé dans le catalogue : le commentaire du domaine `id_metier` porte le texte corrigé | ✅ **fermé** |
| **Q-19** | ✅ corrigé | Trois mutations. (a) borne portée à 900 000 → **8 essais rouges** ; (b) `analyserApportsReprise` retirée de la route → rouge (« POOL SATURÉ : un fichier hors borne reçoit 413 ») ; (c) `if (abandonne()) throw new AbandonClient()` retiré → rouge (« ABANDON en cours de reprise : ZÉRO ligne écrite »). Et mesuré : 8 001 enregistrements → **413 en 90 ms**, 8 000 → **200 en 10,2 s** | ✅ **fermé et rejoué** — réserve : le contrôle *avant transaction* ne mord toujours pas (**Q-38**) |
| **Q-20** | ✅ corrigé | `try/catch` autour de `pool.connect()` retiré → rouge. Rejoué en vrai : **dix reprises simultanées, cinq lectures ordinaires → 0 en 500, 5 en 503** (≈5 s). Le 500 a bien disparu | ✅ **fermé et rejoué** ; le fond reste à **L7**, voir §6 |
| **Q-21** | ✅ corrigé | Les trois mutations rejouées : canari → **rouge** ; rétrécissement → **rouge** (via le filet à deux canaux) ; sondage qui pousse → **rouge** | ✅ **fermé et rejoué** |
| **Q-22** | ✅ corrigé | Les trois renvois relus : le `CONVENTIONS.md` §2 attribue le manque à **Q-23**, l'encadré d'arbitrage porte la mention « déjà dépassé par les faits », Q-15 est cité hors registre | ✅ **fermé** |
| **Q-23** | rouvert en Q-32 | Voir Q-32 : le mécanisme est réparé **et** éprouvé | ✅ **fermé par Q-32** |
| **Q-24** | ✅ corrigé | Bandeau `champsRefuses` neutralisé → **rouge** : « le bandeau nomme la collection et le champ écartés » | ✅ **fermé et rejoué** |
| **Q-25** | ✅ corrigé | `rechargeable: false` du refus de droit passé à `true` → **rouge** : « REFUS DE DROIT : la valeur du serveur revient, le bandeau parle, PAS de bouton » | ✅ **fermé et rejoué** |
| **Q-26** | ✅ corrigé | Voir Q-1 : `mesurerBitsParPosition` est en bits, et l'affaiblissement à 40 bits empêche le démarrage | ✅ **fermé et rejoué** |
| **Q-27** | ✅ corrigé | `rejeuDangereux` neutralisé (`if (true) return false`) → **4 essais rouges**, dont « LE SERVEUR A VALIDÉ, la réponse expire : UNE ligne, la saisie à l'écran », « 502 : la création est BLOQUÉE », « 504 : … » | ✅ **fermé et rejoué** |
| **Q-28** | ouvert, **vague 3** | Vérifié : `src/reprise/index.ts:587` porte bien `toString(36).padStart(25, '0')` en dur, et les deux formes coïncident aujourd'hui (suffixe de 25 signes des deux côtés, mesuré). C'est une **dérivation**, elle ne tire rien. Rien ne casse — mais **sa case d'état est vide au registre** : constat **Q-40** | ✅ **report défendable**, forme du registre à corriger |
| **Q-29** | ✅ corrigé | Deux mutations. (a) `const aPreserver = Array.from(creationsBloquees.values())` → `[]` : **rouge**, « CRÉATION incertaine : on RECHARGE comme il est proposé, la saisie reste ». (b) `boutonRenvoi()` rendu muet : **rouge** sur le même essai | ✅ **fermé et rejoué** — voir la réserve du §6 sur l'essai unique |
| **Q-30** | ✅ corrigé | `issueInconnue` du chemin frontal forcé à `false` → **2 essais rouges** : « 502 : la création est BLOQUÉE et dite incertaine », « 504 : … ». Et le relais du banc rend désormais le statut **comme le frontal le rendrait**, ce qui est la moitié qui manquait | ✅ **fermé et rejoué** |
| **Q-31** | ✅ corrigé | Le dépôt ne porte plus que 65 fichiers, tous publiables sauf un `.md` toléré. **Les règles rsync jouées pour de bon** (rsync 3.2.7) : 64 fichiers publiables au départ, **64 à l'arrivée, 0 intrus, 0 répertoire vide conservé**. Et **sous Apache réel** : `/data/registre.xlsx` → **403**, `/data/LISEZ-MOI.md` → **403**, un lien symbolique `.html` → **403** (`-FollowSymLinks`) | ⚠️ **fermé sur son objet, mais son remède casse la page d'accueil** — constat **Q-36** |
| **Q-32** | ✅ corrigé | Deux mutations. (a) séparateur retiré de `genId` → **rouge**, « UN GÉNÉRATEUR QUI SE RÉPÈTE est nommé à l'écran ». (b) détecteur neutralisé (`if (false)`) → **rouge** sur le même essai. Le mécanisme est réparé **et** l'essai existe | ✅ **fermé et rejoué** |
| **Q-33** | ✅ corrigé | **Les trois mutations du 6ᵉ passage, rejouées une par une : aucune ne mord.** Recalage d'adresse → **50/50** (et **594/596** sur la suite entière, les deux échecs étant mon propre fichier de secours) ; vidage avant rechargement → **50/50** ; abandon avant transaction → **172/172**. `git log f0b4eec..HEAD -- backend/test/` : aucun essai n'a été ajouté pour ce constat | ❌ **rouvert** — constat **Q-38** |
| **Q-34** | ✅ corrigé | `006` est nommé dans les deux documents, le compte de migrations est juste. Mais la partie « familles d'essais » a re-divergé en quatre commits | ⚠️ **fermé sur son objet, rouvert sur le motif** — constat **Q-41** |
| **Q-35** | ✅ corrigé (niveaux 1 et 2) | Les 25 essais de `test/deploiement/` existent et mordent — sauf un, dont le vert dépendait de l'absence de `rsync` : constat **Q-37**. Le **niveau 3** (root, systemd, Apache, rsync) était inscrit « vérification de VM » ; **je l'ai joué**, et c'est là que Q-36 vivait | ⚠️ **fermé pour moitié** — constats **Q-37** et **Q-36** |

**Décompte** : **26 fermés et rejoués** · **4 reports défendables** (Q-9/Q-20 vers L7, Q-10
vers L3, Q-16 et Q-28 vers la vague 3) · **1 refus argumenté qui tient** (Q-11) · **2
rouverts** (Q-4 → Q-41, Q-33 → Q-38) · **2 fermés sur leur objet mais percés ailleurs**
(Q-31 → Q-36, Q-35 → Q-37 et Q-36).

---

## 4. La grille §4, contrôle par contrôle

| # | Verdict | Ce que j'ai exécuté, et ce que cela a rendu |
|---|---|---|
| **S1** | ✅ | `db/verifier_cloisonnement.sql` sous **`grc_app`** : **107 contrôles, 107 réussis, 0 échec, code 0**. **Sabotage sur base vivante** : `alter table risques no force row level security` → **103/107**, 4 échecs nommés, **code 3**, et la phrase « CLOISONNEMENT EN DÉFAUT » ; le même sabotage fait sortir `migrate.mjs --verifier` en **code 7** (`couverture_rls : risques → force_absente`). Catalogue relevé : 48 tables, 0 sans RLS activée, 0 sans RLS forcée. |
| **S2** | ✅ | **111 sondes hostiles écrites par moi.** 22 formes d'entête (`x-filiale`, `grc-filiale`, `x-perimetre`, `x-administration-groupe`, `x-forwarded-user`, `x-utilisateur`, `x-grc-filiales`, `authorization`, un cookie composite `grc.filiale_id=…; cyber-context=…; grc.administration_groupe=oui`…), 7 paramètres d'URL, 7 enveloppes de corps (dont `filiale_id` dans `champs`, `portee: 'groupe'`, `administrationGroupe: true`, `__proto__`), 22 noms d'entité × 2 méthodes, 18 noms de champ, 13 valeurs sur `?depuis=`. **Aucune ne fait bouger le périmètre** — filiale active, périmètre de lecture et `administration_groupe` identiques à la référence sur les 36 sondes de périmètre. La propriété reste tenue par la **forme** : `resoudre()` ne prend aucun argument. |
| **S3** | ⬜ sans objet | Journal d'audit : **lot L5**. Rejoué quand même : l'API **n'y écrit jamais** (2 lignes avant, 2 après une création et une lecture) ; sous `grc_app`, `update`/`delete`/`truncate` → **42501** ; **sous le propriétaire**, les trois rendent **`GRC01`** ; `f_journal_audit_verifier()` → **0 ligne**. La réserve C22 (lecture non cloisonnée) reste un livrable ferme de L5. |
| **S4** | ✅ | Mutation : `where id = $1 and version = $2` remplacé par `where id = $1 and $2 = $2` → **3 essais rouges** (« version périmée → motif conflit_version », « la seconde reçoit conflit_version », « 409 — GRC03 ET la version réelle »). `version`, `cree_le`, `cree_par`, `modifie_par`, `filiale_id`, `portee_groupe` restent **refusés et nommés** en écriture. |
| **S5** | ✅ | 44 noms d'entité hostiles (`risques"; drop table risques; --`, `pg_catalog.pg_class`, `../risques`, `__proto__`, `information_schema.tables`, `journal_audit`, `sessions`…), 18 noms de champ, 13 valeurs sur `?depuis=`. **Aucune fuite** : ni SQL, ni `SQLSTATE`, ni pile, ni nom de table. `risques` : 4 lignes avant, 4 après ; 48 tables publiques avant comme après ; `({}).pollue === undefined`. |
| **S6** | ⬜ sans objet (L3) — **barrière provisoire vérifiée** | En `production` : `/api/session`, `/api/modele`, `/api/donnees`, `/api/rafraichir`, `POST /api/entites/risques`, `POST /api/operations/propager-mesure` → **503** ; `/api/sante` → **200**. |
| **S7** | ⬜ sans objet | Droit d'export distinct : **lot L3** (§3.3). |
| **S8** | ✅ | Balayage des fichiers **suivis** (clés privées, `AKIA…`, `xox…`, `ghp_…`, JWT, certificats) : **aucun**. Le seul `.env` versionné est `.env.example`. Le mot de passe `dev` n'apparaît que dans `db/dev/preparer_base_dev.sh`, sous un refus explicite en `NODE_ENV=production`. **La réserve du 6ᵉ passage est levée** : la racine web ne porte plus que 59 `.js`, 2 `.css`, 1 `.svg`, 1 `.png`, 1 `.html` et 1 `.md`. |
| **S9** | ⬜ sans objet | Pièces jointes : **lot L6**. |
| **S10** | ✅ | `x-content-type-options: nosniff` **et** `cache-control: no-store` sur **8 réponses d'API** — succès comme échecs (400, 404, 415) et route inconnue : **0 manquant**. Et pour la première fois **posés par Apache** : les 9 en-têtes du fichier livré, CSP comprise, mesurés sur la page réelle (`default-src 'self'; script-src 'self'…`). |
| **S11** | ⬜ sans objet | Limitation de rythme : **lot L3**, condition E4. |
| **S12** | ✅ | « Caché » et « absent » rendent une réponse **identique au gabarit près** : `PUT` sur `RISK-ESSAI-B-1` (filiale voisine) et sur `RISK-QUI-NEXISTE-PAS` → **404**, `ressource_inconnue`, même phrase, même forme. Le 503 de saturation ne nomme ni pool, ni connexion, ni PostgreSQL. Aucune pile, aucun `SQLSTATE`, aucun nom de table dans mes 111 sondes. |
| **S13** | ✅ | Toutes les bornes mordent, mesurées une par une : `nom` de 200 001 signes → **400** (199 000 passe : la borne est exacte) ; 91 champs → **400** « maximum 80 » ; corps de 27 Mio → **413** ; 8 001 enregistrements de reprise → **413 en 90 ms** avec le reçu et l'admis ; 8 000 → **200 en 10,2 s**. Le pool est borné et sa saturation se rend en **503**. |
| **S14** | ✅ | Une reprise dont un enregistrement est refusé rend **400** et ne laisse **rien** : 1 exigence avant, 1 après. L'aperçu applique puis annule. Le sabotage du contrôle d'abandon *avant validation* fait rougir « ABANDON en cours de reprise : ZÉRO ligne écrite ». |
| **S15** | ✅ | `npm audit --omit=dev` → **0 vulnérabilité** ; `npm audit` complet → 0. Deux dépendances d'exécution (`fastify`, `pg`), épinglées par `package-lock.json`. |
| **S16** | ✅ | Garde-fous éprouvés **par leur débranchement**. (a) `drop function f_verifier_couverture_rls()` → `migrate.mjs` **code 7**, `point_appel`. (b) `no force row level security` → **code 7**, `couverture_rls`. (c) `f_generer_id` rendue constante → **code 7**, `identifiant_entropie_faible`. (d) entropie TypeScript à 40 bits → **le service ne démarre pas**. (e) déterminisme de la ré-émission cassé → **le service ne démarre pas**. Cinq débranchements, cinq refus. |
| **S17** | ❌ **EN ÉCHEC** | **J'ai monté un Apache réel avec les blocs du vhost livré, et la page d'accueil rend 403** (**Q-36**). C'est exactement ce que ce contrôle demande — *« dans la configuration de déploiement réelle, vhost et en-têtes compris »* — et exactement ce qu'aucun essai du dépôt ne peut voir, puisque les deux barrières de Q-31 sont éprouvées en **simulant le motif en JavaScript sur des noms de fichier**, jamais sur l'entrée qu'Apache lui donne réellement pour `GET /`. Le reste de la chaîne, lui, est **bon** : 25 écrans, 0 violation CSP, 0 erreur ; `/api/**` relayé par `mod_proxy` répond ; les règles rsync copient 64 fichiers sur 64 sans intrus ; `-FollowSymLinks` refuse un lien symbolique. Second défaut de configuration : un essai du banc dépend de l'absence de `rsync` (**Q-37**). |
| **S18** | ❌ **EN ÉCHEC** | Le premier geste de tout utilisateur — **ouvrir l'application à son adresse** — n'aboutit pas : `http://hôte` → 308 → `https://hôte/` → **403 Forbidden**, page d'erreur d'Apache. Tous les autres gestes aboutissent, et je les ai joués derrière Apache : chargement, 25 écrans, création par formulaire réel, adresse recalée, suppression groupée, rechargement qui préserve une création bloquée. |

**Décompte** : **13 passés · 4 sans objet · 2 en échec (S17, S18)**.

---

## 5. Les constats neufs

La série continue après Q-35.

### Q-36 — 🔴 **BLOQUANT** — La liste blanche du vhost refuse la page d'accueil de l'application

**Ce qui se passe.** Le correctif du constat Q-31 a posé dans
`backend/deploy/apache/cyber-grc.conf` une liste blanche à motif **inversé** :

```apache
<FilesMatch "(?i)^(?!.*\.(html|js|css|svg|png|ico|jpg|jpeg|gif|webp|woff|woff2|webmanifest)$)">
    Require all denied
</FilesMatch>
```

Apache évalue un `<Files>`/`<FilesMatch>` sur le **dernier segment** de `r->filename`.
Pour une requête de répertoire — et `GET /` en est une — ce segment est la **chaîne
vide**. La chaîne vide ne se termine par aucun type publiable, la négation est donc
**vraie**, et `Require all denied` s'applique. L'autorisation est décidée avant
`mod_dir` : `DirectoryIndex index.html` n'est jamais atteint.

**Mesuré, sous Apache 2.4.58, avec les blocs extraits du fichier livré :**

```
=== ce qu'Apache rend, avec le vhost LIVRÉ ===
403  /                                  text/html; charset=iso-8859-1
200  /index.html                        text/html
200  /js/app.js                         text/javascript
200  /css/style.css                     text/css
200  /assets/logo/logo-dedienne.png     image/png
200  /api/sante                         application/json
200  /api/session                       application/json
403  /js/                               text/html; charset=iso-8859-1
403  /css/                              text/html; charset=iso-8859-1
403  /assets/                           text/html; charset=iso-8859-1
```

Journal d'erreur d'Apache :

```
[authz_core:error] AH01630: client denied by server configuration: /srv/cyber-grc-frontend/
```

**Dans un vrai navigateur**, contre le vrai serveur, derrière `mod_proxy` :

```
--- Chromium sur / ---
  statut HTTP      : 403
  état application : jamais chargée
  <title>          : 403 Forbidden
  corps            : Forbidden You don't have permission to access this resource.

--- Chromium sur /index.html ---
  statut HTTP      : 200
  état application : chargee
  <title>          : Cyber GRC — Dedienne Aerospace
  corps            : CYBER GRC · V4.1 PÉRIMÈTRE Essai Toulouse (ZZESSA) …
  erreurs script   : 0     violations CSP : 0
```

**La chaîne complète est cassée.** Le vhost `*:80` livré redirige en 308 vers
`https://%{SERVER_NAME}/$1` ; pour `http://hôte/`, la cible est `https://hôte/`, que le
vhost `*:443` refuse :

```
$ curl -s -D - http://127.0.0.1:18099/ | grep -i ^location
Location: https://127.0.0.1/          → puis 403
```

**Causalité établie par mutation, deux fois.** Le même vhost, privé **du seul** bloc de
liste blanche et de rien d'autre :

```
=== SANS la liste blanche (mutation) ===
/              -> 200        <!DOCTYPE html> …
/index.html    -> 200
/data/registre.xlsx -> 200   (c'est le défaut que Q-31 ferme, et il revient : les deux
                              vont ensemble, ce n'est PAS le correctif à annuler)
```

Et le vhost **d'avant le correctif** (révision `f0b4eec`) ne portait aucun `<FilesMatch>`
inversé : `/` rendait 200. **C'est donc une régression du correctif Q-31**, accepté au
6ᵉ passage.

**Pourquoi aucun essai ne pouvait le voir.** Les deux essais de `test/deploiement/` qui
éprouvent ce motif l'extraient du fichier livré — c'est la bonne méthode — puis le
jouent en JavaScript sur des **noms de fichier** :

* `frontend-publiable.test.mjs:143` « LES QUATRE NOMS DU CONSTAT, et douze contournements,
  sont refusés » ;
* `frontend-publiable.test.mjs:176` « CONTRÔLE SYMÉTRIQUE : treize noms légitimes restent
  servables » — `index.html`, `app.js`, `LOGO.PNG`… ;
* `frontend-publiable.test.mjs:212` « LES 64 FICHIERS RÉELLEMENT PUBLIÉS passent le motif ».

Aucun des trois ne donne au motif l'entrée qu'Apache lui donne pour l'adresse d'entrée du
produit, parce que cette entrée **n'est pas un nom de fichier** : c'est la chaîne vide.
La vérification que le motif se comporte comme prévu a donc porté sur ce qu'on savait
déjà nommer. C'est mot pour mot le corollaire que ce chantier a formulé : *la présence
n'est pas l'atteignabilité*, et *une couverture mesurée en gestes n'est pas une
couverture mesurée en états*.

Le contrôle prescrit à l'exploitant par `deploy/install.sh` ne le voit pas davantage :

```
alerte "  curl -o /dev/null -w '%{http_code}' https://<hôte>/index.html   → 200 attendu"
alerte "  curl -o /dev/null -w '%{http_code}' https://<hôte>/essai.xlsx   → 403 attendu"
```

Les deux passent. L'application est injoignable et l'installation se déclare vérifiée.

**Ce que le commentaire du vhost dit, et qui devient faux.** *« Ses deux modes d'échec
sont bruyants : un motif invalide fait échouer `apachectl configtest`, un motif trop
strict rend la page vide au premier chargement. »* Le motif est valide (`Syntax OK`,
mesuré), et la page n'est pas *vide* : elle est **403**, avec la page d'erreur d'Apache.
Le mode d'échec réel n'est ni l'un ni l'autre des deux annoncés.

**Reproduction complète** (aucune écriture dans le dépôt) :

```bash
apt-get install -y --no-install-recommends apache2      # 2.4.58
cp -r cyber-gouvernance_V4 /srv/cyber-grc-frontend && chmod -R a+rX /srv/cyber-grc-frontend
# vhost d'essai fabriqué en EXTRAYANT les blocs du fichier livré :
python3 scratchpad/s2vii/apache/fabriquer-vhost-complet.py /srv/cyber-grc-frontend <logs> 18090 <port-api>
apache2 -f <logs>/vhost-complet.conf -k start
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18090/            # 403
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18090/index.html  # 200
```

**Ce que je ne dis pas.** Je ne dis pas d'annuler le correctif Q-31 : la liste blanche
fait ce qu'on lui demande — `/data/registre.xlsx` et `/data/LISEZ-MOI.md` rendent bien
**403** sous Apache réel, et je l'ai mesuré. Le remède appartient à l'agent DÉPLOIEMENT,
et il doit être **éprouvé sous Apache**, pas raisonné : un motif qui exige au moins un
caractère avant l'extension, un `<Files "*">` complémentaire, ou une liste blanche
exprimée autrement. **Et l'essai qui l'accompagnera doit jouer la requête `GET /`, pas un
nom de fichier.**

---

### Q-37 — 🟠 majeur — Un essai du banc est vert parce qu'un binaire manque, et son contrôle symétrique ne prouve rien

`backend/test/deploiement/install-blocs.test.mjs:201`, « **CONTRÔLE SYMÉTRIQUE : une
racine web propre franchit le refus** ». Son commentaire dit sa raison d'être : *« Sans
cette moitié, les treize essais ci-dessus seraient satisfaits par un bloc qui refuse TOUT
— c'est-à-dire par une installation impossible. »*

Sa première assertion (ligne 207) est :

```js
assert.equal(issue.sortie.includes('fichier non publiable'), false, …);
```

Or le message de **succès** que le bloc imprime est :

```
  ok frontend : 3 fichier(s) publiés, aucun fichier non publiable
```

qui **contient** la chaîne cherchée. L'assertion n'est donc satisfaite que si le bloc
**meurt avant d'imprimer ce message** — ce qu'il fait sur la machine de développement,
faute de `rsync`. La ligne 219 le dit sans le voir :

```js
// Il s'arrête ensuite sur `rsync`, absent de cette machine — et c'est voulu :
assert.match(issue.sortie, /rsync/, `L'arrêt attendu est celui de la copie :\n${issue.sortie}`);
```

**Le vert de cet essai est une propriété de la machine, pas du produit.**

**Mesuré**, dans le dépôt, après `apt-get install rsync` (3.2.7) :

```
$ node --test "test/deploiement/install-blocs.test.mjs"
✖ CONTRÔLE SYMÉTRIQUE : une racine web propre franchit le refus (63 ms)
  AssertionError: Aucun de ces fichiers ne doit être refusé — le « .md » est toléré dans le dépôt :
    ok listes blanches du frontend alignées (html js css svg png ico jpg jpeg gif webp woff woff2 webmanifest)
    ok frontend : 3 fichier(s) publiés, aucun fichier non publiable
  true !== false
ℹ tests 20 · pass 19 · fail 1

$ npm test
ℹ tests 596 · pass 595 · fail 1
```

**Deux conséquences, et la seconde est la plus grave.**

1. **Le banc devient rouge sur la machine cible.** `install.sh` installe lui-même `rsync`
   (ligne 371 : `apt-get install … apache2 clamav clamav-daemon rsync`). Toute VM sur
   laquelle l'installation a tourné une fois fait échouer `npm test`. La définition de
   « terminé » du §5.3 — *« les tests passent »* — n'est donc pas tenue hors de la seule
   machine de développement.
2. **Le contrôle symétrique ne contrôle rien.** Un bloc qui refuserait *tout* mourrait
   lui aussi avant la copie, imprimerait « fichier non publiable : … », et l'essai
   rougirait — d'accord. Mais un bloc qui **n'imprime rien du tout**, ou qui échoue plus
   tôt pour n'importe quelle raison, satisfait la première assertion. La propriété
   annoncée — *« une racine web propre franchit le refus »* — n'est vérifiée par aucune
   des trois assertions : la première est satisfaite par un silence, la deuxième s'arrête
   avant la copie, la troisième affirme que la copie **n'a pas eu lieu**.

**Le refus de doubler `rsync` était juste, et je le confirme.** L'en-tête du fichier
l'argumente bien : *« Une doublure de `rsync` éprouverait ma compréhension de ses règles
de filtre, pas `rsync` […] Les simuler transformerait un "non vérifié" honnête en un
"vérifié" faux. »* C'est exact, et je l'ai vérifié autrement — en installant `rsync` et
en jouant les vraies règles, extraites du fichier :

```
liste lue dans install.sh : html js css svg png ico jpg jpeg gif webp woff woff2 webmanifest
dépôt : 64 fichiers publiables · cible : 64 · intrus : aucun · répertoires vides : aucun
```

Les règles sont bonnes. Ce qui ne l'est pas, c'est d'avoir bâti une assertion **sur
l'échec attendu** de la commande qu'on refuse de doubler : le refus honnête s'est
transformé en dépendance cachée. Le remède est étroit — une assertion sur le motif exact
`fichier non publiable : ` (avec ses deux points), et un essai qui accepte que la copie
ait lieu quand `rsync` est là.

---

### Q-38 — 🟠 majeur — Q-33 est inscrit « corrigé » au registre sans qu'un seul essai ait été écrit

Le registre de `docs/PLAN_EXECUTION.md` §7 porte, depuis le commit `41ed654` :

> | **Q-33** | **Trois remèdes antérieurs sans aucun essai** — recalage d'adresse (N-3), vidage (m-6), abandon avant transaction. […] | 🔵 mineur | agent **OUTILLAGE** | avant le 7ᵉ passage | ✅ **corrigé** |

**Les trois mutations du 6ᵉ passage, rejouées une par une dans ma copie, laissent le banc
vert.**

| Remède | Mutation appliquée | Banc |
|---|---|---|
| Recalage de l'**adresse** après renommage (`js/core/sync.js:565`) | `history.replaceState(…)` neutralisé | `test/navigateur/` **50/50** — et **594/596** sur la suite entière, les deux échecs étant mon propre fichier de secours (§2.3) |
| Vidage de la file **avant** rechargement (`js/core/sync.js:1650`) | `if (aDesModificationsEnAttente()) await cycle();` retiré de `rechargerApresEcriture` | `test/navigateur/` **50/50** |
| Contrôle d'abandon **avant transaction** (`src/api/index.ts`) | `if (abandonne()) signalerAbandon('avant transaction');` neutralisé | `test/api/` **172/172** |

Et la preuve documentaire est plus simple encore :

```
$ git log --oneline f0b4eec..HEAD -- 'backend/test/*'
0157b30 Q-35 : install.sh est enfin joué — 596 verts, et deux refus de porter
a92580e Les trois essais du 6e passage — 571 verts, et deux d'entre eux avaient tort
8c2ba9b Instantané en vol : les essais du 6e passage — 564 verts

$ grep -rn "Q-33" backend/test/
(rien)
```

Les trois commits d'essais couvrent **Q-29, Q-30, Q-32** (bascule) et **Q-31, Q-35**
(déploiement). **Aucun ne touche Q-33.** Le constat est passé de « sans état » à
« ✅ corrigé » dans le commit de tenue du registre, et rien d'autre n'a bougé.

**Pourquoi c'est majeur alors que le constat d'origine était mineur.** Le produit est
juste — les trois remèdes sont en place, je l'ai relu. Ce qui est faux, c'est **l'état au
registre**, et le registre est le document que le `CLAUDE.md` §8 désigne comme *« la seule
source des verdicts »*, en ordonnant d'y lire *« la colonne d'état »*. Une coche verte y
vaut désormais pour un lecteur de la vague 3 : il ne cherchera pas. C'est mot pour mot le
constat **Q-32** — *« Q-23 fermé en apparence »* — reproduit un passage plus tard, dans un
constat qui portait lui-même sur une absence de couverture, et qui avait été classé
mineur *parce que* « c'est la couverture qui manque, pas le comportement ». Elle manque
toujours.

Le 6ᵉ passage avait par ailleurs écrit ce qu'il fallait en faire : *« le premier tombe
pile dans le périmètre du filet de la vague 3 (**Q-16**) : il devrait y être ajouté
nommément. »* Ce renvoi non plus n'a pas été porté.

---

### Q-39 — 🔵 mineur — La « référence » d'un incident est choisie par le client

`backend/src/serveur.ts:69` déclare `requestIdHeader: 'x-request-id'`. Fastify lit alors
cet en-tête **de la requête** et en fait `request.id` ; `genReqId` n'est appelé qu'à
défaut. Or `request.id` est ce que l'API rend au client sous le nom `reference`
(`src/api/index.ts:432` et `:444`, `src/serveur.ts:144` et `:153`) **et** ce que le
journal technique porte comme identifiant de corrélation.

**Mesuré, contre le serveur réel :**

```
sans en-tête   : "558c71b7-5937-4786-9cbc-dc15e3bb5836"
x-request-id (31 signes)   → réponse : IDENTIQUE au choix du client  [RÉFÉRENCE-CHOISIE-PAR-LE-CLIENT]
x-request-id (2000 signes) → réponse : IDENTIQUE au choix du client  [aaaa…]
x-request-id (16 signes)   → réponse : IDENTIQUE au choix du client  [../../etc/passwd]
deux requêtes, même référence imposée : "MEME-REFERENCE" / "MEME-REFERENCE"
```

**Et l'en-tête traverse le frontal livré.** Le vhost efface `X-Forwarded-For`,
`X-Forwarded-Host`, `X-Forwarded-Server`, `X-Real-IP` et `Forwarded` — pas
`X-Request-Id` :

```
à travers Apache : 400 "REFERENCE-FORGEE-PAR-LE-CLIENT"
Apache a-t-il retiré l'en-tête ? NON — elle traverse
```

**Conséquence aujourd'hui, et pourquoi elle est mineure.** Rien ne fuit et rien ne
s'écrit de travers : la valeur est encodée en JSON par pino, aucune injection de
structure n'est possible, et le frontend n'affiche pas cette référence. Ce qui est perdu
est la **traçabilité** : deux requêtes peuvent porter la même référence, et un exploitant
à qui l'on donne une référence pour retrouver un incident peut en trouver dix, ou zéro.

**Pourquoi je le consigne quand même.** Le `CONVENTIONS.md` §17.8 énonce la règle exacte
que ce chemin enfreint — *« l'acteur d'une entrée de journal n'est pas fourni par le
client »* — et la fait tenir **par la base**. Le lot **L5** doit écrire au journal
d'audit, qui est *inaltérable* et sert de preuve en audit ISO 27001 : si la référence de
requête y entre, une valeur choisie par le client entre dans un enregistrement qu'on ne
peut plus corriger. **C'est une condition d'entrée de L5**, pas un défaut de L2 : à
traiter là, soit en n'acceptant l'en-tête que d'un frontal de confiance, soit en le
retirant dans le vhost, soit en repassant à `requestIdHeader: false`.

---

### Q-40 — 🔵 mineur — Le registre a une case d'état vide, et c'est celle qu'on ordonne de lire

La ligne **Q-28** de `docs/PLAN_EXECUTION.md` §7 n'a que **six** barres verticales là où
les trente-quatre autres en portent **sept** : la colonne « État » est absente.

```
$ grep -n "^| \*\*Q-" docs/PLAN_EXECUTION.md | while read -r l; do
    echo "$(echo "$l" | grep -o '|' | wc -l)  ${l:0:24}"; done
7  416:| **Q-1** | Le géné
…
7  442:| **Q-27** | **Une éc
6  443:| **Q-28** | **`LONGU
7  444:| **Q-29** | 🛑 **Le c
…
```

Rendu en Markdown, la cellule est vide. Le `CLAUDE.md` §8 dit pourtant : *« Y lire la
**colonne d'état** : un constat n'en sort que corrigé *et* rejoué ».* Pour Q-28 il n'y a
rien à lire. Le constat a bien un propriétaire (agent API) et une échéance (vague 3) — il
n'est donc pas « perdu » au sens de la leçon du chantier — mais l'unique colonne que le
document normatif ordonne de consulter est absente pour lui. Une barre verticale.

---

### Q-41 — 🔵 mineur — Q-4, sixième signalement : le §5 du `README` décrit un banc qui n'existe plus

Le 6ᵉ passage a fermé Q-34 sur son objet : `006_entropie_et_commentaires.sql` est
désormais nommé dans `README.md` et `CHANGELOG.md`, et le compte de migrations est juste
(**6**). Je l'ai vérifié.

Mais **quatre commits plus tard**, le §5 décrit un banc qui n'existe plus :

| Ce que `README.md` §5 annonce | Ce que la machine rend |
|---|---|
| `npm test  # 564 essais : base, API, reprise, navigateur` (ligne 502) | **596** essais |
| « #### **Quatre** familles d'essais » (ligne 536) | **cinq** — `test/deploiement/` est né en `0157b30` |
| `test/navigateur/` : **43** | **50** |
| `test/deploiement/` : *absent* | **25 essais**, ceux qui portent Q-31 et Q-35 |

Le §8, lui, **nomme honnêtement son point de mesure** (`c37d655`, 564 essais) et prévient
qu'un total différent n'est pas une contradiction — c'est la bonne pratique, et elle
tient. Le §5, en revanche, n'est pas une mesure datée : c'est une **instruction** et une
**description de structure**, et les deux sont fausses. Un agent de la vague 3 qui ouvre
le `README` pour savoir ce que le banc couvre n'y trouvera pas la famille d'essais qui
garde la racine web contre le retour de quatre classeurs de données client.

C'est le **sixième** signalement de la même famille. Je ne propose pas de mieux le
surveiller : je propose que le §5 cesse de recopier des chiffres et renvoie au §8, qui
porte déjà la discipline du point de mesure.

---

## 6. Observations qui ne méritent pas de numéro

* **Q-9 / Q-20 : le report tient, mais l'atténuation porte sur le verdict, pas sur la
  disponibilité.** Mesuré : dix reprises simultanées de 6 000 enregistrements → 10 × 200 ;
  cinq lectures ordinaires pendant ce temps → **5 × 503** après ≈ 5 s. Le 500 « erreur
  interne » a bien disparu (c'était l'objet de Q-20). Mais le 6ᵉ passage mesurait
  « 3 en 503, 2 en 200 » ; je mesure **5 sur 5 refusées**. La disponibilité pour les
  autres utilisateurs pendant un gros import reste donc entière à traiter, et c'est bien
  le fond que **L7** porte (reprise fractionnée). Je maintiens le report **défendable** —
  le remède est de la taille d'un lot — mais je refuse la lecture « Q-20 a réparé la
  saturation » : il a réparé le **message**.
* **L'essai de Q-29 porte deux propriétés sous un seul nom.** Neutraliser la préservation
  et supprimer le bouton « Envoyer à nouveau » font tomber le **même** essai, avec le même
  message (« la saisie reste »). Les deux mordent, c'est l'essentiel ; mais le jour où le
  bouton disparaîtra, le message d'échec parlera d'autre chose. Deux essais vaudraient
  mieux qu'un.
* **Q-8 n'a toujours aucun essai de performance.** Observation reprise du 6ᵉ passage,
  toujours vraie : la mesure « 3 ms au lieu de 41 » ne vit que dans un commentaire.
* **`rafraichir` rend un drapeau `tronque` qu'un seul essai regarde, et dans le sens du
  silence** : `routes.test.mjs:139` vérifie `corps.tronque === false`. Le chemin où il
  vaut `true` — plus de 2 000 enregistrements modifiés depuis le dernier sondage, donc
  `rechargerApresEcriture()` côté navigateur — n'est exercé par rien. Ce n'est pas la
  famille piégeuse d'`exigerSilence` (c'est une valeur, pas un avertissement), mais c'est
  une branche non couverte du sondage.
* **`cibleDuChamp` ne filtre pas la traçabilité sur la table seconde.** La branche
  `d.seconde.champs.includes(champ)` ne vérifie ni `COLONNES_TRACABILITE`, ni `filiale_id`,
  ni `engendree` — seulement `colonnesReservees`. Elle est **inatteignable aujourd'hui**
  (la liste close vaut `['statut','maturite','responsable','commentaire']`) et le
  garde-fou (g) de `verifierRegistre` rattraperait un ajout fautif, mais **par accident** :
  parce que les cinq colonnes de traçabilité existent aussi dans `mesure_catalogue`, donc
  la règle « existe dans les deux tables sans réserve » se déclenche. Une protection qui
  ne tient que par une coïncidence de schéma.
* **Les clés d'enveloppe inconnues sont retirées en silence** (`removeAdditional` de
  Fastify) — observation du 6ᵉ passage, toujours vraie, toujours sans conséquence de
  sécurité : je l'ai re-sondée avec `perimetre`, `filiale`, `administrationGroupe` en
  enveloppe, aucune n'atteint quoi que ce soit.
* **`-FollowSymLinks` fonctionne**, et c'est la première fois qu'on le mesure : un
  `lien.html → /etc/passwd` déposé dans la racine web rend **403**. À noter tout de même :
  `frontend_intrus` et les compteurs d'`install.sh` emploient `find -type f`, qui ne voit
  pas les liens symboliques — un lien de type publiable serait donc copié par `rsync -a`
  sans être compté ni signalé. Il est inerte grâce à `-FollowSymLinks`, mais la défense
  repose alors sur une seule barrière.
* **Le contrôle de matière de la CSP reste un `includes`.** Observation reprise deux fois ;
  ma marche des écrans emploie la CSP **posée par Apache depuis le fichier livré**, ce qui
  couvre enfin la première moitié du risque pour de bon.

---

## 7. Ce que j'ai cherché et n'ai pas trouvé

Pour que le huitième passage, s'il a lieu, aille chercher ailleurs. Chaque ligne est un
échec de ma part, et c'est ce qui la rend utile.

* **Une valeur du navigateur qui atteint un réglage de session** — 22 formes d'entête, 7
  paramètres d'URL, 7 enveloppes de corps, un cookie composite. Rien. Et il n'existe pas
  de chemin *structurel* : `resoudre()` est sans argument, et la seule autre entrée est
  l'environnement du processus.
* **Une injection SQL** — 44 noms d'entité, 18 noms de champ, 13 valeurs sur `?depuis=`,
  pollution de prototype. Rien ne fuit, rien ne s'exécute, le compte de tables et de
  lignes est identique avant et après.
* **Un franchissement de la frontière de filiale par l'API** — `PUT` sur une ligne de la
  filiale voisine rend **404**, indiscernable au gabarit près d'un identifiant inexistant.
* **Une altération du journal d'audit** — `update`, `delete`, `truncate` refusés en
  **42501** sous `grc_app` et en **`GRC01` sous le propriétaire** ;
  `f_journal_audit_verifier()` rend 0 ligne.
* **Un garde-fou décoratif** — j'en ai débranché **cinq**, de cinq façons différentes ;
  les cinq font échouer le déploiement ou le démarrage.
* **Une borne du moteur qui ne mordrait pas** — je les ai toutes franchies, une par une,
  et j'ai vérifié le pas juste en dessous pour chacune.
* **Un secret** dans les fichiers suivis, dans une réponse, dans un message d'erreur, dans
  le vhost ou dans l'unité systemd.
* **Un fichier non publiable dans la racine web** — 65 fichiers, 6 extensions, toutes sur
  la liste blanche sauf un `.md` explicitement toléré et jamais copié (mesuré : `rsync`
  réel, 64 sur 64, 0 intrus).
* **Une divergence entre ce que `rsync` copie et ce qu'Apache sert** — les deux listes
  blanches sont égales, et je les ai jouées toutes les deux pour de bon, chacune avec son
  outil réel. C'est la seule moitié de Q-31 qui soit intégralement démontrée.
* **Une capture d'identifiant en fermeture dans les 26 modules** — `const/let/var id =
  <objet>.id` : **aucune occurrence**. La convention du `dataset.id` est tenue (39
  navigations).
* **Une violation de CSP ou une erreur de script sur les 25 écrans** — sous un Apache réel,
  avec les 9 en-têtes du fichier livré : **0 écran vide, 0 erreur, 0 violation**.
* **Une modification du dépôt par mes propres essais** — `git status --porcelain` vide du
  début à la fin.

---

## 8. Ce que je n'ai pas pu vérifier

* **Debian 13 et PostgreSQL 17** : tout a été joué sur **Ubuntu 24.04**, **PostgreSQL
  16.13**, **Apache 2.4.58**. La cible porte PostgreSQL 17 et l'Apache de Debian 13
  (2.4.6x). Le comportement de `<Files>` sur un basename vide est un invariant ancien
  d'`ap_file_walk` et je ne connais pas de version où il diffère — mais **je l'ai mesuré
  sur 2.4.58, pas sur celle de Debian 13**, et Q-36 doit être re-mesuré là-bas au moment
  du correctif.
* **Le TLS, `mod_deflate`, `ExpiresByType`** : mon vhost d'essai n'a ni certificat ni ces
  deux modules. Les blocs de cache ont été extraits et chargés, mais leur effet n'est pas
  éprouvé.
* **`deploy/install.sh` en entier** : j'en ai joué le bloc `frontend` (par les essais du
  dépôt et par `rsync` réel), le bloc `proxytimeout` (par les essais), et les fonctions
  `jeton_frontend` / `injecter_jeton_frontend` — **que le 6ᵉ passage n'avait pas fait
  tourner** : jeton stable entre deux appels (`1.4.2.5d619cab6f70`), **61 URL versionnées**
  sur les 61 attendues, et un second passage sur une page déjà versionnée **échoue
  bruyamment**, ce qui est le bon comportement. Le reste (systemd, PostgreSQL, ClamAV, les
  secrets) exige root sur une VM propre et n'a pas été joué.
* **L'Active Directory, ClamAV, le relais SMTP** : hors périmètre du lot et absents.
* **Le comportement au volume réel côté navigateur** : mes mesures de reprise sont
  serveur. Je n'ai pas rejoué le sondage sur une filiale de 12 000 enregistrements.
* **La latence du VPN** : toutes mes mesures sont locales.
* **La validation du découpage Groupe/Filiale par le RSSI groupe** (risque P5) : toujours
  aucune trace dans le dépôt, et toujours attendue **avant la mise en service pilote**.
  C'est le septième passage de porte qui l'écrit.

---

## 9. Ce qu'il faut faire, et quand

| # | Constat | Propriétaire | Échéance | Ce que ça coûte |
|---|---|---|---|---|
| **Q-36** | La liste blanche du vhost rend 403 sur `/` | agent **DÉPLOIEMENT** (le motif) · agent **OUTILLAGE** (l'essai qui joue `GET /`) | **à la fermeture de cette porte** — c'est le bloquant | un motif, et un essai qui interroge une **URL**, pas un nom de fichier |
| **Q-37** | Un essai vert parce que `rsync` manque ; le contrôle symétrique ne prouve rien | agent **OUTILLAGE** | **à la fermeture de cette porte** | une assertion resserrée (`fichier non publiable : `), et accepter que la copie ait lieu |
| **Q-38** | Q-33 inscrit « corrigé » sans un essai ; les trois mutations ne mordent pas | agent **OUTILLAGE** (les essais) · **orchestrateur** (l'état au registre) | **à la fermeture de cette porte** | trois essais, et une case d'état remise à la vérité |
| **Q-39** | La référence d'un incident vient du client | **lot L5** (journal d'audit) · agent **DÉPLOIEMENT** si l'on préfère l'effacer au vhost | **condition d'entrée de L5** | une ligne, ici ou là |
| **Q-40** | La case d'état de Q-28 est vide au registre | **orchestrateur** | immédiat | une barre verticale |
| **Q-41** | `README` §5 : « 564 essais », « quatre familles » | agent **DOC** | avant l'ouverture de la vague 3 | renvoyer au §8 au lieu de recopier |
| Q-9 / Q-20 | fond de la saturation | **lot L7** | vague 5 | report **défendable** — voir la nuance du §6 |
| Q-10 | analyse de corps avant décision | **lot L3** | vague 3 | report **défendable**, re-mesuré (facteur 7) |
| Q-16 | les 26 modules sans filet | **vague 3** | ouverture de la vague 3 | report **défendable** ; **y joindre nommément les trois remèdes de Q-38** |
| Q-28 | `LONGUEUR_ALEA` dupliquée dans `src/reprise` | agent **API** | vague 3 | report **défendable**, rien ne casse |

---

## 10. Ce qui est solide, et qu'il faut dire

Un rapport qui refuse une porte doit dire ce qu'il a essayé de casser sans y parvenir,
sans quoi son verdict est un caprice.

* **Le cœur serveur ne bouge pas, et cela fait trois passages que ce constat se répète.**
  111 sondes hostiles : ni le périmètre, ni une frontière de filiale, ni une requête SQL
  n'ont bougé. Le périmètre est tenu par la **forme**, pas par la vigilance.
* **Le cloisonnement tient sous sabotage.** 107/107 au vert ; le retrait d'un seul
  `force row level security` fait tomber la démonstration à 103/107 avec quatre contrôles
  nommés, **code 3** et la phrase « CLOISONNEMENT EN DÉFAUT », et fait sortir
  l'installateur en **code 7**.
* **Cinq garde-fous, cinq débranchements, cinq refus.** Point d'appel du schéma,
  couverture RLS, entropie SQL, entropie TypeScript, déterminisme de la ré-émission : deux
  refusent le déploiement, deux empêchent le démarrage du service.
* **Vingt-cinq mutations et sabotages sur vingt-neuf mordent**, et plusieurs mordent large : la
  suppression du rejeu dangereux fait tomber quatre essais, l'affaiblissement de la borne
  de reprise en fait tomber huit. Les trois qui ne mordent pas sont **les trois du même
  constat**, Q-33.
* **Le chemin complet, sous Apache réel, est bon partout ailleurs que sur `/`.** 25
  écrans, `mod_proxy` qui relaie l'API réelle, la CSP posée par Apache depuis le fichier
  livré : **0 écran vide, 0 erreur de script, 0 violation**. Les en-têtes de sécurité
  sortent tels que le fichier les déclare, et les 8 réponses d'API portent `nosniff` et
  `no-store`.
* **Les deux barrières de Q-31 font ce qu'on leur demande.** Sous Apache réel :
  `/data/registre.xlsx` → **403**, `/data/LISEZ-MOI.md` → **403**, un lien symbolique
  `.html` → **403**. Avec `rsync` réel : 64 fichiers publiables entrés, 64 sortis, aucun
  intrus, aucun répertoire vide. Le remède au constat Q-36 ne doit pas défaire cela.
* **Le correctif Q-29 tient, y compris sur le geste que le produit recommande.** Recharger
  après une création bloquée **préserve** la saisie ; le bouton « Envoyer à nouveau » rend
  la main à l'utilisateur ; et le rejeu automatique, remis en place par mutation, fait
  tomber quatre essais. Le bloquant du 6ᵉ passage est réellement fermé.
* **`install.sh` est enfin joué**, et ses trois marqueurs d'extraction sont une bonne
  idée : la vingtaine d'essais de `test/deploiement/` attrapent le retour d'un classeur
  dans la racine web, la divergence des deux listes blanches et la dérive du
  `ProxyTimeout`. Un seul d'entre eux est faux, et c'est Q-37.

---

*Fin du rapport du septième passage de la porte S2.*
