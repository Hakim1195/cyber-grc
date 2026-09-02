# Porte de sécurité S2 (9ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-NONIES**, agent indépendant. Je n'ai écrit aucune des lignes
> examinées, ni aucun des quatorze rapports précédents. Travail en **lecture seule** sur
> le dépôt : le seul fichier que je crée est celui-ci, et toutes mes mutations ont vécu
> dans une copie hors dépôt (`…/scratchpad/s2ix/copie`) ou dans des répertoires jetables
> de `/tmp`.
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, révision
> examinée **`fe3087c`** (« Q-48, Q-49, Q-52 fermés — et un compte qui vient enfin de
> l'exécution »), arbre **propre** au début comme à la fin.
>
> Références : `docs/PLAN_EXECUTION.md` §4 (les dix-huit contrôles), §5 (définition de
> « terminé »), §7 (journal des portes, registre des **cinquante-trois** constats) ;
> `docs/securite/RAPPORT_S2_OCTIES.md` ; `backend/db/CONVENTIONS.md` §16 à §24 ;
> `backend/README.md` §8 ; `docs/PLAN_SERVEUR.md`.
>
> Date : 02/09/2026.

---

## 1. Le verdict

> ### ❌ **PORTE REFUSÉE** — **0 bloquant**, **4 majeurs**, **6 mineurs**. **Deux contrôles de la grille sont en échec : S12 et S18.**

Il faut commencer par ce qui tient, parce que c'est beaucoup, et parce qu'un refus qui ne
dit pas ce qu'il n'a pas su casser est un caprice.

**Le cœur du lot ne bouge pas.** 157 sondes de périmètre — six familles d'en-têtes, six
cookies, sept formes de requête — n'ont déplacé ni la filiale active, ni le périmètre de
lecture, ni le drapeau d'administration. La charge utile d'une filiale ne porte **aucune**
chaîne de la filiale voisine (six témoins négatifs, trois témoins positifs). Vingt-et-un
noms d'entité hostiles, quatre identifiants injectés sur le **chemin d'écriture** et cinq
noms de champ hostiles : 48 tables avant, 48 après. Six champs techniques —
`version`, `cree_le`, `cree_par`, `modifie_par`, `id`, `filiale_id` — sont **refusés**, pas
ignorés. Le verrouillage optimiste rend 409 + `GRC03` avec la version courante. Le
cloisonnement rend **107/107** et tombe à **104/107, code 3** au retrait d'un seul
`force row level security`. Le journal refuse `UPDATE`, `DELETE` et `TRUNCATE` **au
propriétaire**. Une reprise dont une ligne sur trois est fautive n'écrit **rien** — ni les
lignes valides, ni la trace d'import.

**Et trois fermetures que personne n'avait encore rejouées tiennent.** Q-45 : j'ai
**retiré l'entrée `/etc/hosts`** dont le banc dépendait, et le banc entier rend
**640 · 640 · 0** — la barrière posée dans `before()` est réelle, pas une consigne. Q-46 :
une route neuve portant un `onclick=` fait **rougir** le balayage, qui la découvre dans
`js/app.js`. Q-31 : un classeur redéposé sous `cyber-gouvernance_V4/` arrête le banc en le
nommant. Q-36 est fermé et je l'ai vérifié **sur l'URL d'entrée**, pas sur `/index.html` :
`http://hôte` → 308 → `https://hôte/` → **200**.

**J'ai aussi fait, pour la première fois de ce chantier, ce que le contrôle S17 demande en
une seule pièce** : Chromium réel → **Apache réel sur le vhost du dépôt** → serveur réel →
PostgreSQL. L'application démarre, **zéro erreur de console, zéro violation de CSP** ;
créer, recharger et supprimer aboutissent. Le banc, lui, ne joint jamais ces trois moitiés
(constat Q-62).

Ce qui refuse la porte, ce sont quatre défauts d'une même famille — **une phrase vraie
d'un geste et fausse d'un autre**, et **trois instruments qui disent « ok » sur ce qu'ils
ne regardent pas** :

| # | Constat neuf | Gravité |
|---|---|---|
| **Q-54** | **Le garde-fou du registre reste vert quand on ampute la FIN du tableau.** Il détecte les trous dans la numérotation, jamais la troncature. Mesuré : **13 lignes retirées d'un coup — Q-41 à Q-53, dont cinq majeurs — et les quatre essais restent verts, 4/4**. Le plancher `>= 40` est la seule limite. Or les lignes de queue sont **exactement celles du dernier passage** : les plus récentes, les moins connues, celles qu'un lecteur de la vague suivante ne saura pas chercher. C'est le constat Q-47 dans son propre remède | 🟠 majeur |
| **Q-55** | **Le gestionnaire d'erreurs de RACINE rend le code interne et le message ANGLAIS du cadre.** `POST /api/inconnue` avec `{"a":` rend `{"erreur":"FST_ERR_CTP_INVALID_JSON_BODY","message":"Body is not valid JSON but content-type is set to 'application/json'"}` — **derrière Apache, en `NODE_ENV=production`, sans authentification**. Le greffon, lui, normalise (`donnee_invalide`, en français) : la traduction existe, elle n'est pas appelée là. Pendant ce temps le vhost efface `X-Powered-By`, pose `ServerTokens Prod` et écrit « on ne renseigne pas l'attaquant sur la pile logicielle (S12) ». **Contrôle S12 en échec** ; règle §5.5 (« messages d'erreur en français ») enfreinte | 🟠 majeur |
| **Q-56** | **Le cinquième annuaire, et il garde la barrière née de Q-39.** Le bloc `banc: entetes` d'`install.sh` prétend confronter au réel « tout en-tête que `src/` lit » ; son motif ne reconnaît qu'**une écriture**, `requete.headers['…']` en apostrophes. Mesuré : trois en-têtes neufs posés en **guillemets doubles**, en **gabarit** et par **destructuration** — et le bloc imprime **« ok en-têtes : tout ce que le service lit est effacé ou reposé par le vhost »**, code 0. L'essai « E — LE SEPTIÈME EN-TÊTE ne manquera pas » passe parce qu'il écrit le sien dans la seule orthographe visée. Aucun linter n'impose la forme, et `src/serveur.ts` porte déjà `headers["set-cookie"]` | 🟠 majeur |
| **Q-57** | **« Rechargez la page » détruit la saisie que la même phrase promet de conserver.** Le bandeau réellement affiché sur une création incertaine dit, dans un seul paragraphe : *« … rechargez la page avant de recommencer. Votre saisie reste à l'écran et n'est plus renvoyée ; le rechargement la conserve. »* Mesuré dans Chromium, derrière Apache, contre le serveur réel : **bouton « Recharger les données » → conservée (1) ; F5 → PERDUE (0), zéro bloqué, zéro incident, bandeau VIDE**. Le remède de Q-29 couvre le bouton ; il n'a pas touché la phrase qui nomme l'autre geste, et **aucun essai ne le joue**. **Contrôle S18 en échec** — la grille nomme « recharger » parmi les gestes qui ne doivent rien détruire | 🟠 majeur |
| **Q-58** | **La phrase qui justifie le report de Q-51 n'a jamais été mesurée derrière Apache.** Le vhost écrit que la borne applicative « voit le corps réel quel qu'en soit l'encodage, et **rend 413** ». Mesuré : le service rend bien 413 (journal `statusCode:413`), **mais Apache le jette** (`AH01097: pass request body failed`) et le client reçoit **502**. Et le frontal n'a **aucune** borne sur un corps `chunked` : **1 073 741 824 octets relayés en 1,2 s**, sans authentification. Q-51 écrit « 28 Mio passent » ; c'est sans limite | 🔵 mineur |
| **Q-59** | **Q-4, huitième signalement.** `README` §5 et §8 et le `CHANGELOG` annoncent **637 essais, six familles** ; la mesure à `fe3087c` rend **640, sept familles**. Le §5 explique même que la septième, `test/depot/`, « est en vol […] pas dans la révision mesurée » — **or c'est le commit qui porte cette phrase qui l'a commitée**. Tous les autres chiffres du §8 sont exacts, rejoués | 🔵 mineur |
| **Q-60** | **Le garde-fou de Q-52 ne couvre pas la moitié du dépôt qui casse le plus visiblement.** Il lit les imports relatifs de `.ts/.mjs/.js`, et exclut par écrit ce dont « les chemins sont calculés ». Les **59 `<script src="…">` d'`index.html` sont des chemins littéraux** : ni couverts, ni nommés dans les exclusions. Mutation : balise ajoutée vers un fichier non suivi → `test/depot/` reste **3/3 vert**, alors qu'à cette révision l'application ne démarre pas | 🔵 mineur |
| **Q-61** | **Le filet `decisives()` du banc Apache compare 46 des 99 directives.** Son commentaire annonce comparer « les directives de décision » ; sa liste écrite à la main ignore `RewriteCond`/`RewriteRule`, `ProxyPass`, `ProxyPreserveHost`, `SSLEngine`, `SSLHonorCipherOrder`, `RequestReadTimeout`, `LimitRequestLine`, `ExpiresByType`, `AddOutputFilterByType`, `TraceEnable`, `ServerTokens` — c'est-à-dire **les remèdes de Q-42, Q-43 et Q-44**. Mutation : trois décisions réécrites par substitution → **le filet ne dit rien** ; seules deux tombent, et par des essais de comportement | 🔵 mineur |
| **Q-62** | **Aucun essai ne joint les trois moitiés du contrôle S17.** `test/navigateur/` monte Chromium contre un relais Node qui appelle Fastify par `inject()` — **sans TCP et sans Apache** ; `test/deploiement/` monte un Apache réel contre une **doublure** d'API. Le chemin complet n'est établi que par la mesure que chaque auditeur refait à la main — la forme même de « une réserve écrite n'est pas une réserve traitée » | 🔵 mineur |
| **Q-63** | **La réserve « systemd absent » est reconduite alors que l'outil qui en lève une moitié est installé.** `systemd` n'est pas PID 1, c'est exact ; mais **`systemd-analyze verify` fonctionne sur cette machine** et n'avait jamais été lancé. Je l'ai fait : l'unité livrée est **valide, sans un avertissement**. C'est la leçon du 7ᵉ passage, non appliquée à systemd | 🔵 mineur |

