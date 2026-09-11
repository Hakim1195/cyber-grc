# Porte S8 — 9ᵉ passage, PÉRIMÈTRE B

**Surfaces exposées, droits, et le fait que le produit fonctionne.**

| | |
|---|---|
| **Auditeur** | indépendant — n'a écrit aucune des lignes examinées |
| **Date** | 11/09/2026 |
| **Révision auditée** | `bdb1e40` (`Réancrer les chiffres sur 30f2d84`), arbre propre |
| **Machine** | `SRV-Infra`, Debian 13 — recette en ligne (`https://grc.exemple.interne/`), Apache 2.4.68 + vhost du dépôt, service `cyber-grc` sur 3001, PostgreSQL 17.11, ClamAV actif |
| **Périmètre** | contrôles **S6, S7, S8, S9, S10, S11, S12, S13, S15, S17, S18** |
| **Hors périmètre** (auditeur A) | S1, S2, S3, S4, S5, S14, S16 |

> **Convention d'écriture** (`PLAN_EXECUTION` §4) : « **porte S8** » désigne la porte du
> chantier, « **contrôle S7** » l'un des dix-huit contrôles de la grille. Dans ce rapport,
> un numéro seul dans un tableau de contrôles désigne un **contrôle**.

---

## Déclaration d'innocuité

**`git status --porcelain` au début de l'audit** : *vide*. Révision `bdb1e40`.

**`git status --porcelain` à la fin** :

```
?? docs/securite/RAPPORT_S8_NONIES_A.md
```

— le rapport de l'auditeur A, qui ne m'appartient pas. **Aucun fichier du produit, du banc
ou de la documentation n'a été modifié.** Le seul fichier que j'ai écrit est celui-ci.

**Toutes les mutations ont été jouées sur une copie** du dépôt, sous le scratchpad
(`scratchpad/copie`, révision `bdb1e40`), **jamais sur l'arbre de travail ni sur la
recette** — c'est la leçon du constat Q-281. La copie a été remise à neuf après chaque
mutation, et son `git status` vérifié vide à chaque fois.

**Ce que j'ai écrit dans la base de recette, et que j'ai retiré.** Les contrôles S17 et S18
exigent les gestes réels d'un utilisateur : j'ai créé **17 documents** (préfixe `AUDIT-B9`),
**2 traitements** (un local, un de portée Groupe), déposé **une pièce jointe** saine, et
basculé deux fois la filiale active d'une session de portée Groupe. **Tout a été supprimé**
et le volume de la filiale est revenu à son état d'avant l'audit :

```
volumes finaux : {"actions": 3, "risques": 2, "audits": 1, "history": 6, "personnes": 6}
restes AUDIT-B9 : []
```

⚠️ **Trois traces subsistent, et il faut les dire :**

1. **un fichier EICAR en quarantaine** — le produit **ne l'efface jamais**, à dessein ; le
   diagnostic passe de « 5 fichier(s), 64K » à « **6 fichier(s), 76K** » ;
2. **les entrées du journal d'audit**, qui est en ajout seul : mes créations, suppressions,
   consultations, refus d'autorisation et bascules de filiale y sont **définitivement**
   inscrits. C'est le dessein du registre, pas un effet de bord ;
3. **douze échecs de connexion** sur l'identifiant `nexiste.pas.audit.b9`, **qui n'existe
   pas** dans l'annuaire. ⚠️ **Aucun compte réel de `grc-ad` n'a été soumis au cas
   négatif** — la règle du `CLAUDE.md` §0.3 (verrouillage à cinq tentatives) a été tenue.

**Je n'ai pas joué `install.sh --maj`** (un autre auditeur travaille en parallèle), ni
`db/dev/preparer_base_dev.sh`, et **je n'ai créé aucune filiale**.

---

## 1. Verdict des onze contrôles

