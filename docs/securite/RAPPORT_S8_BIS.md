# Rapport de la porte S8 — **deuxième passage** — condition de mise en service

> **Révision auditée** : `2d0e2cd` (« Porte S8 refusée : six constats sur sept
> fermés, et trois leçons de méthode »), branche
> `claude/vague-3-planning-review-6zgbch`.
> **Auditeur** : SECU (2ᵉ passage) — n'a écrit aucune des lignes examinées,
> n'écrit que dans `docs/securite/`. Aucun fichier du produit n'a été modifié
> **dans le dépôt** ; toutes les mutations ont vécu dans une **copie isolée** du
> scratchpad, restaurées et vérifiées identiques. Aucun commit, aucun `git add`.
> **Date** : 05/09/2026. **Machine** : `SRV-Infra`, VM Debian 13 réelle,
> PostgreSQL 17.11, Apache 2.4.68 en service, Chromium/Playwright réels
> (`/opt/pw-browsers`), contrôleur de domaine Samba `grc-ad` réel. La recette
> sert `https://grc.exemple.interne/` en permanence.

---

## Verdict global

> ### ❌ **Porte S8 refusée. Un constat neuf, de classe « bloque le fonctionnement » : Q-215.**
>
> **Les six constats fermés du premier passage tiennent, et je les ai mordus un
> par un.** Q-209 (trace de `/api/donnees`), Q-210 (les deux fuites de relance),
> Q-211 (les quatre signes du balisage), Q-212 (les sœurs à repli brut de
> l'i18n), Q-213 (la trace de création de filiale dans la transaction) et
> Q-214 a/e (délais Fastify, éviction de la `Map`) rougissent chacun sous **sa**
> mutation, puis reverdissent une fois le correctif remis. La promesse centrale
> tient aussi, mesurée sur la recette : cloisonnement **49/49 en `force row level
> security`**, `grc_app` sans `bypassrls` ni propriété, journal **inaltérable
> sous le compte propriétaire** (`update`/`delete`/`truncate`/`update … where
> false` tous refusés GRC01).
>
> **Mais le septième — Q-208, l'analyseur XLSX — n'est fermé qu'à moitié, et
> c'est exactement la figure que ce chantier paie depuis trois passages.** Le
> correctif de `2d0e2cd` a rendu linéaires les **deux** motifs que le premier
> passage nommait (`numeroLigne`, `cheminPremiereFeuille`) — vérifié, ils
> tiennent — puis a posé, pour se protéger de l'oubli, **un interdit qui ne
> couvre pas le cas suivant** : « plus aucun `new RegExp` ». Or il restait dans
> le même fichier, à quatre lignes de là, une **expression rationnelle
> littérale** alimentée par les octets du fichier : `/<sheet\b([^>]*)\/?>/u`
> (`tableur.ts:605`), appliquée à `workbook.xml`. Elle est **quadratique**. Un
> `.xlsx` de **1 175 octets** bloque la boucle d'événements **20,15 secondes**,
> mesuré **à travers Apache** — pendant lesquelles `/api/sante` (15 ms d'habitude)
> **a mis 20,15 s à répondre**. C'est **Q-215**, classe « bloque le
> fonctionnement ». La réponse même de l'interdit (« `new RegExp` est la seule
> forme par laquelle un octet du fichier devient un motif ») est **fausse**, et
> le fichier en porte le contre-exemple.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **Q-215** | à corriger **avant la clôture de la vague** |
| **Fuite ou perte de données** | **aucun constat vivant** | la promesse centrale tient, mordue |
| **Tout le reste** (`V1.1`) | rien de neuf | Q-214 b, c, d, f restent au registre, inchangés |

**Ce que ce verdict dit du produit.** Il n'échoue ni sur son cloisonnement, ni
sur sa persistance, ni sur aucun des six correctifs du premier passage — tout
cela tient et a été mordu. Il échoue sur **une seule chose**, et c'est la même
qu'au premier passage : un analyseur écrit à la main dont un pire cas n'est pas
borné. La leçon que `2d0e2cd` tirait de Q-208 (« une règle qui demande de JUGER
chaque site échoue au troisième passage ; on la remplace par un interdit
absolu ») était juste — mais **l'interdit choisi était trop étroit d'un cran** :
il vise la *construction* d'expression (`new RegExp`), pas la *catastrophe*
(`[^>]*` non borné sur des octets d'attaquant), qu'un **littéral** produit tout
aussi bien.

---

## 1. Le tableau des sept constats du premier passage — tient / ne tient pas, **et la mutation jouée**

C'est la section la plus importante du rapport. Pour chaque correctif : ce que
j'ai cassé, et ce qui a rougi.

| # | Correctif | Verdict | Mutation jouée, et ce qui a rougi |
|---|---|---|---|
| **Q-208** | Analyseur XLSX : `numeroLigne` ancré + `cheminPremiereFeuille` par égalité de chaînes + interdit `new RegExp` | ⚠️ **les deux cas nommés TIENNENT ; un troisième reste — Q-215** | (a) J'ai rétabli `numeroLigne` sur `/(\d+)$/` → `cout-analyseur.test.mjs` **rougit** : 200 000 chiffres → **34 376 ms**, rapport **×15,9** (« au-delà de ×12, ce n'est plus linéaire »). (b) J'ai rétabli le `new RegExp` bâti sur le `r:id` → l'essai d'interdit **rougit en 3 ms** (« une expression CONSTRUITE… ») **et** l'essai de coût **dépasse la borne** (l'exponentielle rejoue). **Mais** `/<sheet\b([^>]*)\/?>/u` (`:605`), littéral, alimenté par `workbook.xml`, est resté quadratique — voir **Q-215**. |
| **Q-209** | `/api/donnees` journalise `consultation_sensible` ; barrière `GRC-EXPORT` **délibérément** absente | ✅ **tient** | J'ai neutralisé l'appel à `journaliser` dans `/api/donnees`. Compté par greffon : `GET /api/donnees` → `consultation_sensible` **passe de delta +1 à delta 0**. `journal/couverture.test.mjs` (qui exige la trace) rougirait. **Confirmé aussi par la route réelle** : la trace « Chargement du jeu de données complet de la filiale active » apparaît au journal après un `GET /api/donnees` via Apache. |
| **Q-210** | Deux morsures pour les fuites de relance Q-195/Q-196 | ✅ **tient** | (Q-196) J'ai retiré `and "utilisateur_id" is not null` → **`MORSURE Q-196` rougit** (`exfiltration@attaquant.example` redevient destinataire). (Q-195) J'ai inversé le départage (`desc`) → **`MORSURE Q-195` rougit** (le siège reçoit les retards de la filiale). Les essais existants étaient bien creux avant ; ils mordent maintenant. |
| **Q-211** | Les quatre signes `"`, `<`, `>`, `&` refusés **à la source** dans `verifierIdentifiant` | ✅ **tient, round-trip inclus** | J'ai neutralisé le refus `/["<>&]/u` → `identifiants.test.mjs` **rougit** (« les quatre signes… », « le cas exact du constat »). **Round-trip réel** : j'ai pris un **export produit par la recette** (`grc-backup` v13, 25 collections) et l'ai relu par `POST /api/reprise` sur base jetable, **`remplacer` et `fusionner`** → **200, `champsIgnores: []`** dans les deux modes. Les cinq générateurs ne produisent que `[0-9a-z-]` (base 36 + tirets) : aucun ne peut fabriquer un des quatre signes. |
| **Q-212** | Quatre sœurs à repli brut nommées + garde mécanique + sites de rendu échappés | ✅ **tient** | J'ai ajouté une **cinquième** sœur (`duree`, `return String(...)`) à `js/i18n/index.js` → le garde « AUCUNE QUATRIÈME SŒUR… » **rougit** en la nommant (`+ 'duree'`). Sites de rendu : `incidents.js`, `dashboard.js` (×4) enveloppent bien `escapeHtml(I18n.date(...))` ; parcours navigateur sous CSP réelle → **0 violation**. |
| **Q-213** | Trace de création de filiale écrite **dans** la transaction | ✅ **tient** | J'ai fait **échouer `journaliser`** pour `creation`/`filiales`, puis `POST /api/filiales` (greffon, base jetable) → **HTTP 500, transaction annulée, `filiales` reste à 2, aucune filiale `ZZZ`**. Le journal qui refuse fait bien échouer la création, et non l'inverse. |
| **Q-214 a, e** | Délais Fastify (`connectionTimeout`, `requestTimeout`) ; `Map` de revalidation bornée + éviction | ✅ **présents** | Les deux sont dans `serveur.ts` (120 s / 90 s) et `auth/index.ts` (`MAX_REVALIDATIONS = 10 000`, éviction du plus ancien) ; `verifier-types` = 0. Classe durcissement `V1.1`, non mordus par un essai dédié (comme au registre). **b, c, d, f restent ouverts, inchangés** (`V1.1`). |

**Bilan des sept** : **six tiennent**, mordus ; **le septième (Q-208) est fermé
sur ses deux cas nommés mais rouvert sur un troisième** — Q-215.

---

## 2. Ce que j'ai joué

| | |
|---|---|
| Banc du dépôt | `cd backend && set -a && source ~/.grc-essais.env && set +a && npm test` → **1 718 essais, 1 718 passés, 0 échec** (442 suites, 163 s) ; `npm run verifier-types` sans sortie |
| Contrôle **S15** | `npm audit --omit=dev` → **found 0 vulnerabilities**, code de sortie **0** |
| Mutations | **copie isolée** du dépôt et du frontend dans le scratchpad (`mir/`), `tsc` privé, `node --test` sur la copie ; jamais sous `backend/test/`, jamais un commit. Chaque fichier muté restauré et vérifié identique (`diff -q`) |
| Sondes de DoS | sur `lireTableur` **compilé** (le code exact de la route), sur l'expression **isolée**, et par `POST /api/import/risques` **à travers Apache** avec sonde de disponibilité concurrente sur `/api/sante` |
| Recette (lecture) | `GET /api/donnees`, `/api/export`, `/api/journal`, en-têtes, erreurs — comptes AD réels `rssi.groupe`, `admin.grc`, `direction` |
| Base | PostgreSQL 17.11 : catalogue de la recette `cyber_grc` (S1, S3) ; bases neuves migrées par le vrai `db/migrate.mjs` pour les mutations |
| Navigateur | **Chromium réel** → **Apache réel** (CSP du vhost) → **serveur réel** → PostgreSQL → **AD réel**, connexion `rssi.groupe` |
| SMTP | sortie 587 → `smtp.office365.com` (bannière 220) **et** égression sous le **bac à sable systemd réel** (`IPAddressDeny=any`), config livrée vs corrigée |

**La recette a été laissée intacte.** L'enregistrement créé pour S18 a été
supprimé (`risques` revenu à **2**) ; les quatre bases `grc_essai_*` laissées par
mes scripts ont été retirées (`drop database … with (force)`), il ne reste que
`cyber_grc`. Aucune filiale n'a été créée sur la recette (proscrit, Q-155) : la
création a été éprouvée par le greffon sur base jetable.

---

## 3. Ce que j'ai éprouvé et qui TIENT — et comment je l'ai mesuré

| Propriété (contrôle) | Mesure | Résultat |
|---|---|---|
| **Cloisonnement (S1)** | Recette `cyber_grc` : `pg_class` → **49 tables, 49 `relforcerowsecurity`, 0 table à `filiale_id` sans force** ; `grc_app` **`rolsuper=f`, `rolbypassrls=f`**, **0 table possédée** | **tient** |
| **Périmètre serveur (S2)** | `POST /api/connexion` (`rssi.groupe`) résout **2 filiales, `perimetre_groupe:true`** depuis la base ; `/api/donnees` ne lit ni corps ni entête de filiale | **tient** |
| **Journal inaltérable (S3)** | **En direct sous `grc_proprietaire`** : `update`, `delete`, `truncate`, **et `update … where false`** sur `journal_audit` → tous refusés **GRC01** (déclencheur au niveau instruction) | **tient** |
| **Droits serveur (S6)** | `direction` (Groupe, **lecture**, `export:false`) : `POST /api/entites/risques` → **403**, `POST /api/filiales` → **403** | **tient** |
| **Export distinct (S7)** | `direction` : `GET /api/export` → **403** « autorisation distincte » ; `GET /api/donnees` → **200** (même volume) **mais désormais tracé** `consultation_sensible` (Q-209) | **tient (lettre + trace)** |
| **Secrets (S8)** | `.env.example` : **aucune affectation de secret non vide** ; `/api/sante` ne porte aucun secret ; résumé au démarrage muet | **tient** |
| **Sortie et en-têtes (S10)** | Via Apache : **HSTS**, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, **CSP stricte** (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) ; cookie `grc_session` **HttpOnly ; SameSite=Strict ; Secure** ; `Cache-Control: no-store` sur la connexion | **tient** |
| **Erreurs muettes (S12)** | Corps invalide → `donnee_invalide` + référence, **aucune pile, aucun nom d'objet de base** | **tient** |
| **Dépendances (S15)** | `npm audit --omit=dev` → **0 vulnérabilité**, code 0 | **tient** |
| **Garde-fous branchés (S16)** | `f_verifier_schema()` point d'appel unique ; `test/base/demonstration.test.mjs` casse le force RLS et le script sort non-zéro | **tient (banc, rejoué)** |
| **Chemin complet réel (S17)** | Chromium → Apache (CSP) → serveur → PostgreSQL → **AD réel** : démarrage 200, connexion `rssi.groupe`, titre **« Cyber GRC — Dedienne Aerospace Toulouse »** (identité de filiale L9), parcours de **10 modules**, **0 violation CSP, 0 erreur de page** | **tient** |
| **Le produit fait son travail (S18)** | Par le **formulaire réel** : « Déclarer un risque » → saisie → enregistrer (id réattribué par le serveur) → **recharger** → l'enregistrement est **retrouvé**, **aucun bandeau « champs non enregistrés »** (Q-201/Q-207) | **tient** |
| **Chaîne pièces jointes (S9)** · **Verrouillage (S11)** · **Atomicité (S14)** | Familles `test/pieces/**`, `test/auth/service.test.mjs`, `test/import/transaction.test.mjs` — **vertes** dans les 1 718 | **passé (banc, rejoué)** |
| **Q-199 (relais SMTP) tient — et éprouvé de bout en bout** | (1) sortie 587 → **220 Microsoft ESMTP** ; (2) `install.sh` : `couverte_par` mordue avec l'IP **réelle** du relais M365 → config livrée `IPAddressAllow=localhost` **ne couvre pas** → `echec` **avant** `enable --now …notifications.timer` ; (3) **bac à sable systemd réel** (`systemd-run -p IPAddressDeny=any`) : config livrée → **aucune bannière** (noyau bloque) ; config corrigée (`+ 52.98.0.0/16`) → **220 outlook.office365.com** | **tient** |

---

## 4. Le constat neuf

> Numéroté **Q-215** : le registre du `PLAN_EXECUTION` §7 s'arrête à **Q-214**,
> et `Q-215` n'apparaît nulle part ailleurs (vérifié).

---

### Q-215 — Un **troisième** déni de service d'analyseur XLSX que le correctif Q-208 a laissé derrière — **Q-208 rouvert**

**Classe : bloque le fonctionnement. Contrôle S13 en échec.**

Le correctif de `2d0e2cd` a rendu linéaires les deux motifs que le premier
passage nommait, et a posé un interdit (« plus aucun `new RegExp` dans
l'analyseur ») pour ne plus dépendre de la vigilance. Mais l'interdit vise la
mauvaise cible : il bannit la **construction** d'expression, pas la **forme
catastrophique**, qu'une expression **littérale** produit tout aussi bien.

Il reste dans `backend/src/import/tableur.ts:605`, à **quatre lignes** du
correctif, cette ligne :

```ts
const feuille = /<sheet\b([^>]*)\/?>/u.exec(classeur);
```

`classeur` est le contenu de `xl/workbook.xml`, **octets d'attaquant**.
`[^>]*` n'est pas ancré : sur une suite de `<sheet` **sans aucun `>`**, le
moteur consomme tout le reste, échoue sur `\/?>`, rebrousse, et recommence à la
position suivante — une passe complète par caractère, soit un coût
**quadratique**. La borne de décompression (`MAX_DECOMPRESSE = 4 Mio`, `zip.ts`)
laisse à `workbook.xml` jusqu'à 4 Mio, et `<sheet` répété se dégonfle à quelques
kilo-octets : le fichier reste **minuscule**.

Ironie de l'affaire : le commentaire de `elementsXml` (`tableur.ts:522`) dit,
en toutes lettres, qu'une forme `<nom[^>]*>` « **rebalaie et rebrousse le reste
de la chaîne à chaque position candidate, ce qui rétablirait exactement le
défaut qu'on ferme** ». La ligne `:605` est ce défaut.

**Reproduction — sur `lireTableur` compilé (le code exact de la route) :**

| `<sheet` × k (workbook.xml) | archive `.xlsx` | temps de blocage |
|---|---|---|
| 2 000 | 669 o | 26 ms |
| 8 000 | 721 o | 372 ms |
| 16 000 | 792 o | **1 562 ms** |
| 32 000 | 931 o | **5 994 ms** |

soit **×3,8 pour ×2 d'entrée** — quadratique confirmé. Sur l'expression isolée,
`k = 64 000` (workbook.xml de 384 Kio) coûte **22 739 ms**.

**Reproduction — par la route réelle, à travers Apache :**

```
POST /api/import/risques   (rssi.groupe, multipart, fichier de 931 octets)
  → HTTP 409 en 5,73 s
```

**Et la boucle d'événements est bien bloquée**, pas seulement cette requête —
mesuré avec une sonde concurrente :

```
POST /api/import/risques   (fichier de 1 175 octets, en arrière-plan)
  → HTTP 409 en 21,15 s
  pendant ce temps :  GET /api/sante  → 200 en 20,15 s   (d'habitude : 15 ms)
```

Node est mono-fil et l'analyse est synchrone : pendant ces vingt secondes, ni le
point de santé, ni la connexion à l'annuaire, ni les dix-neuf autres filiales ne
sont servis. Extrapolé au plafond de 4 Mio (`<sheet` × ~680 000), le coût est de
**l'ordre de la dizaine de minutes** de boucle bloquée pour un fichier de
quelques kilo-octets.

**Ce que le client perd** : la disponibilité de tout le produit, à la portée de
n'importe quel contributeur d'une seule filiale — l'appelant n'a besoin que du
droit `ecrire` sur un domaine, et **l'aperçu suffit** (`appliquer=oui` non
requis). L'analyse s'exécute **avant** la transaction, sans consommer de
connexion du pool, et le limiteur de rythme ne compte que les 401 anonymes : le
même envoi se rejoue sans fin. C'est la figure exacte de Q-19, Q-197 et Q-208.

**Pourquoi le banc ne le voit pas.** `test/import/cout-analyseur.test.mjs`
mesure le coût de `numeroLigne` et du cas `r:id`, et interdit `new RegExp` —
mais **aucun essai n'envoie un `<sheet` malformé dans `workbook.xml`**, et
l'interdit **ne regarde pas les expressions littérales**. Les deux fabricants de
classeur du banc (`cout-analyseur.test.mjs`, `test/import/aide.mjs`) n'émettent
que des `workbook.xml` bien formés. Le motif vit sous un banc vert — la figure
même que Q-208 décrivait, reconduite d'un cran.

**Correctif** : lire la première feuille par le générateur `elementsXml` déjà
présent (`for (const s of elementsXml(classeur, 'sheet'))`), en temps linéaire,
comme le fait déjà `cheminPremiereFeuille` pour les relations depuis `2d0e2cd` —
et **élargir l'interdit** : non plus « aucun `new RegExp` », mais « aucune
expression, littérale comprise, portant `[^>]*` / `.*` / `.+` non ancré,
appliquée à une entrée de fichier ». Un essai qui fabrique le `workbook.xml`
hostile et **mesure le rapport de coût**, comme `cout-analyseur.test.mjs:297`
le fait pour `<row>`.

---

## 5. Ce que je n'ai pas pu éprouver

**La distinction compte** : six passages de porte ont reconduit « Apache n'est
pas éprouvé » alors que l'installer prenait une minute. J'ai donc **commencé**
par les réserves du premier passage — et les trois sont levées.

### 5.1 Réserves du premier passage — **levées**

| Réserve S8 | Ce que j'ai fait | Résultat |
|---|---|---|
| **Création de filiale en direct** | Éprouvée par le greffon sur **base jetable** (handler réel, DB migrée réelle), y compris la **morsure Q-213** (journal en panne → rollback) | **levée** — reste proscrit **sur la recette** (Q-155), à raison |
| **Q-199 avec `SMTP_ACTIF=oui`** | Décision `couverte_par` exercée avec l'**IP réelle** du relais M365 ; **égression réelle sous bac à sable systemd** (`IPAddressDeny=any`), livré vs corrigé | **levée** — bloqué comme livré, ouvert une fois le sous-réseau ajouté ; le `echec` précède l'armement du minuteur |
| **Q-211 de bout en bout** | Round-trip d'un **export réel de la recette** par `POST /api/reprise`, `remplacer` **et** `fusionner` | **levée** — 200, `champsIgnores: []` dans les deux modes |

### 5.2 Impossible ici, et ce qu'il faudrait

| Ce qui n'est pas éprouvé | Pourquoi | Ce qu'il faudrait |
|---|---|---|
| **Q-215 au plafond de 4 Mio** | Envoyer un `workbook.xml` de 4 Mio à la recette la figerait des minutes — je me suis arrêté à 1 175 octets (20 s), la quadratique étant établie | Rien à mesurer de plus : le mécanisme est confirmé et extrapolable |
| **L'envoi SMTP authentifié complet** | La recette n'a pas d'identifiants de relais ; en fabriquer n'aurait pas de sens | L'égression noyau et la bannière 220 sont mesurées ; le dialogue AUTH reste à jouer chez le client, derrière l'unité réelle |
| **L'AD de production du client** | Règle de prudence inchangée (verrouille des comptes réels) | Rien — l'AD simulé `grc-ad` couvre le besoin, et je l'ai employé |

### 5.3 Non tenté — dit franchement

* **Le martèlement concurrent du pool par Q-215** (dix imports simultanés) : le
  coût unitaire et le blocage mono-fil sont mesurés, pas la mise en concurrence.
* **`src/auth/filtre-ldap.ts`** : le coût du pire cas de l'échappement de filtre
  LDAP n'a pas été relu ligne à ligne (déjà noté au premier passage).
* **`GET /api/journal/verification`** : sa borne de lecture n'a pas été
  re-sondée (déjà noté au premier passage).
* **Q-214 b, c, d, f** : je n'ai pas re-mordu ces quatre points de durcissement
  `V1.1` ; ils restent au registre tels quels.

---

## 6. Ce que cette porte enseigne

1. **Un interdit qui remplace la vigilance doit viser la catastrophe, pas une de
   ses formes.** « Plus aucun `new RegExp` » était une bonne intention — mais la
   catastrophe est `[^>]*` non borné sur des octets d'attaquant, et un
   **littéral** la produit. L'interdit a laissé passer la ligne que le
   commentaire d'à côté décrivait comme le défaut à ne pas rétablir. La parade
   n'est pas un troisième interdit plus fin : c'est de **retirer la dernière
   expression appliquée à une entrée de fichier** et de mesurer le rapport de
   coût, analyseur par analyseur.
2. **Trois passages, trois motifs, le même fichier.** Q-197 (5 motifs) → Q-208
   (2 motifs) → Q-215 (1 motif). Chaque correctif a fermé ce qu'il nommait et
   laissé ce qu'il ne nommait pas. Tant qu'un essai ne **fabrique** pas l'entrée
   hostile pour *chaque* recherche de l'analyseur, le suivant ressortira.
3. **Les correctifs sans morsure du premier passage en ont une, désormais.**
   Q-210 était la propre leçon de la porte retournée contre elle ; les deux
   morsures ajoutées rougissent chacune sous sa mutation. C'est ainsi qu'un
   correctif se ferme, pas seulement se répare.
4. **Une réserve écrite se lève en la jouant.** Les trois réserves du premier
   passage (création de filiale, SMTP, round-trip réel) sont tombées en une
   demi-journée de mesures — dont l'égression SMTP sous le bac à sable systemd
   réel, qui montre le noyau bloquer puis laisser passer.

---

> **Constat neuf : Q-215**, classe « bloque le fonctionnement ». Il doit recevoir
> au registre du `PLAN_EXECUTION` §7 un **propriétaire nommé et une échéance**, et
> se fermer **avant la clôture de la vague** — *un constat chiffré et non
> attribué est un constat perdu.* Les six correctifs fermés du premier passage
> **tiennent, mordus** ; le septième (Q-208) est fermé sur ses deux cas nommés et
> **rouvert sur un troisième**.