**Pourquoi je ne conclus pas « franchie ».** Deux contrôles de la grille sont en échec, et
la règle est celle que l'orchestrateur a appliquée deux fois — au 4ᵉ passage de S1 et au
2ᵉ de S2 : *un contrôle en échec ne se franchit pas*. **S12** exige un « message générique
côté client » ; à trois routes près, c'est le message du cadre, en anglais, qui sort.
**S18** exige que les gestes réels de l'utilisateur — la grille écrit « recharger » — « ne
détruisent rien » ; le geste que le produit recommande en toutes lettres détruit une
création bloquée, et l'application n'en dit plus un mot ensuite. Je n'ai pas la latitude
de requalifier cela en réserve : ce chantier a écrit noir sur blanc, trois fois, ce que
valent les réserves.

**Le corollaire que j'ajoute à la liste du §7**, puisqu'il m'est demandé d'en ajouter un :

> **Un remède qui redéfinit un mot doit corriger toutes les phrases qui l'emploient — y
> compris celles qu'il n'a pas écrites.** Le remède de Q-29 a donné à « recharger » un
> sens sûr (le bouton) sans toucher la phrase, écrite une couche plus haut, qui nomme le
> sens dangereux (la page). Le 6ᵉ passage avait formulé la moitié de cette règle — *« un
> même mot, vrai à un endroit et faux à l'autre, voyage d'autant mieux qu'on a pris soin
> de n'en avoir qu'un »* — et le remède l'a enfreinte **dans le paragraphe qu'il venait
> d'écrire**, en ajoutant « le rechargement la conserve » deux clauses après « rechargez
> la page ».