| | Contrôle | Verdict | La preuve |
|---|---|---|---|
| **S6** | Droits vérifiés côté serveur à chaque requête | ✅ **passé** | **45 mesures** — 9 routes × 5 profils d'annuaire réels, à travers Apache (§2.1). `/api/export` : 403 pour `rssi.tls`, `qualite.tls`, `direction` ; 200 pour `admin.grc` et `rssi.groupe`. `/api/journal` : 200 pour le seul profil portant le domaine. `/api/rgpd/registre-produit` : 403 pour `direction`. Sans cookie → 401 ; cookie forgé de 43 signes → 401 |
| **S7** | Le droit d'export est distinct de la lecture | 🟡 **passé avec réserve** — *et c'est la première fois en quatre passages* | **Q-301 et Q-302 sont fermés, mesurés dans le journal de la recette** (§2.2). Sondage au repos → **0 entrée**. Quatre sondages successifs sous le seuil → trace au franchissement (`cumul: 27`). **J'ai balayé les 14 routes `GET`** d'un compte sans droit d'export : aucune quatrième route ne rend le jeu sans trace. Réserves : **B-6** (le budget sans trace se réarme à chaque changement de filiale active) et **B-7** (`GET /api/journal` rend le CONTENU des enregistrements sous `lire`, quand `/api/journal/export` exige `exporter`) |
| **S8** | Secrets | ✅ **passé** | `/etc/cyber-grc/env` en `0640 root:cyber-grc` ; `/var/lib/cyber-grc` en `0700` ; le mot de passe applicatif de la base cherché dans la racine web → **0 occurrence**, dans le dépôt → **0 occurrence** ; `/api/sante` ne rend que statut, version, environnement, durée et latence |
| **S9** | Chaîne de contrôle des pièces jointes | ✅ **passé** | EICAR **véritable de 68 octets**, confirmé par `clamd` interrogé **en témoin indépendant sur sa socket** (`stream: Eicar-Test-Signature FOUND`) → **400**, quarantaine annoncée. `.exe` → 400 avec la liste blanche. Faux `.docx` → 400 « le contenu ne correspond pas à son extension ». EICAR renommé `.pdf` → refusé **par la signature binaire, avant même l'antivirus**. Fichier sain → **201** avec SHA-256 et `etat_analyse: saine` |
| **S10** | Sortie et en-têtes | ✅ **passé** | CSP complète, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy` sur **`/`** — le chemin que l'utilisateur emprunte — **et** sur l'API. `Cache-Control: no-store` sur l'API. `/.git/config`, `/backend/README.md`, `/grc-backup.json`, `/CLAUDE.md`, `/SECRETS.local.md`, `/../etc/passwd` → **403**. Cookie `HttpOnly; SameSite=Strict; Secure` |
| **S11** | Limitation du rythme et verrouillage | 🟡 **passé avec réserve** | 12 tentatives sur un identifiant **inexistant** : 12 × 401, **un seul message distinct** une fois la `reference` ôtée. Le journal montre **5 « Échec de connexion »** puis **7 « Connexion refusée : trop de tentatives »** — le verrouillage a mordu au cinquième. Réserve : **B-10**, le verrouillage se distingue **au chronomètre** (18 ms contre 55 ms) |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ❌ **EN ÉCHEC** | **B-3** : le refus de portée rend au client **« une règle de cohérence entre plusieurs de ses champs (`filiale_id`, `traitement_filiale_id`) »** — deux colonnes que `/api/modele` ne contient **nulle part** (0 occurrence), dont une écrite par un déclencheur. Le commentaire du code justifie de les nommer par *« ce sont les noms que l'appelant a lui-même envoyés »* : **c'est faux pour cette contrainte**. Et **B-2** : `GRC07` devient un **500 `erreur_interne`** avec pile d'appel au journal technique, pour une faute de saisie |
| **S13** | Dénis de service applicatifs | 🟡 **passé avec réserve** | **Les bornes tiennent toutes, mesurées à travers Apache** : corps de 30 Mo → **413 en 13 ms** ; `titre` > 200 000 signes → 400 ; 1 001 étiquettes → 400 ; JSON à 1 000 niveaux → 400. Le compteur cumulé de Q-302 **est borné** (5 000 clés) et un appelant **ne peut pas multiplier les clés** — elles viennent du serveur. Réserve : **B-4**, trois des sept bornes ne sont retenues par rien, et l'une **fige le banc au lieu de le faire rougir** |
| **S15** | Dépendances | ✅ **passé** | `npm audit --omit=dev` → **`found 0 vulnerabilities`**, code de retour **0**, rejoué à `bdb1e40` |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ **passé** | Chromium réel derrière l'Apache du dépôt, **deux profils** : **31 écrans sous `rssi.tls` + 31 sous `admin.grc` = 62 passages**, plus fiches, formulaires et impression. **0 violation de politique de sécurité de contenu. 0 écran vide.** Les seules erreurs de console sont le 401 attendu sur `/api/session` avant connexion, le 403 attendu sur `/api/journal` pour un compte sans ce domaine, et le 404 de **B-5** |
| **S18** | Le produit fait ce qu'il doit faire | 🟡 **passé avec réserve** | **Le parcours complet a été joué et ne détruit rien** (§3). Réserves : **B-1** (sur une MODIFICATION bloquée, le produit dit « n'a pas pu être **créé** » et conseille de **recharger**) et **B-2** (un traitement absent rend un 500 opaque) |

---

## 2. Ce que j'ai attaqué en priorité — les correctifs neufs

> *Trois passages de suite ont trouvé leur bloquant dans un correctif accepté au passage
> d'avant.* J'ai donc commencé par là.

### 2.1 La matrice des droits (contrôle S6)

```
ROUTE                              rssi.tls   qualite    admin      rssi.grp   direction
/api/donnees                       200        200        200        200        200
/api/export                        403        403        200        200        403
/api/journal?limite=2              403        403        200        403        403
/api/journal/export?limite=2       403        403        200        403        403
/api/consolidation                 200        200        200        200        200
/api/rgpd/registre-produit         200        200        200        200        403
/api/filiales                      200        200        200        200        200
/api/notifications/etat            403        403        200        403        403
/api/cycle/purge-rgpd              404        404        404        404        404
sans cookie : 401     cookie forgé : 401
```

Conforme, ligne à ligne, aux chartes de session rendues par `GET /api/session`.

### 2.2 ✅ Q-301 — fermé, et je l'ai vérifié dans le journal de la recette

**Le sondage au repos n'écrit plus rien.** Fenêtre de trois secondes, filiale portant
18 lignes d'inventaire :

```
depuis = 2026-09-11T12:20:44.000Z          (−3 s)
HTTP 200  taille 416
collections modifiees            : 0
lignes REELLEMENT rendues        : 0
somme des VOLUMES (inventaire)   : 18
journal : 1576 -> 1576 (delta 0)
```

**Le chiffre inscrit est désormais celui qui est sorti.** Là où le 8ᵉ passage lisait
« Extraction du jeu de données par le sondage (30 lignes rendues) » à côté de
`collections: 0`, il n'y a plus d'entrée du tout.

### 2.3 ✅ Q-302 — le compteur cumulé fonctionne… et son budget se réarme (**B-6**)

**Il fonctionne.** Douze documents créés, puis quatre sondages rendant chacun 12 lignes,
tous sous le seuil de 25 :

```
sondage 1 : lignes rendues=12  delta journal=0
sondage 2 : lignes rendues=12  delta journal=1
   « Extraction du jeu de données par sondages successifs. »
   {"cumul": 27, "motif": "cumul_par_session", "lignes": 12, "collections": 1,
    "export_autorise": false}
sondage 3 : lignes rendues=12  delta journal=0
sondage 4 : lignes rendues=12  delta journal=0
```

L'échappée que **B-2 du 8ᵉ passage** décrivait — *« il suffit que la filiale soit
petite »* — **est fermée** : le seuil a cessé d'être une propriété de la taille de la
filiale.

**Ce que j'ai trouvé à la place : le budget se réarme par filiale active.** Session
`rssi.groupe`, portée Groupe, deux filiales. Le compteur de TLS était à **28** ; bascule
sur DEU, puis quatre sondages :

```
DEU-a (bascule HTTP 200, active=DEU) : lignes=2  delta=0
DEU-b : lignes=2  delta=0
DEU-c : lignes=2  delta=0
DEU-d : lignes=2  delta=0
```

Voir **B-6**.

### 2.4 ✅ Q-303 — fermé à l'écran, et l'écouteur ne fuit pas

Chromium réel, Apache réel, gestes d'un utilisateur ordinaire — création d'un document puis
lecture de l'encart **sans recharger** :

```
hash                 : #/documents/DOC-1789129641244-0i2cw4lzqsvc6yioemyk5nliu
encartDataId         : DOC-1789129641244-0i2cw4lzqsvc6yioemyk5nliu     ← le BON
encartTexte          : « Circuit d'approbation · ÉTAT DU CIRCUIT En Cours · TOUR EN COURS
                         n° 1 · ÉTAPE ATTENDUE Rédaction · 1 Rédaction / 2 Revue /
                         3 Approbation / 4 Publication · Prendre la décision… »
