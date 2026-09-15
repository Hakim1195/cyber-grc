# Porte S8 — 10ᵉ passage, PÉRIMÈTRE B

**Surfaces exposées, droits, et le fait que le produit fonctionne.**

| | |
|---|---|
| **Auditeur** | indépendant — n'a écrit aucune des lignes examinées |
| **Date** | 14/09/2026 |
| **Révision auditée** | `1646d21`, arbre propre au début de l'audit |
| **Machine** | `SRV-Infra`, Debian 13 — recette en ligne (`https://grc.exemple.interne/`), Apache 2.4.68 + vhost du dépôt, service `cyber-grc` sur 3001, PostgreSQL 17.11, ClamAV actif |
| **Périmètre** | contrôles **S6, S7, S8, S9, S10, S11, S12, S13, S15, S17, S18** |
| **Hors périmètre** (auditeur A) | S1, S2, S3, S4, S5, S14, S16 |
| **Verdict du périmètre** | ❌ **REFUSÉ** — **0 bloquant, 1 majeur, 4 mineurs. 0 fuite entre filiales. 0 perte de données.** |

> **Convention d'écriture** (`PLAN_EXECUTION` §4) : « **porte S8** » désigne la porte du
> chantier, « **contrôle S7** » l'un des dix-huit contrôles de la grille. Dans un tableau
> de contrôles, un numéro seul désigne un **contrôle**.

---

## Déclaration d'innocuité

**`git status --porcelain` au début** : *vide*. `git rev-parse --short HEAD` → `1646d21`.
**L'arbre n'a pas bougé pendant l'audit** : `HEAD` est resté `1646d21`.

**`git status --porcelain` à la fin** :

```
?? docs/securite/RAPPORT_S8_DECIES_A.md
```

— le rapport de l'auditeur A, qui ne m'appartient pas. **Aucun fichier du produit, du banc
ou de la documentation n'a été modifié.** Le seul fichier que j'écris est celui-ci.

**Le déployé correspond bien à la révision auditée**, vérifié avant de commencer :

```
md5 /opt/cyber-grc/backend/dist/api/index.js        = 0d63b22182e52eba6b6abd407b85f1e0
md5 backend/dist/api/index.js (dépôt)               = 0d63b22182e52eba6b6abd407b85f1e0
md5 /opt/cyber-grc/frontend/js/modules/journal.js   = 2471bf33e229b7fed65640f2ebcf28ed
md5 cyber-gouvernance_V4/js/modules/journal.js      = 2471bf33e229b7fed65640f2ebcf28ed
install.sh --verifier-publication → 81 fichier(s) servis identiques au dépôt
```