**Ce que j'ai essayé de casser sans y parvenir** : le périmètre (157 sondes), le
cloisonnement de la charge utile (6 témoins), l'injection SQL (30 formes), les champs
techniques en écriture (6 refusés sur 6), le verrou optimiste, le journal en ajout seul,
les garde-fous du schéma (un débranché → `migrate.mjs` code 7, `controle_disparu`), le
générateur d'identifiants (saboté à 3 valeurs → 7 essais rouges **et** le type-check),
l'intégrité d'une reprise fautive, la liste blanche du frontal (9 formes d'URL), les
en-têtes de sortie sur succès **et sur erreur**, `TRACE` → 405, la bannière réduite à
« Apache », `npm run verifier-types` (0 erreur) et `npm audit --omit=dev` (0
vulnérabilité).

---

## 2. Comment cette porte a été jouée

Rien de ce qui suit ne repose sur la lecture seule ni sur la démonstration de l'auteur du
code. Chaque affirmation porte la commande qui la produit.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2ix`**, neuve (`bash db/dev/preparer_base_dev.sh --base grc_audit_s2ix --recreer`), deux filiales semées par le **compte applicatif** sous périmètre, plus les bases jetables d'`ouvrirBaseEssai` |
| Copie de travail | **Copie complète du dépôt hors du dépôt** (`…/scratchpad/s2ix/copie`, `node_modules` en lien symbolique), où vivent toutes mes mutations de fichiers suivis |
| Serveur | Le vrai `dist/serveur.js`, lancé par son chemin de démarrage réel, en **`developpement`** et en **`production`** ; plus `lancerServeurProcessus()` pour les sondes de bornes |
| **Apache** | **Le mien**, 2.4.58, monté sur `deploy/apache/cyber-grc.conf` **et** `durcissement-global.conf`, avec **neuf substitutions déclarées** (ports, racine, certificat, cible du mandataire) et un filet de comparaison **plus large que celui du banc** (58 directives de décision confrontées ligne à ligne ; un seul écart, le port de la redirection, qui est la substitution elle-même) |
| Navigateur | Chromium (Playwright global), piloté **contre mon Apache**, pas contre le relais du banc |
| Sondes écrites par moi | 157 sondes de périmètre, 30 formes d'injection, 6 sondes de corps (dont une en `Transfer-Encoding: chunked` jusqu'à 1 Gio), 9 formes d'URL, 3 sondes de latence, 2 scénarios navigateur |
| Mutations | 9 mutations de fichiers suivis (dans la copie), 3 sabotages de schéma sur base vivante, 1 mutation d'`/etc/hosts`, 1 mutation de configuration Apache |

### Ce que j'ai vérifié de mon propre outillage avant d'accuser le code

C'est la règle du chantier, et elle m'a évité d'écrire **quatre** sottises, dont deux
auraient été des constats sérieux.

1. **Ma première sonde `curl` mesurait le mandataire de l'environnement, pas le produit.**
   J'avais écrit `--noproxy *` **sans quotes** : le shell a développé l'étoile en noms de
   fichiers, l'option est devenue inopérante, et j'ai lu `403 host_not_allowed`,
   `x-deny-reason: host_not_allowed` et « 200 Connection Established » sur **toutes** mes
   requêtes — y compris sur l'URL d'entrée. Cela ressemblait trait pour trait à une
   aggravation du bloquant Q-36. `--noproxy '*'` corrigé, tout est rentré dans l'ordre.
   C'est exactement le piège que le 8ᵉ passage avait rencontré sous une autre forme.

2. **Ma sonde de fuite inter-filiale ne mordait pas au sabotage — et c'était juste.**
   J'ai ouvert `pol_risques_lecture` en `using (true)` et interrogé `/api/donnees` :
   **aucune ligne allemande n'est apparue**. J'ai failli conclure « le sabotage n'a pas
   pris ». Vérification en `psql` sous périmètre : le sabotage avait bien pris, la ligne
   voisine était visible **en base**. La réponse est dans `src/entites/index.ts` (≈ 3022) :
   le dépôt filtre `p.filiale_id = $n` **en plus** de la RLS, délibérément et commenté.
   Ma sonde mesurait donc le filtre applicatif, jamais la RLS. **L'instrument juste pour la
   RLS est `db/verifier_cloisonnement.sql`** — 107/107, et 104/107 code 3 au retrait d'un
   `force row level security`. Sans cette vérification j'aurais publié une couverture que
   je n'avais pas.

3. **Ma première mesure de Q-29 lisait mon propre message.** J'avais injecté l'échec
   directement dans `Api.creer`, comme le fait le banc — le bandeau ne portait alors que
   *ma* phrase, sans le « rechargez la page » que compose `api.js`. Conclure là-dessus
   aurait été mesurer ma sonde. J'ai refait le scénario par le **chemin réel** : un 502 du
   frontal intercepté au niveau réseau, `api.js` composant lui-même son message.

4. **Ma première mesure du F5 ignorait un garde-fou du produit.** Playwright **accepte
   automatiquement** les dialogues : le `beforeunload` de `sync.js` (≈ 1997) s'était
   déclenché et je ne l'avais pas vu. Instrumenté (`page.on('dialog', …)`), il apparaît :
   `beforeunload` est bien posé. C'est ce qui fait que **Q-57 est majeur et non bloquant** :
   une confirmation du navigateur sépare l'utilisateur de la perte.

5. **Mon décompte de clés étrangères composites disait 12 là où le `README` dit 11.**
   Avant d'écrire un constat de documentation, j'ai listé les douze : onze visent
   `(id, filiale_id)`, la douzième vise `(id, portee_groupe)`. **Le `README` a raison, ma
   requête était plus large que sa phrase.**

6. **PostgreSQL et Apache étaient à vérifier avant de compter.** `pg_isready` répondait ;
   mon Apache a démarré du premier coup (racine sous `/tmp`, pas sous un répertoire
   `drwx------`, piège que le 8ᵉ passage a documenté). Banc de référence rejoué avant toute
   mutation : **640 · 640 · 0**.

---

## 3. Le sort des cinquante-trois constats

Trois colonnes de vérification, et il faut les distinguer : **rejoué** = j'ai cassé le
remède et vu le banc rougir, ou provoqué le défaut et vu le produit le refuser ;
**mesuré** = j'ai observé la propriété sur le produit vivant, sans mutation ; **lu** = je
me suis appuyé sur le banc vert (640/640) et sur les dix-sept mutations du 8ᵉ passage,
sans en refaire la démonstration.

### 3.1 Constats fermés — vérifiés par moi

| # | Ce que j'ai fait | Verdict |
|---|---|---|
| **Q-1 · Q-7 · Q-13 · Q-14 · Q-17 · Q-26** | **Rejoué.** `engendrerIdentifiant()` saboté à **3 valeurs d'aléa**, la *forme* conservée (25 signes base 36) : `test/api/identifiants.test.mjs` rend **9/16**, sept essais rouges — le garde-fou du démarrage, les 20 000 tirages, la mesure d'entropie, le canari de graine étroite, le plancher normé. Le type-check tombe aussi (import inutilisé) | ✅ tient, et mord |
| **Q-5** | **Rejoué.** `alter function f_verifier_couverture_rls() rename to f_hs_…` → `node db/migrate.mjs --verifier` sort en **code 7** : `[point_appel] f_verifier_couverture_rls → controle_disparu`, avec le geste de retrait délibéré. Restauré → code 0 | ✅ tient, et mord |
| **Q-31** | **Rejoué.** `cyber-gouvernance_V4/data/registre-risques.xlsx` déposé → `frontend-publiable.test.mjs` rend **5/6**, en nommant le fichier. Les deux listes blanches (vhost, `install.sh`) sont lues dans les deux fichiers et comparées | ✅ tient, et mord |
| **Q-36** | **Mesuré sur l'URL d'entrée**, pas sur `/index.html` : `http://hôte` → **308** → `https://hôte/` → **200**, 15 650 octets, sous mon Apache 2.4.58 monté sur le vhost du dépôt | ✅ fermé |
| **Q-39** | **Mesuré.** `X-Request-Id: FORGE-PAR-LE-CLIENT` envoyé à travers le vhost : la réponse porte `"reference":"REQ-1788348654666-…"`, engendrée par le serveur. Les deux couches sont en place | ✅ fermé |
| **Q-42** | **Mesuré.** `js/app.js`, `js/core/sync.js`, `js/lib/xlsx.full.min.js` : `Content-Type: text/javascript`, **`Content-Encoding: gzip`**. Le type est bien celui qu'Apache émet | ✅ fermé |
| **Q-43** | **Mesuré.** `logo-dedienne.png` → `max-age=3600` ; `.js`/`.css` → `max-age=604800` ; `index.html` → `no-cache, must-revalidate`. L'invariant est tenu par le garde-fou d'`install.sh`, comme l'arbitrage le prescrit | ✅ fermé |
| **Q-44** | **Mesuré des deux côtés.** `Content-Length: 28 311 552` → **413** en 0,00 s sur `/api/reprise` **et** sur `/index.html`, la doublure ne reçoit rien (65 593 octets émis avant coupure). Le pré-filtre fonctionne. **Mais voir Q-58** : ce que le vhost écrit de la borne *applicative* est faux | ◐ fermé pour le cas ordinaire ; sa justification ne l'est pas |
| **Q-45** | **Rejoué.** Entrée `grc.exemple.interne` **retirée d'`/etc/hosts`** → `test/deploiement/` **51/51**, puis `npm test` entier **640 · 640 · 0**. La barrière `dns.lookup` posée dans `before()` est réelle : c'est une barrière, pas une consigne | ✅ tient, et mord |
| **Q-46** | **Rejoué.** Route `"/piege-auditeur"` ajoutée à `js/app.js` avec un `onclick=` en ligne → le balayage la **découvre**, la visite et rougit : `#/piege-auditeur : 1 gestionnaire(s), ex. <button onclick="alert(1)">` | ✅ tient, et mord |
| **Q-47** | **Rejoué — et le remède a un trou.** La suppression d'une ligne **au milieu** rougit (`LA NUMÉROTATION est continue`). La suppression de la **dernière** ligne ne rougit pas ; treize lignes de queue non plus. Voir **Q-54** | ⚠️ fermé à moitié |
| **Q-48 · Q-49** | **Mesuré.** La façade `DataStore` rend bien **131 membres** par évaluation du module. Le compte d'essais, lui, est **de nouveau faux** : voir **Q-59** | ◐ Q-49 fermé ; Q-48 rouvert |
| **Q-50** | **Mesuré.** `GET /` → 200, `GET /assets` → **403**, `GET /assets/` → 403 : conforme à ce que le vhost décrit désormais | ✅ fermé |
| **Q-52** | **Rejoué.** Un fichier suivi important un fichier non suivi → `test/depot/` rend **2/3**, avec le bon numéro de ligne. **Mais** la moitié `<script src>` n'est pas couverte : voir **Q-60** | ◐ fermé sur son périmètre déclaré |
| **Q-27 · Q-30** | **Mesuré sur le chemin réel.** Un 502 du frontal sur une création pose bien `issueInconnue`, le bandeau annonce « Enregistrement incertain », rien n'est rejoué automatiquement, et « Envoyer à nouveau » est offert | ✅ fermé |
| **Q-29** | **Rejoué sur le geste que la phrase nomme — et il n'est pas fermé.** Bouton « Recharger les données » → saisie **conservée** ; F5 → saisie **perdue**. Voir **Q-57** | ⚠️ **rouvert** |
| **Q-19 · Q-20** | **Mesuré partiellement.** `ProxyTimeout 60` et `BORNES.lignesParReprise` sont en place et cohérents ; la saturation du pool rend bien 503 (`indisponible`, message « autant de demandes qu'il le peut »). Je n'ai pas rejoué la reprise de 60 000 enregistrements | ✅ tenu pour fermé, non rejoué à l'échelle |

### 3.2 Constats fermés — pris sur le banc vert et les mutations du 8ᵉ passage

**Q-2, Q-3, Q-4 (partiellement — voir Q-59), Q-6, Q-8, Q-12, Q-15, Q-18, Q-21, Q-22,
Q-23/Q-32, Q-24, Q-25, Q-33/Q-38, Q-34, Q-35, Q-37, Q-40, Q-41.**
Aucun ne rougit sur mon banc de référence (640/640, y compris sur machine sans entrée
`/etc/hosts`), et chacun porte au moins un essai nommé d'après lui. Le 8ᵉ passage en a
rejoué dix-sept par mutation, avec dix-sept morsures. Je ne les ai pas remutés : j'ai
préféré porter mon effort sur les fermetures qu'**aucun auditeur n'avait encore vues** —
Q-44 à Q-53, closes après le 8ᵉ passage — et sur les instruments eux-mêmes. **Je le dis
plutôt que de le laisser croire.**

Deux exceptions que j'ai tout de même regardées de près :
- **Q-11** (refus argumenté) : voir §3.4, j'accepte le refus.
- **Q-12** (justifications rendues fausses par un correctif) : le motif se reproduit, et
  c'est **Q-58** — une phrase du vhost, écrite en fermant Q-44, que la mesure contredit.

### 3.3 Constats ouverts et reportés — chacun jugé

| # | Report | Mon jugement |
|---|---|---|
| **Q-9 / Q-20** (lot L7, vague 5) | La reprise tient une connexion du pool pendant toute sa durée ; le fond est l'import fractionné | **Défendable.** La borne `lignesParReprise = 8000` est posée, la saturation rend un **503 reconnaissable** (`estPassagere()` côté navigateur) et non un 500 opaque — j'ai vu le message. Le fond appartient bien à l'import fractionné, qui est L7 |
| **Q-10** (lot L3, vague 3) | ~160 ms d'analyse de corps avant toute décision, sans authentification ; remède = contrôle en `onRequest` | **Défendable, et le chiffre est à réviser à la hausse.** Mesuré à travers Apache : `POST /api/reprise` avec 18 Mio → **304 ms médiane** (7 tirs) ; `POST /api/entites/risques` → **157 ms** ; `GET /api/sante` → 2 ms. Le remède exige une identité à vérifier, qui n'existe pas avant L3 : le report est le bon ordre. Que le registre porte 160 ms là où j'en mesure 304 n'invalide pas l'arbitrage |
| **Q-16** (vague 3) | Aucune couverture de non-régression sur les 26 modules métier | **Défendable et honnête.** Vérifié : `grep -hoE "[A-Z][a-zA-Z]+Module" test/navigateur/*.mjs` ne rend **aucun** nom de module métier, pour 26 modules dans le produit. Le journal est annoté, le produit ne l'est pas, et le registre le dit exactement ainsi |
| **Q-28** (vague 3) | `padStart(25, '0')` dupliqué dans `src/reprise/index.ts` | **Défendable.** Vérifié : `src/reprise/index.ts:587` porte bien le littéral, `src/entites/index.ts:4414` porte `LONGUEUR_ALEA = 25`. C'est une **dérivation** — elle ne tire aucun aléa —, donc une divergence produirait des identifiants d'allure différente, jamais une perte d'entropie. Le risque est de forme, pas de sécurité |
| **Q-51** (lot L3, vague 3) | Le contournement `chunked` reste ; la barrière réelle est applicative | **Le report tient, sa justification non.** La barrière applicative existe et je l'ai mesurée (413 sur `chunked` en interrogeant le service directement) ; mais elle **ne rend pas 413 au client** derrière Apache, et le frontal ingère **sans borne** (1 Gio en 1,2 s). J'ai aussi vérifié qu'une règle `mod_rewrite` refusant `Transfer-Encoding: chunked` **ne suffirait pas** — testée, elle rend 411 mais Apache draine quand même le gigaoctet. « Il faudrait `mod_security` » est donc plus juste qu'il n'y paraît. **Je maintiens le report ; je refuse la phrase qui le porte** (Q-58) |
| **Q-53** (vague 3) | Rien ne confronte les chiffres du `README` au réel | **Défendable — et déjà réalisé.** Ce constat prédit exactement ce que j'ai trouvé : **Q-59**, huitième signalement, apparu dans le commit même qui a inscrit Q-53. C'est la meilleure démonstration possible qu'il fallait l'écrire ; c'est aussi la démonstration qu'une échéance « vague 3 » le laissera se reproduire au 10ᵉ passage |

### 3.4 Le refus argumenté Q-11 — **j'accepte**

Le constat porte sur le repli d'`applyImport` et, plus largement, sur `renommer()` : pour
réécrire les **références** vers un identifiant que le serveur vient de réattribuer, il
faudrait savoir quels champs *sont* des références. Le refus dit : `/api/modele` rend le
**type** d'une colonne, jamais sa nature de référence ; une liste tenue à la main
manquerait le champ neuf, et le manquerait **en silence**.

Je l'ai vérifié plutôt que de le croire. Les liaisons n-n sont bien déclarées dans le
registre d'entités et donc découvrables ; mais les références qui vivent **dans du JSONB**
— `actif.dependances[].actif_id`, `evaluation.mesure_ids[]` avant scission — ne le sont
pas, et rien dans `pg_catalog` ne peut les nommer. Une liste manuelle serait donc un
annuaire au sens exact du `CONVENTIONS.md` §24, dans la case « réussit en silence alors
que c'est faux » : le mauvais outil.

Ce qui rend le refus acceptable plutôt que commode, c'est qu'il n'est pas muet : le
bandeau **compte** les réécritures qui sortent de l'enregistrement renommé, et deux essais
l'exercent dans les deux sens (« un identifiant TROP COURT : le bandeau nomme la réécriture
et son compte » / « CONTRÔLE SYMÉTRIQUE : identifiant canonique, bandeau MUET »). Un
constat affiché vaut mieux qu'un constat fermé à moitié. **Refus accepté, sans réserve.**

---

## 4. La grille du §4, contrôle par contrôle

| # | Verdict | Ce que j'ai exécuté, et ce que cela a rendu |
|---|---|---|
| **S1** — Cloisonnement non contournable | ✅ **passé** | `psql -U grc_app -f db/verifier_cloisonnement.sql` → **107 contrôles, 107 réussis, 0 échoué, code 0**. Sabotage `alter table risques no force row level security` → **104/107, 3 échecs, code 3**, avec « Ne pas mettre en service ». Catalogue : **0 table sans RLS activée ou forcée** sur 48 ; `grc_app` et `grc_lecture` sans `bypassrls`, sans `superuser`, **non propriétaires** (toutes les tables appartiennent à `grc_proprietaire`). Réserve **connue et écrite** : la lecture du journal d'audit n'est pas cloisonnée (contrôle C22, dérogation imposée par le chaînage, livrable ferme de L5) |
| **S2** — Le périmètre ne vient jamais du navigateur | ✅ **passé** | **157 sondes** contre `/api/session` à travers Apache : 24 noms d'en-tête × 6 valeurs (`X-Filiale`, `X-Perimetre`, `X-Tenant`, `X-Administration-Groupe`, `X-Remote-User`, …), 6 cookies (`cyber-context`, `cyber-vault`, `grc.filiale_id`, `administration_groupe`, …), 7 formes de requête. **Aucune dérive** : filiale active, périmètre de lecture, `perimetre_groupe` et `administration_groupe` identiques dans les 157 cas. Écriture chez le voisin : `PUT /api/entites/risques/RISK-IX-B` → **404 indiscernable**, `filiale_id` dans les champs → **refusé** |
| **S3** — Journal inaltérable et complet | ◐ **partiel, et déclaré** | `UPDATE`, `DELETE`, `TRUNCATE` sur `journal_audit` refusés **au propriétaire** : « Table journal_audit en ajout seul : opération X refusée. » `f_journal_audit_verifier()` → **0 ligne**. Mais **l'API n'écrit rien au journal** : la couverture des événements du `PLAN_SERVEUR` §1.7 est un livrable de **L5**, et le `README` §8 le dit. Le mécanisme est prouvé, la complétude est sans objet à ce stade |
| **S4** — Verrouillage optimiste effectif | ✅ **passé** | Sur le chemin qui écrit, à travers Apache : création → `id` engendré par le serveur ; `PUT` version 1 → 200 ; second `PUT` version 1 → **409**, `{"erreur":"conflit_version","code_grc":"GRC03","version_actuelle":2}`. Le client ne peut fixer ni `version`, ni `cree_le`, ni `cree_par`, ni `modifie_par`, ni `id`, ni `filiale_id` : **six refus sur six**, avec un message qui dit quoi faire |
| **S5** — Aucune injection SQL | ✅ **passé** | 21 noms d'entité hostiles (`risques; drop table risques`, `risques'--`, `pg_class`, `information_schema.tables`, `'; select pg_sleep(5);--`, octet nul, `../`, casse) → **404 dans les 21 cas**, aucun temps de réponse anormal. 4 identifiants injectés sur `PUT` → 404. 5 noms de champ hostiles → « Le champ « **inconnu** » n'appartient pas à l'entité » — la valeur fautive n'est **pas réfléchie**. Une valeur hostile est stockée telle quelle et rendue telle quelle. **48 tables avant, 48 après** |
| **S6** — Droits vérifiés à chaque requête | ◐ **sans objet à ce stade** | Il n'y a pas encore de profil métier : c'est L3. Ce qui existe et que j'ai mesuré : **hors `developpement`, le serveur refuse de servir des données** — les 157 sondes rendent `503 indisponible` en `NODE_ENV=production`, y compris `/api/session`. Le *fail-closed* tient, et il tient avant toute analyse de corps |
| **S7** — Droit d'export distinct | ⬜ **sans objet** | Lot L3 (droits) et L5 (journalisation des exports) |
| **S8** — Secrets | ✅ **passé** | Aucun secret en réponse d'API sur les ~200 réponses que j'ai lues ; le journal technique ne porte ni mot de passe ni chaîne de connexion (`pino` masque `req.headers.cookie`, `authorization`, `res.headers["set-cookie"]`). Le démarrage en `production` **refuse** de partir sans `SESSION_SECRET` et les quatre variables LDAP, en les nommant sans les afficher. Rien de secret dans le dépôt (`.env` ignoré, seul `.env.example` versionné) |
| **S9** — Chaîne de contrôle des pièces jointes | ⬜ **sans objet** | Lot L6. Aucun client ClamAV dans `src/` (vérifié) |
| **S10** — Sortie et en-têtes | ✅ **passé** | Sous **mon Apache 2.4.58** sur le vhost du dépôt : sur `/` — HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP, CORP, `Permissions-Policy`, CSP complète, `Cache-Control: no-cache, must-revalidate` ; sur `/api/sante` — mêmes en-têtes plus `Cache-Control: no-store` ; **sur une réponse 403** — HSTS, `nosniff` et CSP toujours posés (`Header always`). `Server: Apache` seul, `TRACE` → **405**. Zéro violation de CSP sur l'application chargée dans Chromium |
| **S11** — Limitation du rythme | ⬜ **sans objet** | Lot L3. `RequestReadTimeout header=20-40 body=20 MinRate=500` existe côté frontal (slowloris), ce n'est pas la limitation de rythme de la grille |
| **S12** — Les erreurs ne renseignent pas l'attaquant | ❌ **EN ÉCHEC** | Le greffon est irréprochable : un refus PostgreSQL devient « Aucune donnée n'a été enregistrée » sans table, sans SQL, sans pile ; ligne cachée et ligne absente rendent **la même** réponse ; un 404 est propre. **Mais le gestionnaire de racine renvoie le code interne et le message anglais du cadre** — `FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_EMPTY_JSON_BODY`, `FST_ERR_CTP_BODY_TOO_LARGE` — derrière Apache, en production, sans authentification. Voir **Q-55** |
| **S13** — Dénis de service applicatifs | ✅ **passé, avec la réserve Q-51 requalifiée** | La borne applicative **tient et je l'ai mesurée** : `Content-Length` 28 Mio → 413 ; **`chunked` 28 Mio → 413 aussi**, quel que soit l'encodage, sur `/api/reprise` comme sur `/api/entites/*`. Le pré-filtre du frontal rend **413 en 0,00 s** sur un `Content-Length` hors borne, sans que la doublure reçoive rien. Délais posés (`ProxyTimeout 60`, `statement_timeout`, `Timeout 60`), pool borné (saturation → **503** explicite), collections plafonnées (`lignesParCollection`). **Ce que je ne peux pas appeler passé sans le dire** : sur un corps `chunked`, le frontal ingère sans borne — **1 Gio en 1,2 s, mesuré** —, et le client reçoit **502** là où le vhost promet 413 (**Q-58**). Le service, lui, est protégé |
| **S14** — Intégrité des opérations composites | ✅ **passé** | Reprise de trois risques valides → 3 créés, `imports` = 1. Reprise de trois risques dont le deuxième porte `f_frequence: "pas-un-nombre"` → **`400 donnee_invalide`**, et en base : **7 risques avant, 7 après**, `imports` = 1 avant et après. Les deux lignes valides encadrant la fautive **ne sont pas là** ; aucun état intermédiaire observable |
| **S15** — Dépendances | ✅ **passé** | `npm audit --omit=dev` → **found 0 vulnerabilities**. Deux dépendances d'exécution seulement (`fastify`, `pg`), épinglées en `^`, verrouillées par `package-lock.json` |
| **S16** — Les garde-fous sont branchés | ✅ **passé** | `f_verifier_schema()` découvre **8 contrôles**, tous consignés dans `controles_schema`. Un garde-fou renommé → `migrate.mjs --verifier` sort en **code 7** avec `controle_disparu` et le geste de retrait délibéré ; restauré → code 0, « aucune anomalie ». C'est la découverte dans le catalogue, pas une liste |
| **S17** — Le chemin complet a été parcouru pour de vrai | ✅ **passé — mais par moi, pas par le banc** | **Chromium réel → Apache réel (vhost + durcissement du dépôt) → serveur réel → PostgreSQL** : l'application démarre, `DataStore` présent, **0 erreur de console**, **0 violation de CSP**, **0 réponse ≥ 400** ; création (identifiant rendu par le serveur), rechargement (la ligne revient du serveur), suppression. Le banc, lui, ne joint jamais ces trois moitiés : `test/navigateur/` parle à Fastify par `inject()` **sans TCP ni Apache**, `test/deploiement/` monte Apache contre une **doublure** (**Q-62**). Et le banc tourne bien sur machine propre : **640/640 sans l'entrée `/etc/hosts`** |
| **S18** — Le produit fait ce qu'il doit faire | ❌ **EN ÉCHEC** | Les gestes ordinaires aboutissent, et je les ai faits moi-même dans la configuration de déploiement : créer, saisir, enregistrer, recharger, supprimer, reprendre un export. **Mais la grille nomme « recharger » parmi les gestes qui ne doivent rien détruire** : sur une création bloquée, le bandeau dit « rechargez la page » puis « le rechargement la conserve », et **F5 détruit la saisie** — écran 0, bloqués 0, bandeau vide. Contrôle symétrique dans la même session : le bouton « Recharger les données » la **conserve**. Voir **Q-57** |

**Deux contrôles en échec, S12 et S18.** Deux contrôles sans objet (S7, S9), deux
partiels et déclarés (S3, S6), un sans objet en attendant L3 (S11).

---

## 5. Les constats neufs

Chacun porte la commande, la sortie, le fichier et la ligne. Toutes les mutations ont été
faites dans la copie hors dépôt ou dans `/tmp`, et annulées.

---

### 🟠 Q-54 — majeur — Le garde-fou du registre ne voit pas la troncature

**Où** : `backend/test/documentation/registre.test.mjs`, essai « LA NUMÉROTATION est
continue et sans doublon » (≈ ligne 120).

**Le défaut.** L'essai vérifie que tout `n` de 1 à `max(numeros)` est présent, puis que
`numeros.length === max(numeros)`. Les deux assertions sont **relatives au maximum
observé** : retirer la dernière ligne fait descendre le maximum d'autant, et le contrôle
reste satisfait. Le seul plancher absolu est `numeros.length >= 40`.

**Reproduction.**

```bash
# dans une copie du dépôt
python3 - <<'PY'
p='docs/PLAN_EXECUTION.md'
s=open(p,encoding='utf-8').read().split('\n')
out=[l for l in s if not l.startswith('| **Q-53**')]
open(p,'w',encoding='utf-8').write('\n'.join(out))
PY
cd backend && node --test "test/documentation/**/*.test.mjs"
```

```
✔ SEPT BARRES par ligne : deux constats ne peuvent pas se coller
✔ LA NUMÉROTATION est continue et sans doublon
✔ AUCUNE CASE de propriétaire ou d’état n’est vide
✔ L’EN-TÊTE du tableau est celui que ce contrôle croit lire
ℹ tests 4 · pass 4 · fail 0
```

**L'ampleur.** Ce n'est pas une ligne : les **treize** dernières (Q-41 à Q-53, dont
**cinq majeurs** — Q-42, Q-44, Q-45, Q-46, Q-47) peuvent partir ensemble avant que le
plancher `>= 40` ne morde.

```
retirees: 13
ℹ tests 4 · pass 4 · fail 0
```

**Contrôle symétrique — mon instrument mord bien.** La même suppression appliquée **au
milieu** (Q-29) rougit :

```
not ok 2 - LA NUMÉROTATION est continue et sans doublon
```

**Pourquoi c'est majeur.** Le `CLAUDE.md` §8 désigne ce tableau comme « la seule source
des verdicts ». Les lignes de queue sont celles du **dernier passage** : les plus
récentes, les moins connues de tous, celles qu'un agent de la vague suivante ne saura pas
chercher parce qu'il ne saura pas qu'elles ont existé. Le constat Q-47 était exactement
cela — une ligne perdue, celle d'un bloquant — et son remède laisse ouverte la moitié la
plus probable du cas. Un contrôle qui ne détecte que les trous protège l'histoire ancienne
et laisse partir la récente.

**Ce qu'il faudrait** (je ne prescris pas, je situe) : un plancher **absolu** au lieu d'un
plancher relatif — le nombre de constats ne décroît jamais, la porte n'en retire aucun.

---

### 🟠 Q-55 — majeur — Le gestionnaire d'erreurs de racine rend le code interne du cadre, en anglais

**Où** : `backend/src/serveur.ts`, lignes **274-279** — la branche `< 500` de
`serveur.setErrorHandler` :

```ts
requete.log.warn({ erreur: erreur.message, code }, 'Requête refusée');
void reponse.code(code).send({
  erreur: erreur.code ?? 'requete_invalide',
  message: erreur.message,          // ← le message INTERNE du cadre, tel quel
  reference: requete.id,
});
```

Deux lignes plus haut, la branche `>= 500` fait exactement l'inverse, et le commentaire le
dit : « Le message interne ne sort jamais : il pourrait révéler une requête SQL ou un
chemin du serveur ». La précaution s'arrête aux 5xx.

**Reproduction — deux lignes, derrière Apache, en `NODE_ENV=production`.**

```bash
curl -s --noproxy '*' -k --resolve grc.exemple.interne:18443:127.0.0.1 \
  -X POST -H 'content-type: application/json' --data '{"a":' \
  https://grc.exemple.interne:18443/api/inconnue
```

```json
{"erreur":"FST_ERR_CTP_INVALID_JSON_BODY","message":"Body is not valid JSON but content-type is set to 'application/json'","reference":"REQ-1788347041177-crn649on38y1urfdwy5x7192f"}
```

Trois formes mesurées, en `developpement` **et** en `production` :

| Requête | Réponse |
|---|---|
| `POST /api/sante` corps `{"a":` | `400 FST_ERR_CTP_INVALID_JSON_BODY` — « Body is not valid JSON… » |
| `POST /api/sante` corps vide | `400 FST_ERR_CTP_EMPTY_JSON_BODY` — « Body cannot be empty… » |
| `POST /api/rafraichir` corps de 28 Mio | `413 FST_ERR_CTP_BODY_TOO_LARGE` — « Request body is too large » |

**Contrôle symétrique — la traduction existe, et elle est bonne.** Les mêmes requêtes sur
une route du greffon rendent la version normalisée :

```
POST /api/entites/risques json malformé -> 400 {"erreur":"donnee_invalide","message":"La requête n'a pas pu être lue : format ou type de contenu invalide."}
POST /api/entites/risques type texte    -> 400 {"erreur":"donnee_invalide","message":"La requête ne respecte pas le format attendu."}
```

`traduireErreur()` (`src/erreurs/index.ts`, ≈ 300) traite déjà ce cas — « m-1 : une 4xx du
cadre reste une 4xx » — et pose `volume_excessif` / `donnee_invalide` avec un message
français. Le gestionnaire de racine ne l'appelle pas.

**Pourquoi c'est majeur et pourquoi je marque S12 en échec.**
1. La grille écrit : « **Message générique côté client**, détail au journal technique ». Il
   ne l'est pas.
2. Le préfixe `FST_ERR_` est l'espace de noms d'erreurs de Fastify : la réponse **nomme la
   pile logicielle**, sur une route atteignable sans authentification, à travers le
   frontal, en production. Pendant ce temps le vhost pose `ServerTokens Prod`,
   `ServerSignature Off` et `Header always unset X-Powered-By` avec le commentaire « On ne
   renseigne pas l'attaquant sur la pile logicielle (S12) ».
3. Le message est en **anglais**, dans un produit dont la définition de « terminé » (§5.5)
   exige le français pour les messages d'erreur.
4. **Aucun essai ne regarde là.** Les assertions S12 du banc appellent `traduireErreur()`
   **directement** (`test/api/depot-contrat.test.mjs` ≈ 280) ou passent par le greffon ;
   la branche 4xx du gestionnaire de racine n'est exercée par rien. C'est « une couverture
   mesurée en gestes n'est pas une couverture mesurée en états ».

---

### 🟠 Q-56 — majeur — Le cinquième annuaire : un contrôle qui ne connaît qu'une orthographe

**Où** : `backend/deploy/install.sh`, bloc `banc: entetes`, ligne **1597** :

```sh
ENTETES_ATTENDUS="$(grep -rhoE "requete\.headers\['[a-z0-9-]+'\]" "$SOURCE/src" 2>/dev/null \
                    | sed "s/.*\['//; s/'\]//" | sort -u || true)"
```

Le bloc porte, juste au-dessus, la promesse qui en fait une barrière :

> « tout en-tête de requête que `src/` lit, ou auquel il fait confiance, doit être effacé
> ou reposé par le vhost. […] Les deux termes sortent de deux fichiers versionnés, aucun
> n'est recopié ici. »

Les **noms** sont bien découverts. L'**orthographe**, elle, est une liste écrite à la main
d'un seul élément : les apostrophes.

**Reproduction.**

```bash
SRC=$(mktemp -d); cp -r backend/src $SRC/
python3 - "$SRC" <<'PY'
import sys
p=sys.argv[1]+'/src/serveur.ts'; s=open(p,encoding='utf-8').read()
cible="const brut = requete.headers['x-request-id'];"
s=s.replace(cible, cible + '''
    const a = requete.headers["x-jeton-guillemets-doubles"];
    const b = requete.headers[`x-jeton-gabarit`];
    const { headers } = requete; const c = headers['x-jeton-destructure'];
    void a; void b; void c;''')
open(p,'w',encoding='utf-8').write(s)
PY
# le bloc réel d'install.sh, joué par l'outillage du dépôt
node -e "import('./backend/test/aide/install.mjs').then(({jouerBloc})=>{
  const i=jouerBloc('entetes',{SOURCE:'$SRC'},'/tmp',[['VHOST_APPLIQUE=/etc/apache2/sites-available/cyber-grc.conf','VHOST_APPLIQUE=backend/deploy/apache/cyber-grc.conf',1]]);
  console.log('code =',i.code); console.log(i.sortie.trim());});"
```

```
--- SOURCE DU DÉPÔT (témoin) : code=0
ok en-têtes : tout ce que le service lit est effacé ou reposé par le vhost
--- SOURCE MUTÉE (3 en-têtes neufs) : code=0
ok en-têtes : tout ce que le service lit est effacé ou reposé par le vhost
```

Et ce que le code lit réellement, dans cette même source :

```
headers["set-cookie"]
headers["x-jeton-guillemets-doubles"]      ← non vu
headers['x-jeton-destructure']             ← non vu (destructuration)
headers['x-request-id']
headers[`x-jeton-gabarit`]                 ← non vu
```

**Pourquoi c'est majeur.**
1. C'est la barrière née du constat **Q-39** — « le septième oubli suivra » — et le
   registre la donne comme la réponse du `CONVENTIONS.md` §24 à une liste manuelle.
2. L'essai qui prétend le prouver, `install-blocs.test.mjs` test **E — « LE SEPTIÈME
   EN-TÊTE ne manquera pas : un en-tête NEUF non neutralisé arrête »**, écrit son en-tête
   neuf en **apostrophes** : il vérifie la seule orthographe que le motif connaît. Son
   titre annonce une propriété générale, son instrument en couvre une écriture.
3. Le risque n'est pas théorique : **aucun linter, aucun `.prettierrc`, aucun
   `.editorconfig`** dans le dépôt, et `src/serveur.ts:58` porte déjà
   `'res.headers["set-cookie"]'` en guillemets doubles.
4. **L'ironie utile** : `install.sh` lui-même, trente lignes plus haut
   (`injecter_jeton_frontend`, ligne 291), a **durci exactement ce point** — « Une
   première rédaction comptait les deux fois en guillemets doubles : un script ajouté avec
   des apostrophes n'était PAS versionné et le contrôle ne voyait rien — le défaut même
   que ce correctif ferme, reconstitué dans son garde-fou. » La leçon est écrite dans le
   fichier ; elle n'a pas été appliquée au bloc voisin.

---

### 🟠 Q-57 — majeur — « Rechargez la page » détruit la saisie que la phrase promet de conserver

**Où** : `cyber-gouvernance_V4/js/core/api.js` lignes **139** et **184** (« … rechargez la
page avant de recommencer. ») composées avec `js/core/sync.js` ligne **1527** (« Votre
saisie reste à l'écran et n'est plus renvoyée ; **le rechargement la conserve**. »). Le
remède de Q-29 vit dans `sync.js` `recharger()` (≈ 1595) — c'est-à-dire dans le **bouton**
`#sync-recharger`, libellé « Recharger **les données** ».

**Le bandeau réellement affiché**, mesuré dans Chromium contre Apache et le serveur réel,
sur un 502 du frontal (le chemin que le constat Q-30 a rendu détectable) :

> ! 1 modification(s) non enregistrée(s). **Enregistrement incertain** — Risque « … » :
> Le serveur a refusé la demande (code 502). L'opération a peut-être été appliquée :
> **rechargez la page** avant de recommencer. Votre saisie reste à l'écran et n'est plus
> renvoyée ; **le rechargement la conserve**. Vérifiez ensuite si elle figure déjà dans la
> liste… [Recharger les données] [Envoyer à nouveau]

Une phrase, deux gestes, deux issues opposées.

**Reproduction — les deux gestes, même scénario, même pile.**

```
BOUTON « Recharger les données »   : avant=1  après → à l’écran=1  bloqués=1   CONSERVÉE
F5 — « rechargez la page »         : avant=1  après → à l’écran=0  bloqués=0   PERDUE
```

Et l'état après le F5 :

```
à l’écran = 0   bloqués = 0   incidents = 0
bandeau   = (VIDE)
```

Le serveur n'a rien reçu (la création a été interceptée avant lui) : **la copie de l'écran
était la seule qui existait**. Après le geste, l'application ne dit plus rien du tout.

**Ce qui l'empêche d'être bloquant, et je l'ai vérifié.** `sync.js` ≈ 1997 pose un
`beforeunload` conditionné à `aDesModificationsEnAttente()`, qui vaut bien `true` ici. Ma
première mesure l'ignorait — **Playwright accepte les dialogues automatiquement** ;
instrumenté (`page.on('dialog', …)`), il apparaît : `beforeunload : ''`. Le navigateur
affiche donc sa confirmation générique. Une confirmation sépare l'utilisateur de la perte
— d'où **majeur** et non bloquant. Mais cette confirmation dit « des modifications
pourraient ne pas être enregistrées », juste après que l'application a écrit **« le
rechargement la conserve »** : elle confirme ce que le produit vient de démentir.

**Pourquoi je marque S18 en échec.** Le contrôle S18 énumère les gestes : « créer, saisir
un formulaire, importer, enregistrer, **recharger** ». Recharger, ici, détruit.

**Pourquoi c'est le même constat que Q-29, et non un autre.** Le registre inscrit Q-29
« ✅ corrigé — recharger PRÉSERVE une création bloquée ». C'est vrai d'un « recharger » et
faux de l'autre, dans le même paragraphe d'interface. Le remède a donné au mot un sens sûr
sans corriger la phrase qui nomme le sens dangereux — et cette phrase est **la première
des deux** que l'utilisateur lit.

**Et le banc ne peut pas le voir.** `test/navigateur/bascule.test.mjs` §15 porte pourtant
la bonne leçon en commentaire — *« quand le produit propose un geste, l'essai doit le
faire »* — puis son `rechargerEtAttendre()` (ligne 2361) fait `cliquer(page,
'sync-recharger')`. Aucun `page.reload()` du banc n'est joué **avec une écriture
bloquée** : les trois qui existent (lignes 532, 703, 2702) portent sur des états sains.

---

### 🔵 Q-58 — mineur — Le vhost décrit une barrière qui rend 413 ; derrière Apache le client reçoit 502, et le frontal ingère sans borne

**Où** : `backend/deploy/apache/cyber-grc.conf`, bloc « La borne du chemin mandaté » :

> « **La borne qui tient pour l'API est APPLICATIVE** : Fastify porte `bodyLimit` […]
> **et rend 413**. Elle est en aval du frontal, elle voit le corps réel quel qu'en soit
> l'encodage, et c'est elle qui protège le service. »

**Ce qui est vrai** — et je l'ai mesuré, parce que c'est la phrase sur laquelle repose le
report de Q-51 : interrogé **directement**, le service rend bien 413 sur un corps
`chunked` de 28 Mio, sur `/api/reprise` comme sur `/api/entites/risques`.

**Ce qui est faux.** Derrière Apache, le client ne reçoit pas 413.

```
Content-Length 28 Mio -> /api/reprise  -> 413 Request Entity Too Large   émis=     65 593
CHUNKED        28 Mio -> /api/reprise  -> 502 Bad Gateway                émis= 28 311 552
CHUNKED        28 Mio -> /index.html   -> 413 Request Entity Too Large   émis= 27 328 569
```

Le journal du service dit `{"erreur":"volume_excessif", …, "res":{"statusCode":413}}` ;
celui d'Apache dit `AH01097: pass request body failed to 127.0.0.1:13001`. **Le 413 est
émis puis jeté.**

**Et l'ordre de grandeur de Q-51 est à revoir.** Le registre écrit « 28 Mio passent ». Il
n'y a pas de borne du tout :

```
128 Mio relayés en 0.2s … 1024 Mio relayés en 1.2s
TOTAL ÉMIS = 1 073 741 824 octets (1024 Mio) en 1.2s
réponse : HTTP/1.1 502 Bad Gateway
```

**Ce que j'ai vérifié avant de proposer quoi que ce soit.** J'ai posé dans mon Apache une
règle refusant `Transfer-Encoding: chunked` sur `/api/` (`RewriteCond
%{HTTP:Transfer-Encoding} chunked` → `R=411`). Elle **fonctionne** — 411 — mais Apache
**draine quand même le gigaoctet** avant de répondre. La phrase « fermer le contournement
au frontal demanderait `mod_security` » est donc **plus juste qu'elle n'en a l'air**, et je
maintiens le report de Q-51.

**Ce que je refuse**, c'est la phrase qui le porte : elle décrit un comportement qui n'est
pas celui de la configuration livrée, et elle a été écrite **en fermant Q-44**, dont tout
le tort était d'affirmer sans mesurer, dans ce même fichier. Conséquence concrète : un
exploitant qui lit le vhost cherchera un 413 dans ses journaux ; il y trouvera des 502. Et
côté navigateur, un 502 pose `issueInconnue` (Q-30) — le produit annoncera « l'opération a
peut-être été appliquée » pour une requête qui a été **proprement refusée**.

---

### 🔵 Q-59 — mineur — Q-4, huitième signalement : 637 annoncés, 640 mesurés, six familles annoncées, sept livrées

**Mesure**, révision `fe3087c`, arbre propre, base neuve, machine sans entrée
`/etc/hosts` :

```
npm test → ℹ tests 640 · ℹ suites 138 · ℹ pass 640 · ℹ fail 0 · ℹ skipped 0
```

**Ce que les documents écrivent** :

| Fichier | Phrase |
|---|---|
| `backend/README.md:502` | `npm test  # 637 essais, six familles (voir plus bas)` |
| `backend/README.md:544` | « #### Six familles d'essais » — 272 + 180 + 77 + 53 + 51 + 4 = **637** |
| `backend/README.md:802` | `npm test → tests 637 · pass 637 · fail 0` |
| `CHANGELOG.md` | « **637 essais, 637 passés, 0 échec** » |

**Ce qui rend ce signalement particulier**, et pourquoi je ne le traite pas comme une
coquille. Le `README` §5 explique lui-même l'écart :

> *« Une **septième** famille, `test/depot/`, est en vol au moment où ces lignes sont
> écrites […] Elle n'est pas comptée ici parce qu'elle n'est pas dans la révision
> mesurée : **c'est précisément la discipline que ce garde-fou impose**, et il serait
> piquant de l'enfreindre en l'annonçant. »*

Or `git log --oneline -- backend/test/depot/` rend **`fe3087c`** — le commit qui porte
cette phrase est celui qui a commité la famille. La révision mesurée nommée (`ca73ac6`)
est son parent. Le message du commit dit d'ailleurs « 640 verts, six familles d'essais,
une septième en vol » : le bon nombre était connu, et n'est pas allé dans les documents.

**Tous les autres chiffres du §8 sont exacts**, rejoués dans le catalogue et par
exécution : 48 tables, 6 migrations, 192 politiques, 0 sans RLS activée, 0 sans RLS forcée,
71 clés étrangères (43 `restrict`, 27 `cascade`, 1 `set null`), **11** composites visant
`(id, filiale_id)`, 9 unicités `uq_*_id_filiale`, 43 tables `cree_par` et 43 déclencheurs,
8 contrôles consignés, `DataStore` à **131 membres**. La méthode « mesurer par l'exécution »
a porté partout **sauf** sur le nombre qui change à chaque fermeture de constat.

C'est la démonstration de **Q-53**, faite par le commit qui l'a inscrit.

---

### 🔵 Q-60 — mineur — Le garde-fou de Q-52 ne couvre pas les 59 `<script src>` de la SPA

**Où** : `backend/test/depot/imports-commites.test.mjs`. Le fichier nomme ses exclusions —
et sa raison :

> « Sont **délibérément hors de portée**, faute de pouvoir les mordre : un essai qui **lit
> un fichier de données** non suivi. Les chemins y sont calculés […] pas littéraux : les
> reconnaître demanderait de deviner. »

`cyber-gouvernance_V4/index.html` porte **59 `<script src="…">`** dont les chemins sont
**littéraux**. La raison invoquée ne s'y applique pas, et l'exclusion n'est pas nommée.

**Reproduction.**

```bash
# copie du dépôt
echo 'window.PasCommite = { ok: true };' > cyber-gouvernance_V4/js/core/pas-commite.js   # jamais git add
# balise ajoutée dans index.html après js/core/ui.js
cd backend && node --test "test/depot/**/*.test.mjs"
```

```
✔ AUCUN IMPORT RELATIF ne désigne un fichier absent du commit
ℹ tests 3 · pass 3 · fail 0
```

**Et la conséquence à cette révision seule** — fichier retiré, balise conservée, ce qui est
l'état du commit :

```
✖ l’application démarre contre le serveur, et sans une seule erreur
  AssertionError: CLAUDE.md §5 : zéro erreur.
```

C'est le défaut de Q-52 mot pour mot, dans la moitié du dépôt qui casse le plus
visiblement : le banc joué sur l'arbre reste vert, le commit ne démarre pas.

**Ampleur aujourd'hui : nulle.** J'ai comparé les deux ensembles : 59 balises, 59 fichiers
`.js` sur le disque, **0 cible absente et 0 fichier jamais chargé**. C'est un trou de
garde-fou, pas un défaut du produit — d'où « mineur ».

---

### 🔵 Q-61 — mineur — Le filet `decisives()` compare 46 des 99 directives du vhost

**Où** : `backend/test/deploiement/vhost-apache.test.mjs`, fonction `ecrireVhost`, ≈ ligne
242. Le commentaire annonce la propriété :

> « Si l'une d'elles touchait une règle d'autorisation, cet essai vérifierait sa propre
> réécriture. On compare donc, ligne à ligne, **les directives de décision**. »

Le motif écrit à la main reconnaît `FilesMatch`, `DirectoryMatch`, `LocationMatch`,
`Require`, `Options`, `DirectoryIndex`, `Header always`, `SSLProtocol`, `SSLCipherSuite`,
`LimitRequestBody`, `ProxyTimeout`, `RequestHeader`, `ServerSignature`. Mesuré sur le
vhost et le durcissement livrés : **99 directives, 46 vues**. Parmi les 53 ignorées :
`RewriteCond`, `RewriteRule`, `RewriteEngine`, `ProxyPass`, `ProxyPassReverse`,
`ProxyPreserveHost`, `SSLEngine`, `SSLHonorCipherOrder`, `SSLSessionTickets`,
`RequestReadTimeout`, `LimitRequestLine`, `LimitRequestFields`, `LimitRequestFieldSize`,
`TraceEnable`, `ServerTokens`, `FileETag`, `AllowOverride`, `ExpiresByType`,
`ExpiresDefault`, `AddOutputFilterByType` — **c'est-à-dire les remèdes de Q-42, Q-43 et
Q-44, et les bornes S13 du durcissement**.

**Reproduction.** Trois substitutions de décision ajoutées à la liste de base
d'`ecrireVhost` :

```js
['SSLHonorCipherOrder     off', 'SSLHonorCipherOrder     on', 1],
['RewriteCond %1 "-gt 27262976"', 'RewriteCond %1 "-gt 999999999"', 1],
['ProxyPreserveHost On', 'ProxyPreserveHost Off', 1],
```

```
ℹ tests 19 · pass 17 · fail 2
✖ LE REFUS : un corps hors borne reçoit 413, et la doublure ne reçoit RIEN
✖ LE RÉGRESSEUR DU VICE : sans la règle de refus, l’installation s’arrête
```

**Le filet n'a rien dit.** Les deux échecs viennent d'essais de **comportement** — ceux de
Q-44 — et sur les trois décisions réécrites, **deux passent inaperçues** :
`SSLHonorCipherOrder` et `ProxyPreserveHost`, qui gouvernent respectivement la négociation
des suites et l'en-tête `Host` que voit le service.

**Contrôle symétrique.** Pour monter mon propre Apache j'ai écrit un filet plus large (les
mêmes plus `Rewrite*`, `Proxy*`, `SSL*`, `LimitRequest*`, `Expires*`,
`AddOutputFilterByType`, `SetEnvIf`) : **58 directives comparées, un seul écart**, le port
de la redirection, qui est la substitution déclarée elle-même. La couverture manquante
n'est donc pas une fatalité de l'exercice.