« autre filiale » présent : false
« introuvable » présent   : false
écouteurs « grc:identifiant-recale » ajoutés après 6 navigations : 0
```

**Le circuit est lisible sans rechargement, le mot « autre filiale » a disparu, et
l'écouteur est posé une seule fois** — il est enregistré à la définition du module, donc
aucune navigation n'en ajoute. Les trois questions posées reçoivent la bonne réponse.
Réserve : **B-5**.

### 2.5 ✅ Q-294 — les deux sens sont justes, à l'écran ET par la route

**Par la route :**

| Sens | Attendu | Mesuré |
|---|---|---|
| document **local** → traitement **Groupe** | ouvert (Q-294) | **201** |
| document **Groupe** → traitement **local** | fermé (N-10) | **400** |
| document **Groupe** → traitement **Groupe** | ouvert | **201** |

**À l'écran** (Chromium, `admin.grc`) :

```
DOCUMENT DE PORTEE GROUPE : options = ["— Aucun —","AUDIT-B9-traitement-groupe"]
  note = « Portée Groupe : seuls les traitements de portée Groupe sont proposés — un socle
           commun ne peut pas dépendre d'une ligne qu'une filiale peut effacer. »
DOCUMENT LOCAL            : options = ["— Aucun —","AUDIT-B9-traitement-local",
                                       "AUDIT-B9-traitement-groupe"]
  note = (aucune)
```

**L'écran dit exactement ce que la base fait.** Réserves : **B-2**, **B-3**, **B-11**.

### 2.6 ✅ Q-305 / Q-306 — l'échappement tient, le champ à puces aussi

Étiquette hostile `<img src=x onerror=window.__xss=1>` saisie à l'écran, enregistrée,
**rechargée par F5**, affichée en liste, en puce et en `<option>` de filtre :

```
images injectées : 0   |  boîtes de dialogue : 0  |  violations de CSP : 0
etiquettesRendues : ["<img src=x onerror=window.__xss=1>","RGPD","audit 2026"]
optionsFiltre     : ["","<img src=x onerror=window.__xss=1>","audit 2026","RGPD"]
```

Et le dédoublonnage insensible à la casse tient : `RGPD` puis `rgpd` ne laisse qu'une puce.

### 2.7 ✅ Q-307 — la trace existe, et elle **ne recopie pas** la carte du schéma

```
consultation_sensible | Lecture du registre des données personnelles du produit.
{"motif": "registre_produit", "colonnes": 197, "personnelles": 48}   ← 66 octets
```

La question posée était : *la trace recopie-t-elle la carte du schéma dans le journal ?*
**Non.** Elle porte trois nombres, et la réponse servie en fait **64 535**. C'est le bon
partage. Le droit d'accès et le contenu n'ont pas été amputés, ce que le commit annonce.

### 2.8 ⚠️ Q-308 — fermé sur la **création**, et laissé ouvert sur la **modification**

**Ce qui est corrigé**, mesuré sur la recette :

```
POST /api/entites/documents  {"etiquettes":["RGPD","rgpd"]}
→ 409 « Cet enregistrement n'a pas pu être créé : l'une de ses clés est déjà utilisée.
        Corrigez la valeur en double et réessayez — rien n'a été enregistré, et votre
        saisie est conservée tant que vous ne quittez pas l'écran. »
```

**Ce qui ne l'est pas** : voir **B-1**.

### 2.9 ⚠️ Q-304 — les sept bornes : quatre mordent, une fige, deux ne mordent pas

Voir **B-4** et le tableau des mutations (§5).

---

## 3. Le parcours complet d'un utilisateur — contrôle S18

Chromium réel, Apache réel, `rssi.tls`. Créer · saisir · classer · étiqueter · enregistrer ·
**recharger par F5** · filtrer · imprimer.

```
note de confidentialité après bascule : « Le cercle le plus étroit : juridique, RH,
                                          réponse à incident. »        ← elle suit
puces AVANT enregistrement : ["<img src=x onerror=…>","RGPD","audit 2026"]
                              (« rgpd » dédoublonné à la casse)

=== APRÈS RECHARGEMENT COMPLET (F5) ===
{"titre":"AUDIT-B9-S18","conf":"restreint","dp":true,
 "puces":["<img src=x onerror=…>","RGPD","audit 2026"],
 "xss":false,"img":0,"scripts":0}

liste                       : 16 lignes
après filtre « restreint »  : 1 ligne
après remise à zéro         : 16 lignes
impression PDF              : 105 508 octets
violations de CSP : 0   |   dialogues : 0
```

**Rien n'est détruit, rien n'est perdu, rien n'est injecté.** La classification, la coche
« données personnelles » et les trois étiquettes reviennent **à l'identique** après un
rechargement complet.

---

## 4. Les constats

## B-1 🟠 — Sur une MODIFICATION bloquée, le produit dit « n'a pas pu être **créé** » et conseille de **recharger** : Q-308 est fermé sur une seule des deux moitiés

**L'énoncé.** Le correctif de Q-308 passe `origine: 'creation'` à `traduireErreur()`. Il est
posé sur **une seule route** — `POST /api/entites/:entite` — et lu par **un seul**
SQLSTATE. La route de modification, elle, remonte au gestionnaire global
(`src/api/index.ts:854`), qui n'a pas d'`origine`.

**La mesure**, sur la recette, à travers Apache, `rssi.tls` :

```
PUT /api/entites/documents/DOC-…   {"version":1,"champs":{"etiquettes":["RGPD","rgpd"]}}