**Où j'ai muté.** **Sept mutations, toutes sur une COPIE** du dépôt sous mon scratchpad
(`scratchpad/copie`, engendrée par `git archive HEAD`), **jamais sur l'arbre de travail ni
sur la recette** — c'est la leçon du constat Q-281. La copie a été remise à neuf après
chaque mutation et chaque fichier touché recomparé à `HEAD` (`IDENTIQUE` × 5 en fin d'audit).

**Je n'ai pas joué `install.sh --maj`** (un autre auditeur travaille en parallèle), ni
`db/dev/preparer_base_dev.sh`, et **je n'ai créé aucune filiale** (Q-155).
`--diagnostic` et `--verifier-publication` ne modifient rien et sont autorisés.

### Ce que j'ai semé dans la base de recette, et que j'ai retiré

Les contrôles S17 et S18 exigent les gestes réels d'un utilisateur. J'ai créé **80
documents**, **3 traitements** (un local, un de portée Groupe, un dans la seconde filiale),
**2 évaluations**, **1 risque par le formulaire du navigateur**, déposé **1 pièce jointe
saine**, et basculé trois fois la filiale active. **Tout a été supprimé par la route**
(donc sous RLS, avec cascade et journal) :

```
volumes finaux TLS : {"actions": 3, "risques": 2, "audits": 1, "history": 7, "personnes": 7}
volumes finaux DEU : {"actions": 2, "history": 2}
restes AUDIT-B10   : documents 0 · traitements 0 · evaluations 0 · risques 0 · pieces 0
chaîne du journal  : {"sain": true, "anomalies": []}
```

Comparé à l'état laissé par le 9ᵉ passage (`actions 3, risques 2, audits 1, history 6,
personnes 6`), l'écart est de **+1 `history`** (l'instantané quotidien, comportement normal
du produit) et **+1 `personnes`** (voir ci-dessous). ✅ **J'ai vérifié dans le journal que
je n'ai détruit que mes propres semis** : la seule suppression ne portant pas le préfixe
`AUDIT-B10` est ma propre pièce jointe, dont l'entrée ne porte pas de titre. Les deux
risques préexistants `SAISIE-QUI-NE-DOIT-PAS-DISPARAITRE` sont intacts.

### ⚠️ Ce qui subsiste, et il faut le dire

1. **Les entrées du journal d'audit** — **385** pendant mon audit. Le registre est en ajout
   seul : mes créations, suppressions, consultations, refus et bascules y sont
   **définitivement** inscrits. C'est le dessein du registre, pas un effet de bord.
2. **Un fichier EICAR en quarantaine** — le produit ne l'efface jamais, à dessein. Le
   diagnostic passe de **6 à 7 fichier(s), 88K**.
3. **Une ligne `utilisateurs` pour `audit.b10`** (voir ci-dessous) : le compte applicatif
   provisionné à la première connexion. Je ne l'ai pas supprimée — elle est référencée par
   le journal inaltérable, et `utilisateurs` refuse l'écriture hors transaction
   d'authentification (barrière E1, que j'ai constatée en la heurtant : `UPDATE 0`). Son
   compte d'annuaire n'existe plus : elle ne peut plus ouvrir de session. Trois lignes
   analogues (`s8q.temoin`, `s8q5.temoin`, `s8ter.cible`) y étaient déjà, laissées par les
   passages précédents.
4. **Une ligne `personnes` « Ilan Rossi »**, provisionnée par la connexion **réussie** de
   `indirect.tls` (constat Q-88, comportement normal). J'ai en revanche supprimé la ligne
   « Audit B10 » que mon compte jetable avait créée.

### ⚠️ Un compte d'annuaire créé, et pourquoi il a fallu le créer

**Le correctif Q-330 n'était atteignable par aucun compte de la recette.** Il retire le
différentiel aux comptes portant le domaine `journal` **sans** `GRC-EXPORT` — or, mesuré :

```
COMPTE         journal   export
admin.grc      oui       oui      ← le SEUL à porter « journal », et il porte l'export
rssi.groupe    non       oui
rssi.tls       non       non      contrib.tls / qualite.tls / direction : non / non
```

Seul le profil `ADMIN` porte le domaine `journal` (mesuré en base : une seule ligne dans
`profil_domaines where domaine='journal'`). J'ai donc créé, dans l'annuaire **simulé**
`grc-ad` — ce que le `CLAUDE.md` §0.2 autorise explicitement —, un compte jetable
`audit.b10` membre de `GRC-ADMIN` et **pas** de `GRC-EXPORT`. **Il a été retiré du groupe
et supprimé en fin d'audit** ; l'annuaire est revenu à ses 12 comptes et `GRC-ADMIN` à son
seul membre `admin.grc`, vérifié par `samba-tool`.

### ⚠️ Un écart à la règle d'innocuité n° 2, que je déclare

**Sept comptes réels ont reçu une tentative de connexion en échec**, par une faute qui
m'appartient : ma dérivation du mot de passe employait `OFS` après l'affectation des champs
`awk`, si bien que le séparateur produit était une **espace** là où la convention de la
recette attend un **trait d'union**. Je l'ai vu au premier tour et **corrigé hors ligne
avant tout nouvel essai**.

Conséquence : six comptes se sont soignés seuls (une connexion réussie remet
`tentatives_echouees` à 0 — mesuré : tous à 0). **`indirect.tls` a été verrouillé** : il
portait **déjà 4 échecs accumulés** avant mon audit, ma tentative a été la 5ᵉ et a franchi
le seuil.

**Remédiation faite, et mesurée** : après expiration du verrou (22:46:23 UTC), je me suis
connecté avec le bon mot de passe → `200`, et `tentatives_echouees` est **retombé à 0**.
Le compte est donc rendu **dans un meilleur état qu'avant mon audit** (0 au lieu de 4).

**Pour éprouver le martèlement, j'ai employé des identifiants qui n'existent pas**
(`nexiste.pas.audit.b10`, `nexiste.pas.audit.b10x`). Les six sondes de chronométrage sur
`indirect.tls` **déjà verrouillé** n'ont **rien incrémenté** : j'ai vérifié dans le code
que ce chemin passe `compter: false`, donc n'appelle jamais `compterEchec()` — le verrou
n'a été ni prolongé, ni approfondi.

---

## 1. Verdict des onze contrôles

| | Contrôle | Verdict | La preuve |
|---|---|---|---|
| **S6** | Droits vérifiés côté serveur à chaque requête | ✅ **passé** | **54 mesures** — 9 routes × 6 profils d'annuaire réels, à travers Apache (§2.1). Une écriture tentée par le profil **Lecture** (`direction`) est refusée **par le serveur** : `403 droit_insuffisant`, « Votre profil vous donne un accès en consultation ». Sans cookie → **401** ; cookie forgé de 43 signes → **401** |
| **S7** | Le droit d'export est distinct de la lecture | ✅ **passé** — *pour la première fois sans réserve* | **Q-330 tient des deux côtés** (§2.2). Balayage des **14 routes `GET`** sous un compte sans droit d'export : **aucune ne rend de la matière de filiale sans laisser de trace** ; les seules à ne rien tracer (`/api/modele` 10 Ko, `/api/import/modeles` 15 Ko) ne rendent que le **schéma**. `/api/export` et `/api/journal/export` → **403, tracés**. La délivrance d'une pièce jointe → **tracée (+1)**. La **pagination en fenêtres étroites**, laissée ouverte au 9ᵉ passage, est **fermée** : cumul mesuré 20 → 40 → 86 → **112 à travers une bascule de filiale** |
| **S8** | Secrets | ✅ **passé** | Le mot de passe applicatif de la base cherché dans la racine web servie → **0 occurrence** ; dans le dépôt → **0** ; dans `/api/sante` → **0**. `/etc/cyber-grc/env` en `-rw-r----- root:cyber-grc` ; `/var/lib/cyber-grc` en `drwx------ cyber-grc` |
| **S9** | Chaîne de contrôle des pièces jointes | ✅ **passé** | Un cas par contrôle (§2.5). `.exe` → 400 avec la liste blanche. Faux `.docx` → 400 « le contenu ne correspond pas à son extension ». **EICAR véritable de 68 octets**, confirmé par `clamd` interrogé **en témoin indépendant sur sa socket** (`stream: Eicar-Test-Signature FOUND`) : renommé `.pdf` il est refusé **par la signature binaire avant l'antivirus** ; en `.txt` il atteint ClamAV → **400, quarantaine, journalisée**. Fichier sain → **201**, SHA-256, `etat_analyse: saine`. Délivrance **forcée en pièce jointe** (`content-disposition: attachment`), `nosniff`, `no-store`. Magasin **hors racine web** (`0700`), et `403` quand on tente de l'atteindre par Apache |
| **S10** | Sortie et en-têtes | ✅ **passé** | CSP complète, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy` sur **`/`** — le chemin que l'utilisateur emprunte — **et** sur l'API. `Cache-Control: no-store` sur l'API. Cookie `HttpOnly; SameSite=Strict; Secure`. `/.git/config`, `/CLAUDE.md`, `/SECRETS.local.md`, `/backend/README.md`, `/grc-backup.json`, `/package.json`, `/.env`, `/../etc/passwd` → **403**. Une charge `<script>alert(1)</script>` saisie au formulaire ressort **échappée** : 0 exécution, aucune balise dans le DOM |
| **S11** | Limitation du rythme et verrouillage | 🟡 **passé avec réserve** | Le verrouillage **mord au cinquième** et **tout est journalisé** : sur `nexiste.pas.audit.b10x`, **5 « Échec de connexion »** puis **8 « Connexion refusée : trop de tentatives »**. Corps de réponse **identique à l'octet près** dans tous les cas. Réserve : **B-1**, le refus reste distinguable **au chronomètre**, et il distingue désormais l'**existence** du compte |
| **S12** | Les erreurs ne renseignent pas l'attaquant | 🟡 **passé avec réserve** | **Les deux échecs du 9ᵉ passage sont fermés et mesurés** : `GRC07` arrive en **400 lisible** (Q-325, §2.3) et le refus de portée **ne nomme plus** `filiale_id` / `traitement_filiale_id` (Q-326, §2.4). **9 sondes d'erreur** (entité inconnue, identifiant inconnu, caractères hostiles dans l'URL, filtres invalides, route inexistante) : **aucune pile d'appel, aucun nom d'objet de base, aucune requête SQL** en réponse. Réserve : **B-1** — le refus ne renseigne jamais par son *texte*, mais il renseigne par sa *durée* |
| **S13** | Dénis de service applicatifs | ✅ **passé** | **Les bornes tiennent, et elles sont exactes** — corps de 30 Mo → **413 en 14 ms** à travers Apache ; `caracteresParValeur` : 200 000 **accepté**, 200 001 **refusé** ; `elementsParLiaison` : 1 000 accepté, 1 001 refusé ; `champsParEnregistrement` : 86 → « maximum 80 » ; `profondeurJson` : 13 niveaux refusés ; `limite=999999` sur le journal → 400. Le compteur cumulé est borné à 5 000 clés et l'appelant ne peut pas les multiplier |
| **S15** | Dépendances | ✅ **passé** | `npm audit --omit=dev` → **`found 0 vulnerabilities`**, rejoué à `1646d21` |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ **passé** | Chromium réel derrière l'Apache du dépôt. **28 écrans sous `admin.grc` : 0 écran vide, 0 violation de politique de sécurité de contenu**, et la seule erreur de console est le **401 attendu** sur `/api/session` avant connexion. Parcours complet sous `rssi.tls` (§3). Le journal ouvert et déplié sous **deux profils** |
| **S18** | Le produit fait ce qu'il doit faire | 🟡 **passé avec réserve** | **Le parcours complet a été joué et ne détruit rien** (§3) : créer un risque au formulaire → 201, visible, **survit à un rechargement complet**, présent dans la liste, 2 → 3 lignes. Réserves : **B-2** (l'enveloppe laisse tomber une clé inconnue **en silence**), **B-3** et **B-4** (l'écran du journal) |

---

## 2. Ce que j'ai attaqué en priorité — la surface livrée APRÈS le 9ᵉ passage

> *Quatre portes de suite ont trouvé leur constat porteur dans un correctif accepté au
> passage d'avant.* Et **tout ce qui suit le 9ᵉ passage n'avait été soumis à personne.**
> J'ai donc commencé par là, en posant à chaque livraison les trois questions du brief.

### 2.1 La matrice des droits (contrôle S6)

```
ROUTE                              rssi.tls  qualite   contrib   direction rssi.grp  admin
/api/donnees                       200       200       200       200       200       200
/api/export                        403       403       403       403       200       200
/api/journal?limite=2              403       403       403       403       403       200
/api/journal/export?limite=2       403       403       403       403       403       200
/api/journal/verification          403       403       403       403       403       200
/api/consolidation                 200       200       403       200       200       200
/api/rgpd/registre-produit         200       200       403       403       200       200
/api/notifications/etat            403       403       403       403       403       200
/api/filiales                      200       200       200       200       200       200
sans cookie : 401        cookie forgé : 401
POST /api/entites/documents sous « direction » (profil Lecture) : 403 droit_insuffisant
```

Conforme, ligne à ligne, aux chartes rendues par `GET /api/session`.

### 2.2 ✅ Q-330 — le retrait du différentiel est COMPLET, et l'autre moitié tient

**Le compte sans droit d'export reçoit seize colonnes, jamais dix-sept :**

```
audit.b10 (journal=oui, export=NON) — GET /api/journal?limite=3 → 200
  colonnes (16) : action, adresse_ip, differentiel_masque, empreinte, empreinte_precedente,
                  entite_id, entite_type, filiale_id, horodatage, id, numero, resume,
                  session_id, utilisateur_id, utilisateur_libelle, version_application
  valeurs_avant présent : False   |   valeurs_apres présent : False
  differentiel_masque   : True
  GET /api/journal/export → 403     GET /api/export → 403
```

**Et le porteur du droit d'export voit toujours le différentiel** — la fonction n'a pas été
fermée pour fermer la fuite :

```
admin.grc (export=oui) — colonnes (17), differentiel_masque absent,
  valeurs_apres : {"detail": "groupes présentés : (aucun) ; reconnus : (aucun)"}
```

**J'ai cherché la matière ailleurs, et je ne l'ai pas trouvée :**

* **une seule requête lit la table.** `grep journal_audit` sur tout `src/` : les seuls
  chemins de **lecture** sont `src/api/journal.ts:336` (`lirePage`, qui sert les deux
  routes) et `f_journal_audit_verifier()`. Tous les autres sites sont des **écritures** ;
* **aucun autre format** : `/api/journal/export` est la seule autre représentation, et elle
  exige `exporter` ;
* **aucun champ dérivé** : les seize colonnes restantes disent qui, quand, quoi, sur quel
  objet, et le chaînage. Les `resume` sont des **phrases fixes** — j'ai relevé les
  **40 résumés distincts** du journal de la recette : aucun ne porte de contenu
  d'enregistrement, seulement des identités et des libellés d'action ;
* **`/api/journal/verification` ne rend pas de contenu** : `{"sain":true,"depuis":null,
  "anomalies":[]}`, 42 octets ;
* **les filtres ne sont pas un oracle** : `action=nimportequoi` rend **0 entrée** (le filtre
  est appliqué, pas ignoré), `action=creation` en rend 10, toutes de cette action.

**Et la mutation mord** (M1, sur copie) : `differentielAutorise = true` →
`test/journal-lecture` passe de **72/72** à **70/72**, l'essai « SANS le droit d'export :
les seize colonnes, et le différentiel RETIRÉ » rougit.

### 2.3 ✅ Q-325 — `GRC07` arrive enfin à l'utilisateur

```
POST /api/entites/documents  {"champs":{"titre":"…","traitement_id":"TRT-…-deadbeef…"}}
→ HTTP 400
{ "erreur": "donnee_invalide",
  "message": "Le traitement « TRT-…-deadbeef… » n'existe pas dans votre périmètre.",
  "code_grc": "GRC07" }
```

Plus de 500, plus de pile d'appel. **Et le refus ne laisse rien** : `select … from documents
where id like 'DOC-1789425413635%'` → 0 ligne. **La mutation mord** (M5 : `case 'GRC07'`
neutralisé → l'essai « B-2 — un traitement invisible rend un REFUS LISIBLE, jamais un 500 »
rougit, 37/38).

### 2.4 ✅ Q-326 — le refus de portée ne nomme plus aucune colonne interne

```
document de portée GROUPE → traitement LOCAL (sens fermé, N-10) → HTTP 400
« Ce rattachement franchit la frontière entre le socle commun du groupe et une filiale :
  un document de portée Groupe ne peut relever que d'un traitement de portée Groupe.
  Choisissez un traitement de portée Groupe, ou donnez à ce document une portée de filiale. »
```

Ni `filiale_id`, ni `traitement_filiale_id` : un geste utile, et rien d'autre. **Et le sens
OUVERT de Q-294 fonctionne** — document **local** → traitement **Groupe** : `201`,
`traitement_id` conservé.

### 2.5 ✅ Q-324 — la modification en doublon ne conseille plus de recharger

```
PUT /api/entites/evaluations/EVAL-… (ref_id=AUDITB10, code C2 → C1, déjà pris) → HTTP 409
« Un enregistrement portant la même clé existe déjà dans votre filiale …
  Corrigez la valeur en double, ou complétez l'enregistrement existant depuis la liste :
  votre saisie est conservée tant que vous ne quittez pas l'écran. »
```

Ni « créé », ni « Rechargez ». `enSaisie()` est branché sur **les deux** points d'écriture
(`src/api/index.ts:2528` création, `:2573` modification). **La mutation mord** (M4).

### 2.6 ✅ Q-329 — le budget de sondage ne se réarme plus à la bascule de filiale

Mesuré **à travers Apache**, en lisant le `cumul` que chaque trace inscrit :

```
22:35:25 | TLS | {"cumul":  20, "motif": "fenetre_anterieure_a_la_session", "lignes": 20}
22:43:36 | TLS | {"cumul":  40, "motif": "cumul_par_session",               "lignes": 20}
22:44:13 | TLS | {"cumul":  86, "motif": "volume_rendu",                    "lignes": 46}
22:44:33 | DEU | {"cumul": 112, "motif": "volume_rendu",                    "lignes": 26}
                  ↑ la bascule de filiale ne remet PAS le compteur à zéro : 86 + 26 = 112
```

**Et le sondage AU REPOS n'écrit toujours rien** (Q-301) : fenêtre de 60 s, 0 collection
modifiée, 0 ligne → **delta de journal = 0**. **La mutation mord** (M6 : la filiale remise
dans la clé → `test/journal/couverture` passe de 8/8 à 6/8 ; témoin re-vérifié vert après
restauration).

### 2.7 ✅ Q-335 — l'écran dit le motif, et je l'ai vu dans un navigateur réel

Chromium réel, derrière l'Apache du dépôt, entrée du journal dépliée :

```
— sous audit.b10 (SANS droit d'export) —
IDENTITÉ DE L'ENTRÉE … empreinte … précédente …
VALEURS AVANT / APRÈS
  « Le contenu des enregistrements n'est pas affiché : il relève du droit d'export,
    distinct de la consultation. Vous voyez QUI a fait QUOI et QUAND ; ce que la ligne
    contenait demande l'autorisation d'export. »

— sous admin.grc (AVEC droit d'export), même écran —
VALEURS AVANT   { "ts": "2026-09-14T22:45:37.759Z" }
VALEURS APRÈS   { "ts": 1789425954604 }
```

**0 violation de politique de sécurité de contenu** dans les deux parcours. ⚠️ **Mais la
moitié SPA de ce correctif n'est mordue par rien** — c'est **B-3** —, et sa **seconde
moitié reste muette** — c'est **B-4**.

---

## 3. Le parcours complet d'un utilisateur — contrôle S18

Chromium réel, compte `rssi.tls`, derrière l'Apache du dépôt.

| Geste | Résultat mesuré |
|---|---|
| Ouvrir l'application, se connecter | l'écran se monte ; seule erreur de console : le **401 attendu** sur `/api/session` avant connexion |
| Parcourir **28 écrans** (`admin.grc`) | **0 écran vide**, **0 violation CSP** |
| « Déclarer un risque », saisir intitulé + description | `POST /api/entites/risques` → **201** |
| La saisie est-elle à l'écran ? | **oui** |
| **Recharger la page entièrement** (`reload`) | **la saisie est toujours là** — rien n'est détruit |
| Revenir à la liste | **présente** ; la liste passe de **2 à 3** lignes |
| Charge `<script>alert(1)</script>` dans la description | **échappée** : aucune balise dans le DOM, aucune exécution |
| Déposer une pièce jointe saine, puis la télécharger | **201** puis **200**, `content-disposition: attachment` |
| Supprimer les 80 enregistrements semés | **80 × 204/200**, aucun échec, chaîne du journal **`sain: true`** |

---

## 4. Les constats

## B-1 🟠 — Le plancher de durée de Q-333 n'est posé que sur UN des deux chemins que son propre commentaire nomme, et le second est devenu un **oracle d'existence de compte**

**Classe « fuite ou perte de données » : non.** C'est une divulgation d'information sur
l'annuaire, pas un franchissement de frontière entre filiales.

Le correctif du 9ᵉ passage écrit, en toutes lettres, ce qu'il doit couvrir :

```
src/auth/index.ts:202-210
 * Les deux chemins qui refusent **sans interroger l'annuaire** — la limitation de
 * rythme et le verrouillage persistant — répondaient trois fois plus vite que le
 * chemin ordinaire : 18 ms contre 55 ms, mesuré à travers Apache.
src/auth/index.ts:216   const DUREE_MINIMALE_REFUS_MS = 80;
```

**Le plancher n'a qu'un seul point d'appel :**

```
$ grep -n "planchez\|DUREE_MINIMALE_REFUS_MS" src/auth/*.ts
src/auth/index.ts:216   const DUREE_MINIMALE_REFUS_MS = 80;
src/auth/index.ts:334     const planchez = async (): Promise<void> => {
src/auth/index.ts:335       const reste = DUREE_MINIMALE_REFUS_MS - (Date.now() - debut);
src/auth/index.ts:351         await planchez();          ← la limitation de rythme
```

Le second chemin, **le verrouillage persistant**, lève sans passer par le plancher :

```
src/auth/index.ts:758-764
    if (bloqueEnBase) {
      await this.journaliserEchec(login, adresseIp, { … compter: false });
      throw refusAuthentification('compte verrouillé en base');   ← PAS de planchez()
    }
```

**Mesuré à travers Apache, le 14/09/2026 à 22:41 UTC**, corps de réponse **identique à
l'octet près** dans les trois cas :

```
A. compte VERROUILLÉ EN BASE (indirect.tls)   0,019  0,023  0,026  0,035 s
B. identifiant JAMAIS VU (chemin annuaire)    0,051  0,050  0,056  0,060 s
C. limitation de rythme (planchéiée)          0,094  0,096  0,101  0,104 s
```

⚠️ **Le défaut est pire qu'avant le correctif, et c'est ce qui fait sa gravité.** Un
identifiant **qui n'existe pas** ne peut jamais emprunter le chemin `bloqueEnBase` :
`lireCompte()` rend `null` et la condition est fausse. **Une réponse en moins de 40 ms
dit donc à l'attaquant que le compte EXISTE** — et qu'il est verrouillé, donc que son
martèlement a porté. Le 9ᵉ passage avait explicitement laissé ce point « non rejoué » :
*« on ne sait donc pas si le chronomètre distingue aussi un compte existant d'un compte
inexistant »*. **La réponse est oui, d'un facteur deux, stable sur quatre mesures.**

**Le chemin est atteignable sans rien de privilégié**, et c'est l'état ordinaire de tout
compte ayant été verrouillé une fois : le compteur **en mémoire** est remis à `echecs = 0`
au moment où il bloque (`tentatives.ts:164`), tandis que le compteur **en base** n'est
jamais remis à zéro sauf connexion réussie (`sessions.ts:485`). Après expiration, **un seul
échec** re-verrouille la base (`tentatives_echouees + 1 >= 5` reste vrai à jamais) sans que
la mémoire atteigne son seuil — et toute tentative suivante emprunte le chemin non
planchéié. Un redémarrage du service produit le même état. `indirect.tls` s'y trouvait
naturellement au moment de ma mesure.

**Et rien ne le garde** : aucun essai du dépôt ne cite le plancher —

```
$ grep -rn "DUREE_MINIMALE_REFUS\|planchez\|Q-333\|B-10" backend/test/
(aucune occurrence — les seuls « plancher » sont ceux de test/depot/, sans rapport)
```

**Mutation M3** (sur copie) : `await planchez();` retiré → `test/auth/*.test.mjs` reste
**115/115 vert** (6 fichiers joués un par un : 40 + 10 + 18 + 12 + 9 + 26). **La mutation
ne mord pas.**

---

## B-2 🔵 — L'enveloppe d'écriture laisse tomber toute clé inconnue **en silence**, et le commentaire du code prouve que le travers était connu — il n'a été fermé que pour `id`

**Classe « fuite ou perte de données » : perte, mais du seul appelant mal formé** — la SPA
livrée envoie la bonne forme ; aucune donnée existante n'est détruite.

Mesuré, à travers Apache :

```
POST /api/entites/documents
{"champs":{"titre":"AUDIT-B10 drop"},"liaisons":{"etiquettes":[ …1001 identifiants… ]}}
→ HTTP 201
  créé id = DOC-1789426212978-7062fha32j5o4v3io2n4mp2w2
  étiquettes enregistrées = 0        ← les 1001 envoyées sont PERDUES SANS UN MOT
```

Envoyées à la bonne place, ces mêmes étiquettes sont **correctement bornées** : 1 000 →
`201` avec 1 000 enregistrées, 1 001 → `400 « Le champ « etiquettes » porte trop
d'éléments (maximum 1000) »`. C'est bien la **clé d'enveloppe** qui disparaît, pas la borne
qui faiblit.

La cause est écrite dans le dépôt, à l'endroit même du correctif partiel :

```
src/api/index.ts:305-319   const SCHEMA_CREATION = {
    additionalProperties: false,
    properties: {
      // `id` est DÉCLARÉ pour être REFUSÉ. Fastify compile ses schémas avec
      // `removeAdditional: true` : une propriété simplement absente du schéma
      // serait *retirée en silence*, et un client qui continue d'envoyer son
      // identifiant ne l'apprendrait jamais. `not: {}` n'accepte aucune valeur :
      // l'envoyer produit un 400 explicite.
      id: { not: {} },
      champs: { … }, portee: { … },
```

Le raisonnement est juste et il a été appliqué à **une seule** propriété. Contre-épreuve :

```
{"id":"DOC-choisi-par-le-client","champs":{…}}  → 400 « L'identifiant … est engendré par
                                                        le serveur : ne l'envoyez pas »
{"champs":{…},"cleInconnue":"x"}                → 201, la clé est retirée sans un mot
```

C'est le motif que ce chantier nomme *« on a corrigé l'instance, pas la classe »*, et la
règle du `CLAUDE.md` qu'il enfreint est explicite : *quand une omission fait que quelque
chose **réussit en silence alors que c'est faux**, la liste écrite à la main est le mauvais
outil.* `SCHEMA_MODIFICATION` (`:321`) porte exactement la même forme.

---

## B-3 🔵 — La moitié SPA de Q-335 n'est mordue par rien : l'écran peut redevenir muet sous un banc entièrement vert

**Classe « fuite ou perte de données » : non.**

Q-335 a été trouvé **par l'orchestrateur, hors passage de porte**, et son correctif n'a
donc été soumis à aucun auditeur. Il n'est soumis à aucun essai non plus :

```
$ grep -rn "differentielMasque" backend/test/                     (aucune occurrence)
$ grep -rn "Q-335" backend/test/ cyber-gouvernance_V4/            (aucune occurrence)
$ grep -rn "differentiel_masque" backend/test/
backend/test/journal-lecture/constats-s4.test.mjs:431   ← le champ SERVEUR, pas l'écran
backend/test/journal-lecture/constats-s4.test.mjs:460
```

**Mutation M2** (sur copie) — le drapeau reste lu, son rendu est neutralisé, c'est-à-dire
que **l'écran redevient exactement ce que Q-335 a corrigé** :

```
cyber-gouvernance_V4/js/modules/journal.js:421
-            (e.differentielMasque
+            (false /* MUTATION M2 */
```

`test/navigateur/journal.test.mjs` + `test/navigateur/droits.test.mjs` → **28/28, 0 échec.
La mutation ne mord pas.**

Le serveur est gardé, l'écran ne l'est pas — or **le défaut Q-335 vivait entièrement dans
l'écran** : le serveur envoyait déjà `differentiel_masque: true`, et personne ne le lisait.
La même régression peut donc se reproduire sans qu'aucun signal ne s'allume.

---

## B-4 🔵 — Pour un porteur du droit d'export, une entrée **sans aucun différentiel** rend un panneau à un seul bloc, sans un mot : la seconde moitié de Q-335 reste muette

**Classe « fuite ou perte de données » : non.**

Q-335 se donnait pour but, en toutes lettres, de distinguer deux situations : *« rien ne
distinguait « cette entrée n'a pas de différentiel » — une connexion, un démarrage — de
« on vous le cache »»*. Le correctif a rendu la **seconde** explicite. La **première** est
restée silencieuse :

```
cyber-gouvernance_V4/js/modules/journal.js:363-369
    function bloc(titre, valeur) {
        if (valeur === null || valeur === undefined) return "";      ← rien, pas un mot
```

Mesuré dans Chromium réel, sous `admin.grc` (**qui porte le droit d'export**), sur une
entrée filtrée « Déconnexion » :

```
nombre de titres <h4> dans le panneau déplié : 1
IDENTITÉ DE L'ENTRÉE
  identifiant … numéro 900 … filiale — (entrée hors filiale) … empreinte … précédente …
(et rien d'autre : aucun bloc « Valeurs », aucune phrase)
```

La base en porte **8** dans ce cas (`valeurs_avant is null and valeurs_apres is null` :
déconnexions et sessions expirées). Le lecteur n'a aucun moyen, à l'écran, de savoir s'il
regarde une entrée sans différentiel ou un différentiel qu'on lui retire — la distinction
n'est déductible qu'en connaissant la règle. C'est la classe **Q-201 / Q-207** : un écran
qui montre un vide sans dire pourquoi.

---

## B-5 🔵 — La route d'intégrité rend cinq champs que la SPA **documente** et ne lit jamais : sur un écart, l'utilisateur ne voit pas les empreintes qui le motivent

**Classe « fuite ou perte de données » : non.**

`GET /api/pieces/:entite/:entiteId/:pieceId/integrite` rend, mesuré :

```
{"id":"PJ-…","verdict":"conforme",
 "sha256_attendu":"60cba24c452936fb7224349c55fc981321f4f5eca7125dd60d112acba95e0035",
 "sha256_constate":"60cba24c452936fb7224349c5…", "taille_attendue":…, "taille_constatee":…,
 "verifie_le":…}
```

Le frontend les **décrit dans son propre commentaire** et n'en lit aucun :

```
$ grep -rn "sha256_attendu\|sha256_constate\|taille_attendue\|taille_constatee\|verifie_le" \
        cyber-gouvernance_V4/js/
cyber-gouvernance_V4/js/core/api.js:876:  * Rend `{ id, verdict, sha256_attendu, sha256_constate, taille_attendue,
cyber-gouvernance_V4/js/core/api.js:877:  *   taille_constatee, verifie_le }`, `verdict` valant `conforme`, `ecart` ou
        (les deux seules occurrences sont ce bloc de commentaire — aucun code)
```

`modules/pieces.js` ne consomme que `verdict.verdict`. Conséquence pratique : sur un
verdict `ecart` — le cas pour lequel la vérification d'intégrité existe —, l'exploitant lit
« écart » sans jamais voir **l'empreinte attendue, l'empreinte constatée, ni les deux
tailles**, c'est-à-dire précisément ce qui lui permettrait de juger. Le serveur les calcule
et les transmet à chaque appel.

C'est la **quatrième occurrence ce mois-ci** du motif *« un signal écrit, et lu par
personne »* — après `f_domaine_accepte()` (Q-312), l'empreinte SHA-256 (migration `020`) et
`differentiel_masque` lui-même (Q-335).

---

## 5. Le tri

| Classe | Nombre | Lesquels |
|---|---|---|
| **Bloquent le fonctionnement du produit** | **0** | Aucun. Le parcours nominal — créer, saisir, enregistrer, **recharger**, filtrer, déposer une pièce, imprimer, supprimer — a été joué de bout en bout dans Chromium derrière l'Apache réel et **ne détruit rien** |
| **Fuite ou perte de données entre filiales** | **0** | Aucun franchissement de frontière observé. Le cumul de sondage traverse bien la bascule de filiale, et aucune ligne d'une filiale voisine n'est jamais sortie |
| **Le reste** | **5** | B-1 → B-5 |

**Par gravité : 0 🛑 bloquant · 1 🟠 majeur (B-1) · 4 🔵 mineurs (B-2 → B-5).**

⚠️ **Trois des cinq constats visent le DISPOSITIF plutôt que le produit** — B-1 (le plancher
n'est gardé par rien), B-3 (l'écran n'est gardé par rien) et B-5. C'est la **cinquième porte
consécutive** où ce motif est présent, mais il est **nettement moins dominant** qu'aux 8ᵉ et
9ᵉ passages : sur mes **six mutations exploitables, quatre mordent**.

⚠️ **Et le motif des quatre portes précédentes est toujours là, une fois** : **B-1 rouvre
Q-333 sur le chemin que le correctif de Q-333 nomme lui-même.** C'est un correctif accepté
au passage d'avant qui porte le constat majeur de celui-ci.

✅ **Mais il ne domine plus** : les six autres correctifs du 9ᵉ passage que j'ai éprouvés —
Q-324, Q-325, Q-326, Q-329, Q-330, et le sens ouvert de Q-294 — **tiennent tous, mesurés par
la route et non par le code**, et cinq d'entre eux sont **mordus par la mutation qui les
casse**.

---

## 6. Les mutations jouées

**Sept mutations, toutes sur une COPIE** du dépôt (`git archive HEAD`), jamais sur l'arbre
de travail ni sur la recette. Copie remise à neuf et recomparée à `HEAD` après chacune.

### Celles qui mordent — 4

| | Ce qui a été cassé | Famille jouée | Verdict |
|---|---|---|---|
| **M1** | Q-330 : `differentielAutorise = true` (le différentiel repart à tout le monde) | `journal-lecture` | ✅ **mord** — 72/72 → **70/72** |
| **M4** | Q-324 : la modification retombe sur le conseil « Rechargez » | `api/bornes` + `navigateur/connexion` | ✅ **mord** — 1 échec (« B-1 — sur une MODIFICATION bloquée non plus, on ne conseille pas de recharger ») |
| **M5** | Q-325 : `case 'GRC07'` neutralisé (retour au 500 générique) | `documents/classification` + `api/bornes` | ✅ **mord** — 1 échec (« B-2 — un traitement invisible rend un REFUS LISIBLE, jamais un 500 ») |
| **M6** | Q-329 : la filiale revient dans la clé du cumul | `journal/couverture` | ✅ **mord** — 8/8 → **6/8** (témoin re-vérifié **8/8** après restauration) |

### Celles qui NE mordent PAS — 2

| | Ce qui a été cassé | Famille jouée | Verdict |
|---|---|---|---|
| **M3** | Q-333 : `await planchez()` retiré — plus aucun plancher de durée | `auth` (6 fichiers) | ❌ **ne mord pas** — **115/115 vert** → **B-1** |
| **M2** | Q-335 : l'écran du journal redevient muet sur le masquage | `navigateur/journal` + `navigateur/droits` | ❌ **ne mord pas** — **28/28 vert** → **B-3** |

### Non exploitable — 1

**M7** (Q-326 : le refus de portée renomme les colonnes internes) : la neutralisation par
`if (false)` a fait **crasher** la famille au lieu de la faire rougir proprement ; je ne la
compte donc **ni** comme mordante **ni** comme non mordante. Q-326 reste **mesuré fermé par
la route** (§2.4), ce qui est la preuve qui compte.

---

## 7. Ce qui tient — chiffré

* **Cloisonnement** : aucune ligne d'une filiale voisine n'est jamais sortie, sur **54
  mesures de droits** et un cumul de sondage suivi **à travers une bascule de filiale**.
* **Le droit d'export est bien distinct de la lecture** : **14 routes `GET`** balayées sous
  un compte sans droit d'export ; les deux routes d'export refusent en **403** et **tracent
  leur refus** ; le différentiel du journal est **retiré et annoncé** ; la délivrance d'une
  pièce jointe **laisse une trace**. **Le contrôle S7 passe sans réserve, pour la première
  fois.**
* **Le journal** : chaîne **`sain: true`**, **1 997 entrées** vérifiées de bout en bout par
  `install.sh --diagnostic`, en ajout seul. Le sondage **au repos** n'écrit **rien**.
* **L'authentification** : verrouillage **au cinquième** essai, **tout est journalisé**
  (5 échecs puis 8 refus pour martèlement, sur un identifiant **qui n'existe pas**), message
  **identique à l'octet près**.
* **Les pièces jointes** : **EICAR véritable de 68 octets** confirmé en témoin indépendant
  sur la socket de `clamd`, refusé **par la signature** quand il ment sur son extension et
  **par l'antivirus** quand il ne ment pas ; magasin **hors racine web** en `0700`,
  **403** par Apache ; délivrance **forcée en pièce jointe**.
* **Les en-têtes** : CSP, HSTS, `nosniff`, `DENY`, COOP/CORP, `Permissions-Policy` sur **`/`
  comme sur l'API** ; cookie `HttpOnly; SameSite=Strict; Secure` ; **8 chemins sensibles sur
  8** en 403.
* **Les bornes** : **exactes**, mesurées des deux côtés (200 000 / 200 001 ; 1 000 / 1 001 ;
  80 champs ; profondeur 12 ; 30 Mo → **413 en 14 ms**).
* **Le produit** : **28 écrans, 0 vide, 0 violation CSP** ; le parcours créer → enregistrer →
  **recharger** → retrouver **ne détruit rien** ; une charge XSS saisie au formulaire ressort
  **échappée**.
* **Dépendances** : `npm audit --omit=dev` → **0 vulnérabilité**.
* **Publication** : **81 fichiers servis identiques au dépôt** ; `--diagnostic` → **14
  conformes, 1 réserve, 0 bloquant** (la réserve est `SMTP_ACTIF=non`, connue).

---

## 8. Ce que je n'ai PAS pu mesurer — dit explicitement

* **Le chronomètre sur un compte EXISTANT mais NON verrouillé** (mot de passe faux sur un
  compte réel) : la règle d'innocuité l'interdit, et mon compte jetable aurait fallu le
  verrouiller pour cela. Je sais donc que le chemin **verrouillé en base** se distingue
  (B-1) ; je **ne sais pas** si un mot de passe faux sur un compte valide se distingue d'un
  identifiant inconnu. **Non rejoué.**
* **`POST /api/reprise` en mode « remplacer »** : elle détruit le jeu de la filiale de
  recette, et un autre auditeur travaillait en parallèle. **Non rejouée** — comme aux deux
  passages précédents.
* **Le comportement du cumul de sondage après un redémarrage du service** : documenté par
  son auteur comme ne survivant pas au redémarrage, et je n'ai pas redémarré `cyber-grc`,
  l'auditeur A travaillant sur la même machine. **Non rejoué.** J'ai en revanche mesuré le
  réarmement par la filiale active, qui est **fermé**.
* **La fenêtre exacte de réarmement de B-1** : j'ai mesuré l'état (compte verrouillé en
  base, compteur mémoire non bloqué) **tel que je l'ai trouvé** sur `indirect.tls`, et j'ai
  établi par lecture du code pourquoi cet état est l'état ordinaire. Je n'ai **pas** attendu
  les quinze minutes pour l'observer se reformer de lui-même.
* **Les écrans de détail de la plupart des modules** : j'ai parcouru les 28 listes et les
  fiches qui portaient le lot neuf (journal, documents, risques, pièces). Une régression de
  fiche ailleurs resterait invisible à ce passage.
* **Le contrôle S16** (les garde-fous sont branchés) est **hors de mon périmètre** : mes
  observations M2 et M3 sur la couverture du banc sont versées comme **preuves de B-1 et
  B-3**, pas comme un verdict sur S16, qui appartient à l'auditeur A.

---

*Rapport clos le 14/09/2026. `git status --porcelain` du dépôt relevé au début (vide) et à
la fin (le seul rapport de l'auditeur A, non suivi) : aucun fichier du produit, du banc ou
de la documentation n'a été modifié. `HEAD` inchangé à `1646d21`.*