**Mineur, et pas davantage** : les substitutions restent déclarées et comptées une à une,
donc une réécriture silencieuse demande encore que quelqu'un l'écrive. `decisives()` est le
**second** filet ; c'est le second filet qui a le trou, et son commentaire ne le dit pas.

---

### 🔵 Q-62 — mineur — Aucun essai ne joint les trois moitiés du contrôle S17

**Le constat**, vérifié par recherche :

```
Playwright dans test/deploiement/ ?  → aucun fichier
Apache dans test/aide/navigateur.mjs ? → aucun
```

- `test/navigateur/` (53 essais) monte Chromium contre un **serveur Node du banc** qui
  relaie `/api/**` à Fastify par **`inject()`** — pas de socket TCP, pas d'Apache, pas de
  vhost.
- `test/deploiement/` (51 essais) monte un **Apache réel** sur le vhost livré, mais contre
  une **doublure d'API** (`apiDoublure`) — pas de serveur, pas de base, pas de navigateur.

Le contrôle S17 demande « dans un navigateur réel, contre le serveur réel, dans la
configuration de déploiement réelle ». Les deux familles couvrent chacune deux des trois
termes, jamais les trois. **La jonction n'existe que dans la mesure que chaque auditeur
refait à la main** — le 7ᵉ, le 8ᵉ, et moi. C'est la forme exacte de « une réserve écrite
n'est pas une réserve traitée », appliquée à un contrôle plutôt qu'à une dépendance.