HTTP 409
{"erreur":"contrainte_base",
 "message":"Cet enregistrement n'a pas pu être créé : l'une de ses clés est déjà utilisée.
            Rechargez la liste, puis reprenez la saisie."}
```

**Deux défauts dans une seule phrase**, sur un geste qui est une **modification** :

1. *« n'a pas pu être **créé** »* — factuellement faux ;
2. *« **Rechargez** la liste, puis reprenez la saisie »* — c'est-à-dire *jetez le formulaire
   que vous venez de remplir*. C'est, à la formulation près, **le bloquant du 6ᵉ passage de
   la porte S2**, dont le `CLAUDE.md` garde la leçon : *« une même formulation servait deux
   couches : vraie pour la reprise (« rechargez »), destructrice pour une création
   bloquée. »*

**Et la même phrase sort du second chemin de création du produit.**
`src/import/moteur.ts:674` appelle `traduireErreur(erreur, options.contexteErreurs ?? {})`,
et `src/import/index.ts:282` construit ce contexte **sans `origine`** — vérifié : sur les
**dix** appelants de `traduireErreur` du dépôt, **trois** passent une `origine`, et aucun
n'est sur le chemin de l'import.

```
src/import/moteur.ts:674 :  traduireErreur(erreur, options.contexteErreurs ?? {})
src/api/index.ts:854     :  traduireErreur(erreur, contexteErreurs)        ← PUT et DELETE
src/api/index.ts:2492    :  traduireErreur(erreur, {…, origine: 'creation'}) ← POST seul
```

**Honnêteté sur l'atteignabilité** : j'ai mesuré que la SPA **dédoublonne à la casse** côté
navigateur (§2.6), ce qui écarte ce cas précis pour le geste ordinaire. Restent la route
elle-même, l'**import généralisé**, la reprise et `psql` — et trois autres unicités
atteignables en modification (`uq_document_etiquettes_casse`, `uq_evaluations_ref_code`,
`uq_history_filiale_date`).

⚠️ **C'est le travers nommé du chantier** : *on a corrigé l'instance, pas la classe.*
L'essai neuf `test/api/bornes.test.mjs:247` couvre exactement cette contrainte — **en
`POST` seulement**.

## B-2 🟠 — Le refus `GRC07` n'arrive jamais à l'utilisateur : il devient un **500 avec pile d'appel**

**L'énoncé.** La migration `030` — le correctif de Q-294, livré par ce lot — pose
`f_documents_traitement_portee()`, qui refuse un traitement absent avec un message soigné et
un `hint` :

```sql
raise exception 'Le traitement « % » n''existe pas dans votre périmètre.', new.traitement_id
    using errcode = 'GRC07',
          hint    = 'Choisissez un traitement de votre filiale, ou un traitement de
                     portée Groupe.';
```

**`src/erreurs/index.ts` ne connaît pas `GRC07`.** Il traite `GRC01`, `GRC02`, `GRC04`,
`GRC05` et `GRC06` ; `GRC07` tombe dans le générique.

**La mesure**, sur la recette :

```
POST /api/entites/documents   {"traitement_id":"TRT-0000000000000-zzzz…"}

HTTP 500
{"erreur":"erreur_interne",
 "message":"Le serveur n'a pas pu traiter la demande. L'incident est journalisé."}
```

Et au journal technique du service, **niveau 50** :

```
{"level":50,"erreur":"erreur_interne",
 "detail":"sqlstate=GRC07 · Le traitement « TRT-0000000000000-zzzz… » n'existe pas dans
           votre périmètre. · entite=documents id=DOC-…",
 "pile":"ErreurApplicative: Le serveur n'a pas pu traiter la demande…
    at traduireErreurEntite (…/dist/erreurs/index.js:192:16)
    at traduireErreur (…/dist/erreurs/index.js:140:16) …",
 "msg":"Échec du traitement de la requête"}
{"res":{"statusCode":500},"responseTime":7.18,"msg":"request completed"}
```

**Le rayon.**

1. **Contrôle S18** : un utilisateur qui désigne un traitement supprimé entre-temps — la
   liste de son écran datant de son dernier chargement — reçoit *« Le serveur n'a pas pu
   traiter la demande »*. Il ne peut pas savoir quoi corriger, et le message écrit pour le
   lui dire existe, à trois couches de là.
2. **Contrôle S12** : une faute de saisie est classée **incident serveur**, avec pile
   d'appel au journal technique. Un appelant peut en produire autant qu'il veut.
3. Le `hint` de la migration est **mort** : rien ne le lit.

⚠️ **Et voici pourquoi le banc ne pouvait pas le voir** : `GRC07` **est** éprouvé, mais
**en SQL direct**, jamais par la route —
`test/documents/classification.test.mjs:435-448` fait
`c.query("update documents set traitement_id = 'TRT-B' …")` et vérifie
`erreur.code === 'GRC07'`. *L'essai prouve que le déclencheur se déclenche ; personne ne
mesure ce que l'utilisateur reçoit.* C'est la moitié du chemin.

## B-3 🟠 — Le refus de portée nomme **deux colonnes internes** que le client ne connaît pas — et le commentaire du code justifie de les nommer par une prémisse fausse

**L'énoncé.** L'autre sens du même correctif — document de portée Groupe vers traitement
local — rend :

```
HTTP 400
{"erreur":"donnee_invalide",
 "message":"Cet enregistrement enfreint une règle de cohérence entre plusieurs de ses
            champs (filiale_id, traitement_filiale_id). Vérifiez qu'ils ne se
            contredisent pas."}
```

**Aucune de ces deux colonnes n'existe pour le client.** Mesuré mécaniquement sur
`GET /api/modele` :

```
champs documents servis au client : ['confidentialite','date_revue','donnees_personnelles',
  'emplacement','notes','proprietaire','statut','titre','traitement_id','type',
  'validation_engagee','version']
filiale_id present            : False
traitement_filiale_id present : False
occurrence de « traitement_filiale_id » dans TOUT le modèle : 0
occurrence de « filiale_id » dans TOUT le modèle            : 0
```

`traitement_filiale_id` est posée par le déclencheur lui-même — la migration l'écrit :
*« Il ÉCRASE ce que le client aurait envoyé »*.

**La cause, et elle est du motif que ce chantier connaît par cœur.**
`src/erreurs/index.ts:786-790` explique pourquoi il est sûr de nommer ces colonnes :

> *« on dit qu'une règle porte sur PLUSIEURS champs, et on nomme ceux-là — ce sont les noms
> que **l'appelant a lui-même envoyés**, et qui figurent déjà dans `/api/modele`. »*

**La prémisse est fausse pour cette contrainte**, qui est neuve. *La règle était écrite,
vingt lignes au-dessus de la ligne qui la viole.*

**Le rayon.** Contrôle S12 : *« aucun nom d'objet de base en réponse »*. Le message livre
deux noms de colonnes exacts, dont un qui révèle qu'une valeur de portée est **dérivée et
stockée** — une information de conception qu'un attaquant interne n'a aucun autre moyen
d'obtenir. Et pour l'utilisateur légitime, le message est inutilisable : il désigne deux
champs qu'il n'a jamais vus, alors que l'écran, lui, sait dire la vraie règle.

## B-4 🟠 — Trois des sept bornes ne sont retenues par rien, et l'une **fige le banc au lieu de le faire rougir**

Le constat **Q-304** demandait que les sept garde-corps de `BORNES` soient mordus. Le
fichier neuf `test/api/bornes.test.mjs` l'affirme en tête :

> *« L'essai suit donc la borne — et il rougit si elle disparaît, si elle est **relevée d'un
> facteur cent mille**, ou si elle cesse d'être appliquée. »*

**J'ai relevé chacune des sept d'un facteur cent mille. Voici ce qui s'est passé :**

| Borne | Famille | Verdict |
|---|---|---|
| `elementsParLiaison` | `api/bornes` | ✅ mord — 1 échec en **7 s** |
| `caracteresParValeur` | `api/bornes` | ✅ mord — 1 échec en 7 s |
| `profondeurJson` | `api/bornes` | ✅ mord — 1 échec en 7 s |
| `noeudsJson` | `api/bornes` | ✅ mord — 1 échec en 7 s |
| `lignesParReprise` | `api/bornes-reprise` | ✅ mord — 8 essais tombés en 7 s |
| **`champsParEnregistrement`** | `api/bornes` | ⚠️ **rougit PUIS SE FIGE** |
| **`lignesParLiaison`** | `api/bornes` | ❌ **NE MORD PAS** — 9/9 verts |
| **`lignesParSondage`** | `api/bornes` | ❌ **NE MORD PAS** — 9/9 verts |

**(a) `champsParEnregistrement` — le défaut que le correctif dit avoir fermé.** Le message
du commit annonce *« avec un plafond de matière sans lequel l'essai se figeait au lieu de
rougir »*. Le plafond garde `justeAuDessus()` — et **pas l'autre moitié du même fichier** :

```
test/api/bornes.test.mjs:287
    for (let i = 0; i < BORNES.champsParEnregistrement - 10; i += 1) {
      champs[`champ_${String(i)}`] = 'x';
```

Mesuré :

```
code de retour=124  duree=100s   (124 = tué par le délai de garde, PAS rouge)
    not ok 2 - champsParEnregistrement — un enregistrement à mille champs est refusé
      error: 'La borne « champsParEnregistrement » vaut 100000000, au-delà du plafond de
              5000 que cet essai sait éprouver…'
```

Le bon verdict est **prononcé**, puis le contrôle S18 du même fichier construit un objet de
cent millions de clés et **le banc ne rend jamais la main**. Un `npm test` s'enliserait sans
dire pourquoi. *Le plafond a été posé à un endroit et oublié à l'autre, dans le fichier
écrit pour poser le plafond.*

**(b) `lignesParSondage` — l'assertion lit la borne qu'elle prétend garder.**

```
test/api/bornes.test.mjs:241
    assert.ok(rendues <= BORNES.lignesParSondage, …)
```

Le jeu semé rend quelques lignes ; l'inégalité est **trivialement vraie** quelle que soit la
borne. L'essai mesure *« le produit respecte la borne qu'il déclare »*, jamais *« la borne
déclarée est sûre »* — et c'est précisément la mutation que Q-304 existe pour voir.

**(c) `lignesParLiaison` — seule son existence est vérifiée.** Elle n'apparaît que dans le
contrôle « les huit bornes existent et sont des nombres » (ligne 132). La relever d'un
facteur mille laisse tout au vert.

⚠️ Les bornes **fonctionnent** — je les ai mesurées vivantes à travers Apache (§1, S13).
Ce constat porte sur le **dispositif qui les mesure**, pas sur le produit.

## B-5 🟠 — L'inversion qui EST le correctif de Q-303 n'est mordue par rien, et un 404 part encore à chaque création

**L'énoncé.** Le correctif de Q-303 a deux moitiés, et son commentaire désigne la première
comme la vraie :

> *« ⚠️ **L'inversion est le vrai correctif, et corriger l'appelant ne suffisait pas.** Un
> appelant qui transmet un identifiant capturé est une faute qui reviendra […] La source la
> plus fraîche doit donc gagner. »*

```
- const i = id || noeud.dataset.id;
+ const i = noeud.dataset.id || id;
```

**La mutation (M8) : j'ai remis l'ordre d'origine.**

```
node --test --test-concurrency=1 test/navigateur/classification-documents.test.mjs
# pass 7   # fail 0
```

**Sept essais verts.** La seconde moitié — l'événement `grc:identifiant-recale` — est bien
tenue (**M7 mord**, 1 échec) ; elle appelle `brancherEncart(null, null)`, si bien que
l'argument est `undefined` et que l'inversion **ne décide jamais**. *Un essai qui couvre une
règle sans jamais la faire décider ne la couvre pas* — c'est le motif exact du constat
**Q-210**. Le jour où un appelant transmettra de nouveau un identifiant capturé, Q-303
reviendra **en silence**.

**Et le 404 subsiste.** À chaque création de document, dans Chromium derrière l'Apache
réel :

```
404 GET api/approbations/documents/DOC-1789130667028-1-rhhvovp1tmus
CONSOLE Failed to load resource: the server responded with a status of 404 (Not Found)
```

L'encart se répare ensuite — c'est le correctif, et il marche — mais le premier appel part
toujours avec l'identifiant provisoire. J'ai vérifié ce qu'il coûte : **le 404 n'écrit rien
au journal d'audit** (delta 0) et son message ne dit plus « autre filiale ». Le coût est
donc une erreur de console à chaque création, et un aller-retour inutile.

## B-6 🟠 — Le budget de 24 lignes sans trace se **réarme à chaque changement de filiale active**

**L'énoncé.** `CUMUL_SONDAGES` est indexé par `` `${utilisateurId}|${filialeId}` ``. La
filiale active fait donc partie de la clé : en changer ouvre un compteur neuf.

**La mesure**, `rssi.groupe` (portée Groupe, deux filiales, `GET /api/export` → 200 donc
compte *autorisé* ; le raisonnement vaut à l'identique pour `direction`, qui a la portée
Groupe **sans** l'export) :

```
TLS : 4 sondages   → cumul 28, une trace au 4ᵉ
bascule sur DEU    → HTTP 200
DEU-a : lignes=2  delta=0
DEU-b : lignes=2  delta=0
DEU-c : lignes=2  delta=0
DEU-d : lignes=2  delta=0      ← le compteur est reparti de zéro
```

**Le rayon.** Le premier palier est à 25 lignes cumulées : **24 lignes par filiale sortent
sans une entrée de journal**. Sur le produit tel qu'il est cadré — *« 20+ filiales,
acquisitions régulières »* — cela fait **≈ 480 lignes** extractibles sans trace d'extraction
par un compte de portée Groupe.

**Ce qui atténue, et je l'ai mesuré** : chaque bascule **est** journalisée.

```
bascule TLS -> DEU : delta journal = 1
changement_perimetre | Filiale active de la session changée.
```

Une rafale de `changement_perimetre` reste donc visible — mais elle n'est pas étiquetée
comme une extraction, et c'est « qui a extrait le jeu de données ? » que l'auditeur ISO
posera.

⚠️ **Une seconde remarque, arithmétique.** Le commentaire du plafond de clés écrit :
*« Vingt filiales fois quelques centaines de comptes tiennent très largement dessous »*,
pour `CUMUL_SONDAGES_MAX_CLES = 5000`. Vingt filiales × 250 comptes **font exactement
5 000**. Le dépassement ne fait pas croître la mémoire — il **vide la table entière**
(`CUMUL_SONDAGES.clear()`), c'est-à-dire qu'il remet à zéro le compteur de tout le monde.
La borne est saine pour S13 ; c'est l'affirmation « très largement dessous » qui est fausse
au haut de sa propre fourchette.

## B-7 🟡 — `GET /api/journal` rend le CONTENU des enregistrements sous le droit `lire`, quand `/api/journal/export` exige `exporter`

**L'énoncé.** Les deux routes servent les **mêmes dix-sept colonnes**, `valeurs_avant` et
`valeurs_apres` comprises — c'est-à-dire l'état complet de chaque enregistrement à chaque
écriture. Elles ne déclarent pas le même droit :

```
src/api/journal.ts:408 : config: { acces: { action: 'lire',     domaine: 'journal' } }   ← JSON
src/api/journal.ts:494 : config: { acces: { action: 'exporter', domaine: 'journal' } }   ← CSV
```

**La mesure :**

```
GET /api/journal?limite=3&action=creation   → 200
clés rendues : [... 'valeurs_apres','valeurs_avant', ...]
valeurs_apres : {"id":"DOC-…","type":"Procédure","titre":"AUDIT-B9-12","statut":"brouillon",
                 "confidentialite":"interne","donnees_personnelles":false, …}
suivant : 1586      ← la pagination n'a pas de fin
```

Page maximale 500, curseur `suivant` : un compte portant le domaine `journal` **sans**
`GRC-EXPORT` reconstitue le jeu de données en feuilletant, pendant que la même matière en
CSV lui est refusée en 403. En base, **seul le profil `ADMIN` porte le domaine `journal`**,
et `GRC-EXPORT` est un groupe d'annuaire **distinct** : la combinaison est atteignable par
configuration.

**Ce qui atténue** : **chaque page est tracée** — je l'ai mesuré, delta de journal = 1 par
appel. L'exigence *« tout export réussi ou refusé est journalisé »* du contrôle S7 est donc
**tenue** ; c'est la **distinction du droit** qui ne l'est pas pour cette matière.

## B-8 🟡 — « Douze sujets » : le chiffre est faux dans les trois documents que l'exploitant lit, et le commit qui annonce la correction n'a touché que les documents internes

**La mesure d'abord** :

```
$ sudo bash backend/deploy/install.sh --diagnostic
==> Bilan : 14 conforme(s), 1 réserve(s), 0 bloquant
```

**Ce que disent les fichiers** :

```
docs/INSTALLER.md:46           : « # 3 — Constater. Douze sujets contrôlés… »
docs/GUIDE_EXPLOITATION.md:110 : « Douze sujets, chaque ligne dit quoi faire : … »
                                  (et l'énumération qui suit en compte douze)
backend/deploy/install.sh:170  : « --diagnostic  … l'état des douze points qui cassent »
backend/deploy/install.sh:851  : « --diagnostic — l'état des DOUZE points… »
```

Le message du commit `bdb1e40` annonce pourtant :

> *« ⚠️ Et un chiffre faux corrigé au passage, dans TROIS documents : `--diagnostic`
> annonçait « douze sujets » depuis que le constat Q-290 l'avait porté à quatorze. Un
> chiffre faux est un constat, pas une coquille. »*

Les trois documents corrigés sont `CHANGELOG.md`, `CLAUDE.md`, `backend/README.md` et
`docs/PLAN_PRODUIT.md` — **des documents de conduite de chantier**. Les trois qui sont
restés faux sont le **guide d'installation**, le **guide d'exploitation** et **l'aide en
ligne de l'installateur lui-même** : exactement ceux que lit la personne qui exploite le
produit.

⚠️ **Et `install.sh` porte le chiffre faux dans son propre `--help`** : le guide n'a donc
pas recopié une erreur isolée, il en partage une avec sa source.

## B-9 🟡 — Le guide d'exploitation affirme que l'unité de notification « est la seule qui ouvre une connexion vers l'extérieur ». C'est faux, et l'oubli empêche toute connexion

**Le guide** (`docs/GUIDE_EXPLOITATION.md:235-239`) :

> *« Le produit envoie des relances d'échéance. **Trois unités `systemd` tournent** ;
> celle-ci est la seule qui ouvre une connexion vers l'extérieur.*
> *⚠️ **`IPAddressDeny=any` est posé sur toutes les unités, et il faut y AJOUTER le
> sous-réseau du relais SMTP** — plus celui du résolveur DNS s'il n'est pas en `127.x`. »*

**L'unité principale** (`backend/deploy/systemd/cyber-grc.service:118-119, 152`) :

```
IPAddressDeny=any
IPAddressAllow=localhost
…
# IPAddressAllow=10.0.0.0/8          ← commenté, à décommenter par l'exploitant
```

`cyber-grc.service` **doit joindre les contrôleurs de domaine du client en LDAPS**. Le
guide ne le dit nulle part : `grep -c "IPAddressAllow" docs/GUIDE_EXPLOITATION.md` → **0**.

**Ce qui atténue, et je l'ai vérifié** : `install.sh` porte un contrôle **bloquant** pour
exactement ce cas (`install.sh:3033-3040`), dont le message dit *« AUCUN utilisateur ne
pourrait se connecter : la liaison LDAPS serait refusée par le noyau, pas par l'annuaire »*.
Le produit est donc protégé à l'installation. **Le guide, lui, promet le contraire** — et
c'est le guide qu'on lit au §2 « Quand le client rachète une société », trois paragraphes
après avoir expliqué que l'oubli « produit un symptôme qui ment sur sa cause ».

**Deux imprécisions de la même famille, relevées sans les compter à part :**

- `docs/GUIDE_EXPLOITATION.md:461` : *« `f_verifier_colonnes_personnelles()` parcourt
  **toutes** les colonnes textuelles de la base »*. La migration `029` en exclut
  délibérément deux familles — les colonnes de **domaine** (`029:260`, « 114 colonnes »
  selon son propre commentaire) et les colonnes de traçabilité (`029:377`). La propriété
  centrale tient ; le mot « toutes » est faux, dans le guide même qui vient de consacrer un
  encadré à cette classe de faute.
- `docs/GUIDE_UTILISATEUR.md:373` : *« l'application compte 31 entrées de menu et **aucune
  ne porte ce nom** [Administration] »*. Le chiffre 31 est exact — je l'ai mesuré dans
  Chromium. Mais `index.html:66` porte
  `<li class="sidebar-divider">Administration</li>` : c'est un **intitulé de section**, pas
  une entrée. La conclusion opératoire est juste ; la phrase se fera contredire par le
  premier exploitant qui regardera sa barre latérale.

## B-10 🟡 — Le verrouillage se distingue **au chronomètre**, quand le message est identique à l'octet près

**Ce qui est excellent, et qu'il faut dire d'abord** : douze tentatives, douze 401, et **un
seul message distinct** une fois la `reference` ôtée :

```
{"erreur": "non_authentifie",
 "message": "Identifiant ou mot de passe incorrect, ou compte temporairement bloqué.
             Réessayez dans quelques minutes, puis contactez votre support informatique."}
```

**Ce que le chronomètre dit :**

```
0.018522s 0.018055s 0.018452s   ← identifiant VERROUILLÉ
0.057931s 0.048934s 0.059896s   ← identifiant jamais vu
```

Un facteur **trois**, stable sur trois échantillons de chaque côté : le chemin verrouillé
court-circuite avant l'annuaire. Un attaquant distingue donc *« cet identifiant est
actuellement verrouillé »* de *« il ne l'est pas »* — ce qui lui confirme que son
martèlement a porté et lui dit quand la fenêtre se rouvre.

⚠️ **Limite de ma mesure, et elle est nette** : je **n'ai pas** éprouvé le cas négatif sur
un compte réel de `grc-ad` (règle du `CLAUDE.md` §0.3, verrouillage à cinq tentatives). Je
ne peux donc **pas** dire si le chronomètre distingue aussi un compte **existant** d'un
compte inexistant. *« Non rejoué » ne vaut ni « passé » ni « en échec ».*

## B-11 🟡 — Le filtre d'écran de Q-294 n'est mordu par rien

**La mutation (M17)** : la liste des traitements proposés cesse de tenir compte de la portée
du document — c'est-à-dire que l'écran reproposerait la combinaison que la base refuse, le
défaut même que Q-294 décrivait (« le produit servait TOUS les traitements, les offrait ici,
et les refusait en 409 »).

```
- const traitements = doc._porteeGroupe === true
-     ? tousTraitements.filter(t => t._porteeGroupe === true)
-     : tousTraitements;
+ const traitements = tousTraitements;

node --test --test-concurrency=1 test/navigateur/classification-documents.test.mjs
# pass 7   # fail 0
```

La moitié « base » du correctif est gardée par `verifier_cloisonnement.sql` (contrôles C108
et C110, périmètre de l'auditeur A) ; la moitié « écran » ne l'est par rien. Et c'est
l'écran qui décide de ce que l'utilisateur peut cliquer.

---

## 5. Le tri

| Classe | Nombre | Lesquels |
|---|---|---|
| **Bloquent le fonctionnement du produit** | **0** | Aucun. Le parcours nominal — créer, saisir, classer, étiqueter, enregistrer, **recharger**, filtrer, imprimer — a été joué de bout en bout dans Chromium derrière l'Apache réel et **ne détruit rien** |
| **Fuite ou perte de données entre filiales** | **0** | Aucun franchissement de frontière observé. **B-6** est un défaut de **traçabilité**, pas d'accès : aucune ligne d'une filiale voisine n'est jamais sortie |
| **Le reste** | **11** | B-1 → B-11 |

**Par gravité : 0 🔴 bloquant · 6 🟠 majeurs (B-1 à B-6) · 5 🟡 mineurs (B-7 à B-11).**

⚠️ **Quatre des onze constats — B-4, B-5, B-11, et la moitié de B-1 — ne sont pas des
défauts du produit mais des défauts du DISPOSITIF QUI LE MESURE.** C'est la quatrième porte
consécutive où ce motif est présent ; il est cependant **nettement moins dominant** qu'au
8ᵉ passage (où 14 mutations sur 41 ne mordaient pas).

⚠️ **Deux constats portent sur des correctifs de CE lot** — B-2 et B-3 sur la migration
`030` (Q-294), B-5 sur Q-303 — mais **aucun ne rouvre le défaut qu'il fermait**, et c'est
la différence avec les trois passages précédents.

---

## 6. Les mutations jouées

**Dix-sept mutations, toutes sur une copie du dépôt**, jamais sur l'arbre de travail ni sur
la recette.

### Celles qui mordent — 13

| | Ce qui a été cassé | Famille jouée | Verdict |
|---|---|---|---|
| **M1** | Q-301 : recompter `charge.volumes` au lieu de `charge.modifications` | `journal/couverture` | ✅ **mord** — 2 échecs |
| **M2** | Q-302 : `cumulerSondage()` ne signale plus jamais | `journal/couverture` | ✅ **mord** — 2 échecs |
| **M3** | Q-307 : la trace du registre produit change de motif | `cycle/registre-produit` | ✅ **mord** — 1 échec |
| **M4** | Q-308 : `origine: 'creation'` retirée | `api/bornes` | ✅ **mord** — 1 échec |
| **M5** | Q-305 : `escapeHtml` retiré de l'étiquette affichée | `navigateur/classification-documents` | ✅ **mord** — 1 échec |
| **M6** | Q-306 : dédoublonnage insensible à la casse du champ à puces | `modules/non-regression` | ✅ **mord** — 1 échec *(⚠️ verte sur `navigateur/classification-documents` : la couverture vit dans l'autre famille, et c'est correct)* |
| **M7** | Q-303 : `sync.js` n'annonce plus le recalage d'identifiant | `navigateur/classification-documents` | ✅ **mord** — 1 échec |
| **M9** | borne `lignesParReprise` × 12 500 | `api/bornes-reprise` | ✅ **mord** — 8 essais tombés, 7 s |
| **M10** | borne `elementsParLiaison` × 100 000 | `api/bornes` | ✅ **mord** — 1 échec, 7 s |
| **M11** | borne `caracteresParValeur` × 500 | `api/bornes` | ✅ **mord** — 1 échec, 7 s |
| **M12** | borne `profondeurJson` × 8 M | `api/bornes` | ✅ **mord** — 1 échec, 7 s |
| **M13** | borne `noeudsJson` × 5 000 | `api/bornes` | ✅ **mord** — 1 échec, 7 s |
| **M14** | borne `champsParEnregistrement` × 1,25 M | `api/bornes` | ⚠️ **mord PUIS SE FIGE** — le bon verdict est prononcé, et le banc ne rend jamais la main (tué à 100 s) → **B-4** |

### Celles qui ne mordent pas — 4

| | Ce qui a été cassé | Famille jouée | Verdict |
|---|---|---|---|
| **M8** | Q-303 : `noeud.dataset.id \|\| id` remis en `id \|\| noeud.dataset.id` — *« l'inversion est le vrai correctif »* | `navigateur/classification-documents` | ❌ **NE MORD PAS** — 7/7 verts → **B-5** |
| **M15** | borne `lignesParLiaison` × 1 000 | `api/bornes` | ❌ **NE MORD PAS** — 9/9 verts → **B-4** |
| **M16** | borne `lignesParSondage` × 50 000 | `api/bornes` | ❌ **NE MORD PAS** — 9/9 verts → **B-4** |
| **M17** | Q-294 : l'écran repropose tous les traitements | `navigateur/classification-documents` | ❌ **NE MORD PAS** — 7/7 verts → **B-11** |

**Bilan : 17 mutations, 13 mordent, 4 ne mordent pas — et l'une de celles qui mordent fige
le banc au lieu de le rendre.**

⚠️ **À comparer au 8ᵉ passage : 41 mutations, 14 ne mordaient pas.** Le taux passe de
**66 %** à **76 %** de morsure. Et surtout, **aucune des quatre non-morsures ne cache un
défaut du produit** — ce sont quatre trous de couverture sur du code qui, lui, fonctionne.
C'est un progrès réel du dispositif, pas seulement du produit.

---

## 7. Ce qui tient — chiffré

- **Le banc complet est vert à la révision auditée** : `node --test --test-concurrency=1
  "test/**/*.test.mjs"` → **1 907 essais, 1 907 passés, 0 échec, 0 annulé**. Le chiffre du
  `backend/README.md` §8 est exact.
- **62 passages d'écran** dans Chromium réel derrière l'Apache du dépôt — 31 sous
  `rssi.tls`, 31 sous `admin.grc` —, plus fiches, formulaires et impression :
  **0 violation de politique de sécurité de contenu, 0 écran vide**, et pour seules erreurs
  de console le 401 attendu avant connexion, le 403 attendu sur `/api/journal` pour un
  compte qui n'a pas ce domaine, et le 404 de **B-5**.
- **Le parcours complet ne détruit rien** : classification `restreint`, coche « données
  personnelles », trois étiquettes dont une **hostile** et un doublon de casse, enregistrées
  puis **relues à l'identique après un F5** ; filtre 1 ligne sur 16, remise à zéro 16 ;
  impression **105 508 octets** de PDF.
- **L'échappement tient sur toute la chaîne neuve** : `<img src=x onerror=…>` stocké en
  base, rendu en liste, en puce et en `<option>` de filtre → **0 image injectée, 0 boîte de
  dialogue, 0 violation de CSP**.
- **Q-301 est fermé** : un sondage au repos écrit **0 entrée** de journal, là où le passage
  précédent en comptait trois en soixante-dix secondes.
- **Q-302 est fermé sur l'échappée qu'il visait** : quatre sondages de 12 lignes, tous sous
  le seuil, déclenchent la trace au franchissement (`cumul: 27`).
- **Q-303 est fermé à l'écran** : le circuit d'approbation est lisible **sans recharger**,
  le mot « autre filiale » a disparu, et l'écouteur ne fuit pas (**0 ajouté** après six
  navigations).
- **Q-294 est juste dans les deux sens, à l'écran ET par la route** : 201 / 400 / 201, et la
  liste de l'écran dit exactement ce que la base fait, avec sa note explicative.
- **Q-307 est fermé sans excès** : la trace porte trois nombres (66 octets) pour une réponse
  de 64 535 — elle ne recopie pas la carte du schéma.
- **S9** : EICAR **véritable** refusé et mis en quarantaine, avec `clamd` interrogé **en
  témoin indépendant** ; `.exe` refusé par la liste blanche ; faux `.docx` refusé par ce
  qu'il contient ; EICAR renommé `.pdf` refusé **avant** l'antivirus, par la signature
  binaire ; fichier sain accepté avec son SHA-256.
- **S13** : les quatre bornes que j'ai éprouvées vivantes tiennent — 30 Mo → **413 en
  13 ms**, `titre` hors borne → 400, 1 001 étiquettes → 400, JSON à 1 000 niveaux → 400.
- **S11** : douze tentatives, **un seul message**, verrouillage mordu au **cinquième**,
  et **aucun compte réel éprouvé**.
- **S6** : **45 mesures** (9 routes × 5 profils d'annuaire réels), toutes conformes aux
  chartes de session.
- **S8** : le mot de passe applicatif de la base cherché dans la racine web et dans le
  dépôt → **0 occurrence** de chaque côté.
- **`npm audit --omit=dev`** → **0 vulnérabilité**, code 0.
- **`install.sh --verifier-publication`** → **81 fichiers servis identiques au dépôt**.
- **`install.sh --diagnostic`** → **14 conformes, 1 réserve, 0 bloquant** — et c'est ce
  chiffre-là, pas celui des guides (**B-8**).

---

## 8. Ce que je n'ai pas pu mesurer

- **Le chronomètre sur un compte EXISTANT** (**B-10**) : la règle du `CLAUDE.md` §0.3
  interdit d'éprouver le cas négatif sur les comptes de `grc-ad`. Je ne peux donc pas dire
  si le temps de réponse distingue un compte existant d'un compte inexistant. **Non
  rejoué.**
- **`POST /api/reprise` en mode « remplacer »** : elle détruit le jeu de la filiale de
  recette, et un autre auditeur travaillait en parallèle. **Non rejouée** — comme au
  passage précédent.
- **Le comportement du compteur de Q-302 après un redémarrage du service** : il est
  documenté par son auteur (« le compteur ne survit pas à un redémarrage ») et je n'ai pas
  redémarré `cyber-grc`, l'auditeur A travaillant sur la même machine. J'ai en revanche
  mesuré l'autre réarmement, celui par la filiale active (**B-6**), qui ne demande aucun
  privilège.
- **Les écrans de détail de vingt-deux modules sur vingt-six** n'ont pas été ouverts un par
  un : j'ai parcouru les 31 listes sous deux profils, et les fiches qui portaient le lot
  neuf. Une régression de fiche ailleurs resterait invisible à ce passage.

---

*Rapport clos le 11/09/2026. `git status --porcelain` du dépôt relevé au début (vide) et à
la fin (le seul rapport de l'auditeur A, non suivi) : aucun fichier du produit, du banc ou
de la documentation n'a été modifié.*
