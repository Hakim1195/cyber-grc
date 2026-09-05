# Rapport de la porte S8 — condition de mise en service

> **Révision auditée** : `b422c4a` (« Q-207 : restaurer une sauvegarde saine
> n'avertit plus de rien »), branche `claude/vague-3-planning-review-6zgbch`.
> **Auditeur** : SECU — n'a écrit aucune des lignes examinées, n'écrit que dans
> `docs/securite/`. Aucun fichier du produit n'a été modifié, aucun commit n'a
> été fait.
> **Date** : 05/09/2026. **Machine** : `SRV-Infra`, VM Debian 13 réelle,
> PostgreSQL 17.11, Chromium/Playwright réels, Apache 2.4.68 en service, contrôleur
> de domaine Samba `grc-ad` réel. La recette tourne en permanence sur
> `https://grc.exemple.interne/` et sert **la révision auditée** : `install.sh
> --verifier-publication` → **81 fichiers servis identiques au dépôt**.

---

## Verdict global

> ### ❌ **Porte S8 refusée. Deux contrôles en échec : S13, S10. Un contrôle rouvert : Q-197.**
>
> **La promesse centrale tient, et c'est mesuré.** J'ai cherché la fuite entre
> filiales sur la surface qui la rendait probable — `/api/donnees` sous un
> périmètre Groupe, la consolidation, la reprise, la purge — et je ne l'ai pas
> trouvée : le cloisonnement est **49/49 en `force row level security`**,
> `grc_app` n'a ni `bypassrls` ni la propriété des tables, le périmètre vient du
> serveur, et le journal est inaltérable **jusque sous le compte propriétaire**
> (GRC01 mesuré en direct). Les corrections « perte de données » de S6 tiennent
> sous la mutation (Q-194).
>
> **Mais le produit se fait geler par un fichier de 322 octets.** Le correctif
> des dénis de service Q-197/Q-198 a réécrit les cinq expressions rationnelles
> qu'il nommait et **en a laissé deux derrière**, à quelques lignes de sa propre
> note. Un `.xlsx` de 322 octets bloque la boucle d'événements **35 secondes**
> (extrapolé : des heures au plafond de décompression), un autre de 635 octets la
> bloque exponentiellement. Mesuré par la route réelle. C'est **Q-197 rouvert**,
> classe « bloque le fonctionnement ».

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **Q-208** | à corriger avant la clôture de la vague |
| **Fuite ou perte de données** | **aucun constat vivant** | — la promesse centrale tient, mesuré |
| **Tout le reste** (`V1.1`) | **Q-209** → **Q-214** | inscrits, la vague continue |

**Ce que ce verdict dit du produit.** Le lot n'échoue pas sur son cloisonnement
ni sur sa persistance — les deux tiennent et je les ai mordus. Il échoue sur une
seule chose de classe dure : **un analyseur écrit à la main dont le pire cas
n'est pas borné**, et c'est exactement le défaut que la porte S6 avait cru
fermer. Les six autres constats sont réels mais relèvent du `V1.1` : une
autorisation d'export poreuse par l'architecture, deux corrections de S6 qui
tiennent **sans morsure**, une classe d'injection que la CSP neutralise en simple
barbouillage, une cause de Q-203 restée ouverte mais aujourd'hui masquée par le
typage de la base, et une création de filiale qui ne se trace pas par son objet.

Ces constats sont, pour cinq d'entre eux, **invisibles au banc** : **1 705
essais, 1 705 passés, 0 échec** (rejoué le 05/09/2026, `npm test`, 165 s),
`npm run verifier-types` sans sortie. Ce n'est pas le banc qui est mauvais : c'est
qu'aucun de ses essais ne fabrique un `r` de `<row>` hostile, ne sème une fiche
de portée Groupe homonyme d'une fiche locale, ni ne compare `|/api/donnees|` à
`|/api/export|`.

---

## 1. Ce que j'ai joué

| | |
|---|---|
| Banc du dépôt | `npm test` → **1 705 essais, 1 705 passés, 0 échec** (439 suites, 165 s) ; `npm run verifier-types` sans sortie |
| Contrôle **S15** | `npm audit --omit=dev` → **found 0 vulnerabilities**, code de sortie **0** |
| Publication de la recette | `install.sh --verifier-publication` → **81 fichiers servis identiques au dépôt**, code 0 |
| Navigateur | **Chromium réel** (`/opt/pw-browsers/chromium-1234`, Playwright `/usr/lib/node_modules`), SPA servie par **Apache réel** sur `https://grc.exemple.interne/`, contre le **serveur réel**, avec la **CSP du vhost** — connexion **AD réelle** (`rssi.groupe`, `direction`) |
| Base | PostgreSQL 17.11, la base de recette **et** une base neuve migrée par le vrai `db/migrate.mjs` pour les mutations |
| Mutations | copie isolée du dépôt dans le scratchpad, `node --test` sur la copie ; jamais sous `backend/test/`, jamais un commit |
| Sondes de DoS | mesurées sur le **`lireTableur` compilé** (le code exact de la route) **et** par `POST /api/import/risques` à travers Apache |

Toutes les sondes, scripts et captures vivent dans le scratchpad, hors dépôt. La
recette a été laissée **intacte** : les enregistrements créés pour les essais ont
été supprimés, et les injections hostiles n'ont vécu qu'en mémoire du navigateur
ou sur une base d'essai jetable. Vérifié en fin d'audit : la table `risques` de
la recette est revenue à ses deux lignes d'origine.

---

## 2. Ce que j'ai éprouvé et qui TIENT

Cette section vaut le reste : sans elle on ne sait pas ce qui est acquis. J'ai dit
**comment** je l'ai mesuré, pas seulement que je l'ai vérifié.

| Propriété (contrôle) | Comment je l'ai mesurée | Résultat |
|---|---|---|
| **Cloisonnement (S1)** | Sur la recette : `pg_class` → **49 tables, 49 en `relforcerowsecurity`, 0 table à `filiale_id` sans force**. `pg_roles` → `grc_app` **`rolsuper=f`, `rolbypassrls=f`** ; **toutes** les tables appartiennent à `grc_proprietaire`, jamais à `grc_app`. Banc : `verifier_cloisonnement.sql` **107/107** | **tient** |
| **Périmètre serveur (S2)** | `POST /api/connexion` résout le périmètre **en base** ; `/api/donnees` ne lit ni `query`, ni `params`, ni `body`, ni entête de filiale ; la filiale active se change par `PUT /api/session/filiale-active`, revalidée contre `session_filiales` | **tient** |
| **Journal inaltérable (S3)** | **En direct sous `grc_proprietaire`** : `update`, `delete`, **et** `truncate` sur `journal_audit` → tous **refusés « en ajout seul » (GRC01)**, y compris l'`update … where false` (déclencheur au niveau instruction). `f_journal_audit_verifier()` → **0 anomalie** | **tient** (l'inaltérabilité ; voir Q-213 pour une lacune de *complétude*) |
| **Verrouillage optimiste (S4)** | Par la route : deux `PUT` sur la même `version` → un **200**, l'autre **409 `conflit_version` / GRC03**. Une `version:999` arbitraire → **409** aussi : le client ne gagne pas en surenchérissant | **tient** |
| **Injection SQL (S5)** | Recensement exhaustif de `src/**` : 100 % des **valeurs** sont paramétrées ; les seuls identifiants interpolés passent par `ident()` (regex close) ou viennent de `pg_catalog` / de listes littérales, remontés jusqu'au site d'appel | **tient** |
| **Droits côté serveur (S6)** | `direction` (Groupe, lecture, sans `GRC-EXPORT`) : `POST /api/entites/*` refusé, `/api/export` **403**. Un `id` client hostile en création → **400 `donnee_invalide`** : le serveur réattribue l'identifiant | **tient** |
| **Secrets (S8)** | `.env.example` : 7 clés secrètes **vides** ; aucun matériau cryptographique dans le dépôt ; le résumé de config au démarrage et `/api/sante` ne portent aucun secret ; `redact` pino sur `authorization`/`cookie`/`set-cookie` | **tient** (réserve d'exploitation Q-102, déjà au registre) |
| **Verrouillage de connexion (S11)** | Banc `service.test.mjs:625` : après `maxTentatives` échecs, `verrouille_jusqu_a` est posé **en base**, et **le bon mot de passe est refusé tant que le verrou tient** ; un 503 « annuaire injoignable » ne verrouille personne | **tient** |
| **Erreurs muettes (S12)** | Un seul sérialiseur d'erreur (`erreurs/index.ts:corps()`) ; aucune pile, aucun `detail`/`constraint`/`table` en réponse ; les codes PostgreSQL sont traduits sans nommer d'objet de base ; le RLS rend « pas le droit » et « n'existe pas » indistincts | **tient** |
| **Dépendances (S15)** | `npm audit --omit=dev` → **0 vulnérabilité**, code 0 | **tient** |
| **Garde-fous branchés (S16)** | `f_verifier_schema()` est le **point d'appel unique**, invoqué par `migrate.mjs` **et** `install.sh`, contrôles **découverts** (jamais listés). Morsure au banc : `demonstration.test.mjs:154` fait `alter table risques no force row level security` → le script sort **non-zéro** et les contrôles **échouent** au lieu de disparaître | **tient** |
| **Chemin complet réel (S17)** | Chromium réel → Apache réel (CSP du vhost) → serveur réel → PostgreSQL → **AD réel** : démarrage **200**, connexion `rssi.groupe`, parcours de 10 modules, **0 violation de CSP, 0 erreur de page**. La recette sert bien la révision auditée (81 fichiers identiques) | **tient** |
| **Le produit fait son travail (S18)** | Par le **formulaire réel** : créer un risque → `POST /api/entites/risques` **201** → **recharger** → l'enregistrement est **retrouvé**, `catalogue_id: ""` restitué, **aucun bandeau** « champs non enregistrés » (Q-201/Q-207 tiennent, mesuré dans Chromium) | **tient** |
| **Q-194 (perte, S6) tient** | Mutation : je remets `risques.catalogue_id` en `text` nu (j'annule la migration `014`) → `test/api/aller-retour-export-reprise.test.mjs` **rougit** (`409 contrainte_base` sur l'aller-retour) | **le correctif mord** |
| **Q-197/Q-198 (les 5 regex nommées) tiennent** | Sur `lireTableur` compilé : `<row>×160 000` → **6 ms** (avant : 6 408) ; CSV 3,8 Mio → **60 ms, +6 Mio de tas** (avant : 1 445 ms, +936 Mio). L'essai `lecture.test.mjs:297` mesure le **rapport** linéaire/quadratique, pas un seuil | **tiennent** — mais deux regex sœurs restent : **Q-208** |
| **Q-200, Q-202, Q-199 (S6) tiennent** | `/api/consolidation` trace désormais `consultation_sensible` (**18 → 19**, mesuré) ; un fichier RH sur `/api/import/revues?appliquer=oui` → **`creees:0`**, « aucune donnée n'a été enregistrée », `revues` **0 → 0** ; `install.sh` vérifie la couverture `IPAddressAllow` de **l'unité des notifications** et refuse d'armer (contrôle dur) | **tiennent** |

---

## 3. Les constats

### CLASSE « BLOQUE LE FONCTIONNEMENT »

---

#### Q-208 — Deux dénis de service d'analyseur XLSX que le correctif Q-197/Q-198 a laissés derrière — **Q-197 rouvert**

**Classe : bloque le fonctionnement. Contrôle S13 en échec.**

Le correctif de la porte S6 a réécrit les expressions rationnelles à alternative
appariée qu'il nommait (`<row>`, `<c>`, `<si>`, `<t>`, `<v>`) et les a rendues
linéaires — je l'ai vérifié. Mais **deux autres motifs de coût non borné vivent
dans le même fichier**, tous deux alimentés par des octets d'attaquant.

**Q-208 a — `numeroLigne` : quadratique** (`backend/src/import/tableur.ts:583`,
appelé `:607`). Le numéro de ligne d'un `<row>` se lit par `/(\d+)$/u` — **non
ancrée à gauche** — sur `A${attribut(element.attributs, 'r') ?? ''}`, où `r` est
l'attribut de `<row>`, contrôlé par le fichier. Sur une suite de chiffres suivie
d'un non-chiffre, le moteur réessaie à chaque position : une passe complète par
caractère. La borne `LIGNES_MAX` est vérifiée **avant** (`:599`) et compte les
`<row>`, pas la longueur de `r` — un **seul** `<row>` suffit.

**Q-208 b — `cheminPremiereFeuille` : `new RegExp` construite depuis le fichier,
sans échappement** (`backend/src/import/tableur.ts:561`). L'`Id` d'une relation
est lu dans `workbook.xml` (`r:id`, octets d'attaquant) puis **interpolé tel quel**
dans `new RegExp(\`<Relationship\\b[^>]*\\bId="${identifiant}"[^>]*>\`)`, appliquée
à `workbook.xml.rels` — également fourni par le fichier. Les deux moitiés sont
dans la même archive : un motif catastrophique et un sujet qui le fait rétro-agir.

**Reproduction, sur le `lireTableur` compilé — le code exact de la route :**

| Sonde | Fichier `.xlsx` envoyé | Temps de blocage |
|---|---|---|
| Q-208 a, `<row r="50 000 chiffres z">` | **322 octets** | **2 059 ms** |
| Q-208 a, `<row r="100 000 chiffres z">` | 371 octets | **8 590 ms** |
| Q-208 a, `<row r="200 000 chiffres z">` | 468 octets | **35 472 ms** |
| Q-208 b, `r:id="(a+)+$"`, sujet à 28 `a` | 635 octets | **2 040 ms** |
| Q-208 b, sujet à 26 `a` | 635 octets | 486 ms |

**Q-208 a est confirmé quadratique** (≈ ×4 pour ×2 d'entrée) ; **Q-208 b est
exponentiel** (≈ ×2 par caractère du sujet). La feuille est bornée à **4 Mio
décomprimés** (`zip.ts`) et une suite de chiffres identiques se dégonfle à
quelques kilo-octets : extrapolée au plafond, Q-208 a vaut **de l'ordre d'heures**
de boucle bloquée pour un fichier de quelques centaines d'octets.

**Reproduction par la route réelle, à travers Apache** :

```
POST /api/import/risques   (rssi.groupe, multipart, fichier de 322 octets)
  → HTTP 409 en 2,259 s
```

Ces 2,26 secondes sont du **blocage pur** : Node est mono-fil, l'analyse est
synchrone, et l'appelant n'a besoin que du droit `ecrire` sur un domaine —
**l'aperçu suffit**, `appliquer=oui` n'est pas requis. Pendant ce temps, ni
`/api/sante`, ni la connexion à l'annuaire, ni les dix-neuf autres filiales ne
sont servies. `deploy/systemd/cyber-grc.service` pose `MemoryHigh=1G` /
`MemoryMax=2G` ; le limiteur de rythme ne compte que les **401 anonymes**
(`limiteur.ts`), donc ne voit rien ; et l'analyse s'exécute **avant** la
transaction, sans consommer de connexion du pool — le même envoi se rejoue sans
fin.

**Ce que le client perd** : la disponibilité de tout le produit, à la portée de
n'importe quel contributeur d'une seule filiale, avec un fichier qui passe sous
toutes les bornes de taille. C'est la figure exacte des constats Q-19 et Q-197.

**Pourquoi le banc ne le voit pas.** `test/import/lecture.test.mjs` mesure
désormais le **coût** des cinq regex corrigées (excellent), mais
`test/import/aide.mjs:371,382` n'engendre que des `r:id="rId1"` bien formés et
des `<row r="N">` à numéro court : **aucun essai ne fabrique un `r` de `<row>` ni
un `r:id` hostile**. Les deux motifs vivent sous des essais verts — la figure
même du `RAPPORT_S6.md` §6. La leçon de S6 (« un refus a un coût, et personne ne
le mesure ») a été appliquée aux regex nommées et **pas** à leurs deux sœurs, à
trois lignes de distance de leur propre note.

**Correctif** : ancrer `numeroLigne` (`/^A(\d+)$/` sur la référence complète, ou
`indexOf`), et ne **jamais** construire un `RegExp` à partir d'une valeur de
fichier — comparer `Id` par égalité de chaîne, comme le module le fait déjà
ailleurs. Un essai qui engendre les deux entrées hostiles, et qui **mesure le
rapport de coût** comme `lecture.test.mjs:297` le fait pour `<row>`.

---

### CLASSE « TOUT LE RESTE » — `V1.1`

---

#### Q-209 — `/api/donnees` extrait le jeu de données complet sans `GRC-EXPORT` et sans laisser de trace

**Classe : le reste. Contrôles S7 et S3 : passés à la lettre, tenus en échec sur
leur intention.**

`GET /api/donnees` et `GET /api/export` appellent **la même fonction, avec les
mêmes arguments** — `chargerJeuDeDonnees(client, perimetre, entitesLisibles(...))`
(`api/index.ts:1852` et `:1907`), non paginée. La seule différence est
l'emballage : `/api/export` ajoute quatre champs d'enveloppe `grc-backup`,
`/api/donnees` rend le même contenu sous la clé `data`.

**Reproduction, par la route réelle** — `direction` (périmètre Groupe, niveau
lecture, **`export:false`**, la configuration exacte du scénario de preuve S7) :

```
GET /api/export   → 403 « L'export des données est une autorisation distincte… »
GET /api/donnees  → 200, enveloppe complète : 25 collections, tout le périmètre
journal_audit sur la fenêtre : connexion_reussie ×2, refus_autorisation ×1
                    → AUCUNE entrée pour le GET /api/donnees
```

Le 403 sur `/api/export` **est** journalisé (`refus_autorisation`) ; le 200 sur
`/api/donnees`, qui rend le même volume, **ne l'est pas**. Un `curl` sur
`/api/donnees` suivi d'un `jq` produit un fichier `grc-backup` valide.

**La lettre des contrôles passe** : la route `/api/export` exige bien le droit, et
son refus est tracé. **Leur intention ne passe pas.** Le commentaire de
`/api/export` (`api/index.ts:1876`) justifie le droit d'export en affirmant qu'il
rend « l'extraction *en un clic, complète et silencieuse* impossible » — or
`/api/donnees` est précisément *en un clic, complète et silencieuse*. Et
`CONVENTIONS.md §1577` prescrit « `export` → la route `/api/export`, **et toute
autre sortie de jeu de données** » : `/api/donnees` **est** une sortie du jeu de
données, et n'émet rien.

**Ce que le client ne perd PAS, et il faut le dire** : ce n'est **pas** une fuite
entre filiales. `/api/donnees` reste borné par le périmètre de la session (RLS),
et le chemin de création ne laisse pas proposer d'identifiant. La lecture rend ce
que la lecture doit rendre. Le défaut est que **le droit d'export ne protège pas
ce qu'il prétend protéger**, et qu'une extraction complète du jeu de données ne
laisse aucune trace — la question qu'un auditeur ISO 27001 pose en premier.

**Pourquoi le banc ne le voit pas.** `test/journal/couverture.test.mjs:364`
vérifie le **403 sur `/api/export`** — vrai, mais insuffisant : aucun essai ne
compare le volume de `/api/donnees` à celui de `/api/export` pour une même
session, ni n'exige que la plus volumineuse des deux porte le droit et une trace.

---

#### Q-210 — Deux corrections « fuite de données » de S6 tiennent en code, mais n'ont **aucune morsure**

**Classe : le reste. La fuite n'est pas vivante ; sa réintroduction serait
silencieuse.**

Les corrections de **Q-195** (départage des destinataires de relance) et
**Q-196** (une relance ne s'adresse qu'à une fiche que l'annuaire résout) sont
justes dans le code livré (`notifications/echeances.ts:337`). Mais **rien ne les
protège** : je les ai cassées une par une, et le banc est resté **30/30 vert**.

**Mutation Q-196** — je retire `and "utilisateur_id" is not null` de la requête.
`test/notifications/{cloisonnement,echeances,relances}.test.mjs` → **30 passés,
0 échec**. Puis, sous le mutant, je sème une fiche saisie à la main (adresse
réelle, `utilisateur_id` nul) et appelle `resoudreDestinataires` :

```
destinataires résolus : 1
adresse retenue : exfiltration@attaquant.example
```

**La fuite Q-196 revient, et aucun essai ne rougit.** La cause est dans les
données du seul essai qui prétend couvrir la règle
(`echeances.test.mjs:242`, commentée « `utilisateur_id` est obligatoire pour
RECEVOIR depuis la porte S6 ») : ses deux fiches à `utilisateur_id` nul portent
un e-mail **nul** et un e-mail **d'espaces**, tous deux déjà exclus par le filtre
`btrim(email) <> ''` préexistant. La clause `utilisateur_id is not null` **n'est
jamais le filtre discriminant** dans aucun essai.

**Mutation Q-195** — j'inverse le départage (`… is null desc, filiale_id desc`,
le Groupe gagne au lieu de la filiale). Banc → **30/30 vert**. Sous le mutant,
avec un homonyme de portée Groupe et une fiche locale :

```
adresse retenue : marie.siege@groupe.interne
  (le correctif veut : marie.locale@filiale-a.fr)
```

**La fuite Q-195 revient** — une relance portant les retards d'une filiale part
vers l'homonyme du siège — **et le banc reste vert**. Aucun essai ne sème une
fiche de portée Groupe (`filiale_id is null`) homonyme d'une fiche locale : c'est
le seul cas où le départage s'exerce, et c'est celui que le `RAPPORT_S6.md`
avait déjà signalé comme non couvert. Il a été fermé **dans le code, pas dans le
banc**.

**Ce que le client risque** : rien aujourd'hui — les corrections tiennent. Mais
« un correctif accepté n'est pas un correctif sûr, et la seule preuve est la
morsure » : ces deux-là n'en ont pas, et une réécriture future de la requête les
rouvrirait sans un mot. **Correctif** : deux essais qui sèment exactement les
fiches manquantes (adresse à la main + `utilisateur_id` nul ; homonyme Groupe +
local) et asservissent le résultat.

---

#### Q-211 — Classe d'injection par identifiant hostile : 48 attributs non échappés, exploitable par une reprise d'administrateur

**Classe : le reste. La CSP neutralise l'exécution ; reste le barbouillage.
Contrôle S10 en échec.**

`verifierIdentifiant` (`entites/index.ts:5437`) est **volontairement permissif**
— il refuse la chaîne vide, plus de 64 signes, la virgule, l'espace de bord et
les caractères de contrôle, et **accepte** `"`, `<`, `>`, `&`. La création par
`POST /api/entites/*` **referme** ce canal (le serveur réattribue l'identifiant,
mesuré : un `id` client → **400 `donnee_invalide`**). Mais la **reprise**
conserve les identifiants du fichier à l'octet près (exigence de round-trip), et
48 sites d'attribut du frontend interpolent l'identifiant **sans échappement**
(`data-id` ×33, `href` ×9, `value` ×6) — alors que le même produit l'échappe
correctement à 18 autres endroits.

**Reproduction — stockage, par la route (base d'essai jetable, `admin.grc`) :**

```
POST /api/reprise  (fusionner)  fichier : { risques:[{ id:'x"><img src=1 onerror=alert(9)>', … }] }
  → 200, crees.risques = 1
EN BASE : id = 'x"><img src=1 onerror=alert(9)>'  (verbatim)
```

**Reproduction — rendu, dans Chromium sous la CSP réelle** (identifiant hostile
injecté en mémoire, `#/risques` rendu) :

```
elementInjecteDansDom : true      (l'<img> a rompu l'attribut data-id)
handlerExecute        : false     (script-src 'self' a bloqué onerror — 2 violations CSP)
positionFixed         : "fixed"   (style-src 'unsafe-inline' a appliqué l'habillage)
couvreEcran           : true      (recouvre la fiche entière)
```

**Ce que le client perd** : pas l'exécution de script (la CSP tient), mais la
**falsification visuelle** d'un écran qui fait preuve en audit — un cadre opaque
en `position:fixed` recouvre ce qu'il veut. C'est la lecture même que le dépôt a
retenue pour Q-203. La différence : c'est **structurel** (la permissivité
assumée de l'identifiant × 48 sites incohérents), et **plus large** que Q-203.

**Atténuations réelles** : l'injection exige le droit d'**administration**
(`/api/reprise`, mesuré : refusé en 403 à `rssi.groupe`) et un fichier de reprise
forgé — un administrateur qui importe une sauvegarde piégée. La CSP borne les
dégâts au visuel. C'est ce qui le maintient en `V1.1`. **Correctif** : échapper
l'identifiant aux 48 sites — ce que 18 autres font déjà —, la valeur étant la
même partout.

---

#### Q-212 — La cause de Q-203 n'est pas fermée : `I18n.date()` et `I18n.nombre()` ont le même repli brut, deux sites non échappés subsistent

**Classe : le reste. Aujourd'hui masqué par le typage `date` de la base.**

Q-203 a été corrigé au **symptôme** (`conformite.js` rend un `labelHtml` échappé
— vérifié, il tient) mais pas à la **cause** : `js/i18n/index.js` porte **trois**
fonctions à repli brut, pas une. `valeur()` (`:320`) a été rapiécé ; `date()`
(`:343`) rend `String(iso)` et `nombre()` (`:392`) rend `String(valeur)` **sans
échappement** quand l'entrée n'est pas analysable. Le contrôle mécanique
(`test/depot/traductions.test.mjs`) ne regarde que `t`/`tHtml`, jamais ces trois
sœurs. Deux sites de rendu les consomment sans échapper :
`js/modules/incidents.js:80` (`fmtDate(i.date_detection)`) et
`js/modules/dashboard.js:788` (`I18n.date(it.date)`).

**Ce qui les masque aujourd'hui** : tous les champs de date qui les alimentent
(`incidents.date_detection`, `actions.echeance`, `documents.date_revue`,
`audits.date_audit`, `mco_actions.date_prevue`) sont des colonnes **`date`** en
base — vérifié dans `information_schema`. PostgreSQL refuse d'y stocker `<img …>`,
que ce soit par l'API ou par la reprise. Le repli brut de `I18n.date` n'est donc
**pas atteignable** aujourd'hui. Mais c'est une sûreté qui vit **dans un autre
fichier** (le schéma), pour un site qui ne le dit pas — exactement le motif
« entre deux fichiers » que ce chantier paie. **Correctif** : échapper aux deux
sites, et étendre le contrôle mécanique à `valeur`/`date`/`nombre`.

---

#### Q-213 — La création de filiale ne se trace pas par son objet, et sa seule trace est hors transaction et avalée

**Classe : le reste. Contrôle S3 (complétude) et S14.**

`backend/src/filiales/index.ts` **n'appelle jamais `journaliser`** : la création
d'une filiale valide sa transaction, répond 201, et sa seule trace vient du
crochet `onResponse` (`api/index.ts:935`), qui ouvre **sa propre** transaction,
**après** la réponse, et **avale son échec** (`catch { … }`). Le commentaire du
crochet (`:924`) affirme que les actes d'administration qui écrivent portent « en
plus » une trace transactionnelle — `import`, `creation`, `suppression` — mais
**cette compensation ne couvre pas `POST /api/filiales`**. Deux conséquences :

1. si la trace `onResponse` échoue, **une filiale existe sans aucune entrée au
   journal** — le registre qui fait preuve en audit ISO 27001 ;
2. même réussie, la trace ne porte que `{ methode, route, domaine, statut }` :
   ni l'identifiant, ni le code, ni la raison sociale de la filiale créée. On ne
   peut pas répondre à « qui a inscrit FIL-xxx dans le groupe ». Le §1.7 exige
   « actions d'administration (création de filiale…) **avec valeurs** ».

Le §1.7 nomme aussi « changement de droits » : `synchroniserGroupesAd()`
(`droits/groupes-ad.ts:151`) écrit dans `groupes_ad` sans trace, mais le produit
n'a pas d'opération HTTP de changement de droits (ils viennent de l'AD) — le seul
appelant en ligne est la création de filiale ci-dessus, et un script d'exploitation
hors HTTP. **Non mesuré en direct** : créer une filiale sur la recette est proscrit
(constat Q-155) ; établi par lecture du code et par l'absence de `journaliser`
dans `filiales/index.ts`.

---

#### Q-214 — Coûts non bornés et atomicité résiduels, groupés

**Classe : le reste.** Rassemblés plutôt qu'éclatés.

| | Où | Quoi |
|---|---|---|
| **a** | `src/serveur.ts:51` | Fastify n'a **ni `connectionTimeout` ni `requestTimeout`** (défauts : aucun délai). Le seul délai HTTP est `ProxyTimeout 60` d'Apache — or le dépôt défend explicitement ailleurs (`serveur.ts:114`) le chemin « sans passer par Apache » (recette, laboratoire, boucle locale). Un client lent en direct sur `127.0.0.1:3001` tient une connexion sans borne |
| **b** | `pieces/index.ts:601`→`:603` | La pièce jointe est **promue au magasin définitif avant le `commit`** de la ligne. Si le processus meurt entre les deux, le fichier reste **sans ligne en base** ; le `.catch` de rattrapage (`:651`) est **vide** ; **aucune réconciliation disque↔base** n'existe (`reanalyserStock` itère sur les lignes, jamais sur les fichiers) |
| **c** | `pieces/index.ts:478` vs `:603` | Le quota est **lu** dans une transaction lecture seule puis **consommé** dans une autre, avec ClamAV (≤ 30 s) entre les deux : deux dépôts concurrents de 25 Mio passent tous deux le contrôle. Contrôler-puis-agir, refermé pour l'idempotence de l'import (`moteur.ts:633`), pas ici |
| **d** | `pieces/depot.ts:203`, `approbations/index.ts:452`, `cycle/index.ts:198` | Trois collections **non bornées** : pièces jointes d'une entité, étapes d'approbation, inventaire de sortie de filiale. Le volume des pièces est borné par le quota de filiale (2 Gio), les deux autres par rien |
| **e** | `src/auth/index.ts:213` | La `Map` `derniereRevalidation` est **sans borne ni éviction** — purgée seulement à la déconnexion explicite ; une session qui **expire** laisse son entrée. Les deux autres registres mémoire du produit sont bornés *et* commentés sur ce point |
| **f** | `.env.example:75` vs `config/index.ts:467` | Trois valeurs pour la borne de corps (`27 262 976` livrée, `26 214 400` par défaut, `27 262 976` au pré-filtre du vhost) : l'analyse Q-58 du vhost décrit le **défaut du code**, pas la valeur que `.env.example` livre. Fenêtre « refus en cours de corps » (502 au lieu de 413) atteignable **après authentification** seulement |

Aucun de ces points n'est vivant sous la configuration livrée et derrière Apache ;
tous relèvent du durcissement `V1.1`.

---

## 4. Ce que je n'ai pas pu éprouver

**La distinction compte** : six passages de porte ont reconduit « Apache n'est pas
éprouvé » alors que l'installer prenait une minute.

### 4.1 Impossible ici — et ce qu'il faudrait

| Ce qui n'est pas éprouvé | Pourquoi | Ce qu'il faudrait |
|---|---|---|
| **Q-208 au plafond de 4 Mio** | Envoyer un `<row r>` de 3,9 M chiffres à la recette la figerait des heures — je me suis arrêté à 200 000 chiffres (35 s), la quadratique étant déjà établie | Rien à mesurer de plus : le mécanisme est confirmé et extrapolable |
| **Q-213 en direct** | Créer une filiale sur la recette est proscrit (Q-155 : bascule `f_perimetre_groupe()` à faux) | Établi par lecture du code et absence de `journaliser` dans `filiales/index.ts` |
| **Q-199 avec `SMTP_ACTIF=oui`** | La recette n'a pas de relais configuré ; poster un vrai courriel n'a pas de sens ici | Le garde d'`install.sh` est lu et sa logique (bonne unité, contrôle dur) est vérifiée ; l'envoi de bout en bout reste à jouer derrière l'unité systemd réelle |
| **L'AD de production du client** | Règle de prudence inchangée : le cas négatif verrouille des comptes réels | Rien — l'AD simulé `grc-ad` couvre le besoin, et je l'ai employé |

### 4.2 Non tenté — dit franchement

* **Q-211 par la reprise sur la recette** : j'ai mesuré le stockage sur une base
  d'essai jetable et le rendu en mémoire dans Chromium ; je n'ai pas fait
  transiter l'identifiant hostile par une reprise **sur la recette** (elle exige
  l'administration et j'ai préféré ne pas y injecter de donnée piégée). Les deux
  moitiés sont mesurées, la jonction est déduite.
* **Le martèlement concurrent du pool** (dix imports simultanés) : le coût
  unitaire est mesuré (Q-208), pas la mise en concurrence. Le pool est à 10, sans
  plafond par session (Q-214).
* **La chaîne complète des pièces jointes (S9)** : couverte par la porte S5 et par
  le banc (`zip.ts` borne le réel sur ses deux branches, Q-205 c fermé — relu) ;
  je ne l'ai pas re-sondée au-delà des bornes de décompression.
* **`src/auth/filtre-ldap.ts`** : le coût du pire cas de l'échappement de filtre
  LDAP n'a pas été relu ligne à ligne.
* **`GET /api/journal/verification`** : sa borne de lecture n'a pas été vérifiée
  en détail.

---

## 5. Ce que cette porte enseigne

1. **Un correctif de coût qui nomme ses cas laisse les cas qu'il ne nomme pas.**
   Q-197/Q-198 a réécrit cinq regex et mesuré leur coût ; deux sœurs, à trois
   lignes de la note, sont restées quadratique et exponentielle (**Q-208**). La
   parade n'est pas de mieux relire : c'est un essai qui **fabrique** l'entrée
   hostile et mesure le **rapport** de coût, pour chaque analyseur.
2. **Une correction sans morsure est une réserve, pas une fermeture.** Q-195 et
   Q-196 tiennent dans le code et tombent sous la mutation sans faire rougir le
   banc (**Q-210**). « La seule preuve qu'un correctif tient est la mutation »
   vaut aussi pour les correctifs des portes précédentes.
3. **La lettre d'un contrôle peut passer pendant que son intention échoue.** S7
   exige que « l'export refusé » et « l'export tracé » — les deux sont vrais sur
   `/api/export`. Et pourtant `/api/donnees` sort le même volume sans droit ni
   trace (**Q-209**). Un contrôle se mesure sur la **surface**, pas sur la route
   qu'il nomme.
4. **La question « et qu'apprend celle qui n'a PAS le droit ? » a répondu une
   fois** : `direction`, sans `GRC-EXPORT`, apprend **tout le jeu de données** par
   `/api/donnees`. Elle n'a rien donné sur le cloisonnement inter-filiales, qui
   tient — le périmètre borne partout où je l'ai poussé.

---

> **Constats numérotés à partir de Q-208** — le registre du
> `docs/PLAN_EXECUTION.md` §7 s'arrête à **Q-207**. Chacun doit y recevoir un
> **propriétaire nommé et une échéance** : *un constat chiffré et non attribué est
> un constat perdu.* **Q-208 est de la classe « bloque le fonctionnement » : il se
> ferme avant la clôture de la vague.**