**J'ai fait la jonction, et elle est bonne** (§4, S17) : c'est pourquoi ce constat est
mineur et pourquoi je marque S17 passé. Mais une régression dans la jonction — un type MIME
qu'Apache émet autrement, une directive de cache, un en-tête que le mandataire n'ajoute
plus — resterait invisible à `npm test`. Q-42 était exactement ce défaut-là, et il a vécu
un lot entier.

---

### 🔵 Q-63 — mineur — Une réserve reconduite alors que l'outil qui en lève une moitié est installé

Le `README` §8 et le `CLAUDE.md` §8 listent **systemd** parmi ce qui « reste hors de portée
et à surveiller à la première exécution sur la VM cible ». C'est exact pour le
*démarrage* : `systemctl is-system-running` rend `offline`, PID 1 est `process_api`.

Mais `systemd-analyze` est installé, et son sous-commande `verify` ne demande pas de bus :

```bash
systemd-analyze verify backend/deploy/systemd/cyber-grc.service
# → cyber-grc.service: Command /usr/bin/node is not executable  (node est ici sous /opt)
sed 's|/usr/bin/node|/opt/node22/bin/node|' … > /tmp/cyber-grc-audit.service
systemd-analyze verify /tmp/cyber-grc-audit.service
# → (aucune sortie), code 0
```

**L'unité livrée est valide : aucune directive inconnue, aucune valeur refusée, aucun
avertissement.** Cela n'avait jamais été mesuré en quinze passages. `systemd-analyze
security`, qui noterait le durcissement (`ProtectSystem=strict`, `NoExecPaths`, …), exige
un bus et reste **impossible ici** — je le range en §7.

C'est la leçon du 7ᵉ passage, non appliquée à systemd : *une réserve écrite n'est pas une
réserve traitée*, et la moitié qui se lève coûtait une commande.

---

## 6. Ce que j'ai cherché et n'ai pas trouvé

Un refus qui ne dit pas ce qu'il a essayé de casser est un caprice. Voici les pistes que
j'ai ouvertes et qui n'ont rien donné — je les écris parce qu'elles économisent le temps
du dixième passage, et parce que certaines m'ont retenu longtemps.

**Un sixième annuaire.** Il m'était demandé d'en chercher un cinquième ; j'en ai trouvé un
(**Q-56**) et j'ai continué. Les autres listes écrites à la main du dépôt sont **tenues** :

- `TABLES_FILIALE` / `TABLES_MIXTES` / `TABLES_LIAISON` (`test/aide/base.mjs` ≈ 455) sont
  bien des listes manuelles — mais `chargement-filiale.test.mjs` ≈ 156 exige que
  **trente-et-une** tables aient de la matière et que `sansMatiere` soit **exactement**
  `['groupes_ad']`. Une table cloisonnée neuve non semée ferait donc rougir. La moitié
  « il y avait bien quelque chose à cacher » est là, et c'est elle qui compte.
- La liste des tables **non cloisonnées** est figée à deux endroits qui la comparent au
  catalogue (`verifier_cloisonnement.sql` C93 et `rls.test.mjs`) — arbitrage assumé du
  `CONVENTIONS.md` §24, et le bon usage d'une liste manuelle.
- `FRONTEND_PUBLIABLE` d'`install.sh` et le `<FilesMatch>` du vhost sont **lus dans les
  deux fichiers** et comparés ; l'essai « celle d'`install.sh` et celle du vhost sont
  ÉGALES » le prouve.
- La liste des 28 écrans a disparu : les routes sont **découvertes** dans `js/app.js`
  (Q-46), et la liste résiduelle — celle des enregistrements qu'ouvre chaque route à
  paramètre — est le bon outil : son omission **échoue bruyamment**.
- Le registre d'entités du serveur est **recoupé avec `pg_catalog` au démarrage** et fait
  échouer le lancement s'il diverge (mesuré : le serveur journalise « Catalogue PostgreSQL
  découvert, registre d'entités vérifié », 48 tables, 21 entités).

**Un sixième générateur d'identifiants.** Le `CONVENTIONS.md` §2 en recense cinq. J'ai
balayé tout tirage aléatoire du produit hors bibliothèque embarquée : `UI.genId`
(`crypto.getRandomValues`), `engendrerIdentifiant` (`randomBytes(16)`),
`f_generer_id` (SQL), et les deux **dérivations** de la reprise. Les deux replis
défensifs (`datastore.js:81`, `importExcel.js:27`) délèguent bien à `UI.genId` ; leur
branche `Math.random` n'est atteignable que si `ui.js` n'est pas chargé, or `index.html`
le charge en ligne **85** et `importExcel.js` en **138** — la branche est morte en usage.
Idem pour le repli `Math.random` d'`ui.js` : il exige l'absence de
`crypto.getRandomValues`, c'est-à-dire un contexte non sécurisé, que le vhost interdit
(HTTPS obligatoire, 308 depuis le port 80). **Documenté, et hors d'atteinte en
déploiement.**

**Une fuite de périmètre.** 157 sondes, aucune dérive (§4, S2). J'ai aussi vérifié la
**forme** que le `CONVENTIONS.md` §22 donne comme la vraie garantie : `resoudre()` ne prend
aucun argument, et `js/core/api.js` n'expose aucun paramètre de filiale — c'est toujours
vrai.

**Une injection.** 30 formes, aucune (§4, S5). Les identifiants d'objet interpolés le sont
par `ident()` depuis une liste close issue du catalogue, jamais depuis l'entrée.

**Un oracle d'existence.** Ligne cachée et ligne absente rendent la **même** réponse, sans
`version_actuelle` ; la filiale voisine n'est nommée nulle part. Mesuré, et le banc le
tient aussi.

**Une écriture qui échappe au verrou.** Six champs techniques refusés sur six, `UPDATE 0`
diagnostiqué dans la transaction, 409 + `GRC03` sur conflit, 404 sur invisible.

**Un fichier servi qui ne devrait pas l'être.** Neuf formes d'URL testées à travers le
vhost (`data/LISEZ-MOI.md`, `.env`, `js/../index.html`, `index.html%00.js`, répertoires
avec et sans barre finale) : la seule qui passe est la traversée `js/../index.html`, qui
**revient au même fichier** et est servie parce qu'elle est légitime. Les 64 fichiers
publiés passent, le reste est refusé.

**Un secret en réponse ou en journal.** Rien sur ~200 réponses lues ; `pino` masque cookie,
`authorization` et `set-cookie` ; le démarrage en production refuse et nomme les variables
manquantes **sans les afficher**.

**Une reprise partielle.** Aucune : tout ou rien, y compris la ligne d'`imports` (§4, S14).

**Un `git checkout` de ma part.** Aucun. `git status --porcelain` rend, au terme de ce
travail, ce seul fichier.

---

## 7. Ce que je n'ai pas pu vérifier

Je sépare ce qui est **impossible ici** de ce qui n'a été que **non tenté** — c'est la
distinction que le 7ᵉ passage a payée le plus cher, et la seule qui rende une réserve
utile.

### 7.1 Impossible sur cette machine — et je l'ai vérifié plutôt que de le supposer

| Sujet | Ce que j'ai tenté, et ce que cela a rendu |
|---|---|
| **PostgreSQL 17** | `apt-cache policy postgresql-17` → **aucun candidat** ; le dépôt PGDG qu'`install.sh` ajoute est **bloqué par le mandataire sortant** (`https://apt.postgresql.org/…` → 403). Tout est donc mesuré sur **PostgreSQL 16.13**, la cible restant 17. La réserve est réelle, et elle reste entière |
| **TLS d'une vraie PKI** | Certificat auto-signé ; Apache journalise `AH01906: server certificate is a CA certificate`. La *politique* (protocoles et suites) est lisible et le 8ᵉ passage l'a mesurée ; la **chaîne** ADCS ne l'est pas |
| **`systemd-analyze security`** | `System has not been booted with systemd as init system (PID 1). Can't operate.` — PID 1 est `process_api`. La **note de durcissement** de l'unité (`ProtectSystem=strict`, `NoExecPaths`, `PrivateTmp`) reste non mesurée. En revanche `systemd-analyze verify` **fonctionne** et rend l'unité valide : voir **Q-63** |
| **Installation Debian 13 complète** | `install.sh` exige `root`, `apt`, une VM et un accès sortant ; ses **blocs** sont joués un par un par le banc, le script entier ne l'est pas |

### 7.2 Non tenté — et pourquoi

| Sujet | Pourquoi je m'en suis abstenu |
|---|---|
| **ClamAV** (`clamav-daemon` est dans les dépôts) | **Hors périmètre du lot L2.** Vérifié plutôt que supposé : `grep -rilE "clamav|clamd" backend/src/` ne rend que `config/index.ts` (validation de variables) — **aucun client, aucun appel**. Il n'y a rien à éprouver avant le lot **L6** ; l'installer aurait mesuré ClamAV, pas le produit |
| **Active Directory** (`slapd`, `ldap-utils` sont dans les dépôts) | Même raison. `src/` ne porte aucun client LDAP : la configuration valide `LDAP_*` au démarrage — je l'ai constaté, le serveur **refuse** de partir sans elles en production — mais rien ne s'y connecte. C'est le lot **L3**, et son point d'accroche (`ResolveurPerimetre`) est une interface encore vide |
| **Relais SMTP** | Lot L12. `smtp: "désactivé"` au démarrage ; aucun envoi dans `src/` |
| **La reprise à l'échelle (Q-9 / Q-20)** | Je n'ai pas rejoué 60 000 enregistrements ni dix reprises simultanées. J'ai vérifié que la **borne** existe (`lignesParReprise = 8000`), que la saturation du pool rend un **503 explicite** et non un 500 opaque, et que le chemin d'abandon est branché. Le chiffre de 98,9 s du 8ᵉ passage n'est **pas** revérifié |
| **Les dix-sept mutations du 8ᵉ passage** | Je les ai relues, pas refaites (§3.2). J'ai porté mon effort sur les dix fermetures qu'aucun auditeur n'avait vues — Q-44 à Q-53 — et sur les instruments. **Un lecteur qui veut la couverture complète doit lire les deux rapports** |
| **Les 26 modules métier** | C'est le constat **Q-16**, ouvert et reporté à la vague 3. Je l'ai confirmé (aucun nom de module dans `test/navigateur/`), je ne l'ai pas comblé : ce n'est pas le travail d'un auditeur |

### 7.3 Ce que j'ai mesuré et qui n'avait jamais été mesuré ici

Pour que le dixième passage sache où repartir :

- **Le chemin complet en une seule pièce** — Chromium → Apache réel → serveur réel →
  PostgreSQL — création, rechargement, suppression, 0 erreur, 0 violation de CSP.
- **Le banc sur une machine sans l'entrée `/etc/hosts`** : 640/640 (Q-45 tient).
- **La borne applicative en `Transfer-Encoding: chunked`** : 413 côté service, **502 côté
  client**, et **1 Gio ingéré par le frontal** (Q-58).
- **`systemd-analyze verify` sur l'unité livrée** : valide, sans avertissement (Q-63).
- **Le coût d'un corps de 18 Mio avant toute décision**, à travers Apache : **304 ms** sur
  `/api/reprise`, 157 ms sur `/api/entites/*`, contre 2 ms pour `/api/sante` (Q-10, chiffre
  à corriger dans le registre).

---

## 8. Ce que je dirais si l'on me demandait où en est le lot

Le cœur de L2 est solide, et il l'est plus qu'au 8ᵉ passage : les fermetures que j'ai
rejouées mordent toutes, la jonction que S17 réclame fonctionne quand on la fait, et je
n'ai pas su déplacer d'un pouce le périmètre, le cloisonnement, le verrou ou la
paramétrisation des requêtes.

Ce qui refuse la porte tient en une phrase, et c'est la même que le chantier écrit depuis
quinze passages sous des déguisements différents : **quatre instruments disent « ok » sur
ce qu'ils ne regardent pas** — un registre qui ne voit pas sa propre queue, un contrôle
d'en-têtes qui ne connaît qu'une orthographe, un filet de vhost qui compare moins de la
moitié des décisions, un garde-fou de commit qui ignore les cinquante-neuf balises de la
page — **et une phrase d'interface qui promet, du geste qu'elle recommande, l'inverse de
ce qu'il fait**.

Aucun de ces cinq défauts n'aurait été trouvé par un banc plus vert. Trois n'ont été
trouvés qu'en cassant l'instrument lui-même ; le quatrième, en faisant ce que le produit
écrit à l'utilisateur plutôt que ce que l'essai trouve commode de cliquer ; le cinquième,
en interrogeant une route que personne n'interroge. C'est exactement le programme que le
§7 du plan d'exécution s'est donné, et il continue de rendre.

**La vague 3 ne s'ouvre pas.** Les conditions d'entrée du `CONVENTIONS.md` §22 restent
valables et non entamées : je les ai relues et rien de ce que j'ai mesuré ne les modifie.

---

*Rapport rédigé le 02/09/2026 par l'auditeur du 9ᵉ passage de la porte S2. Aucun fichier du
dépôt n'a été modifié : `git status --porcelain` ne rend que ce rapport.*
