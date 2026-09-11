# Porte S8 — 8ᵉ passage, PÉRIMÈTRE B

**Surfaces exposées, droits, et le fait que le produit fonctionne.**

| | |
|---|---|
| **Auditeur** | indépendant — n'a écrit aucune des lignes examinées |
| **Date** | 11/09/2026 |
| **Révision auditée** | `24e6872` (`Réancrer les chiffres sur 7b11bb6`) |
| **Machine** | `SRV-Infra`, Debian 13 — recette en ligne (`https://grc.exemple.interne/`), Apache 2.4.68 + vhost du dépôt, service `cyber-grc` sur 3001, PostgreSQL 17.11, ClamAV actif |
| **Périmètre** | S6, S7, S8, S9, S10, S11, S12, S13, S15, S17, S18 |
| **Hors périmètre** (auditeur A) | S1, S2 (cloisonnement/RLS), S3 (journal — *sauf* ce que mes routes y écrivent), S4, S5, S14, S16 |

## Déclaration d'innocuité

`git status --porcelain` dans `/home/claude/cyber-grc` a été relevé **au début** et **à la
fin** de l'audit. Il est resté vide de toute modification du produit, du banc et de la
documentation. Le seul fichier que j'ai écrit est ce rapport. La seule autre entrée non
suivie observée est `docs/securite/RAPPORT_S8_OCTIES_A.md`, qui appartient à l'auditeur A.

**Toutes les mutations ont été jouées sur une copie** du dépôt, sous le scratchpad
(`scratchpad/copie`, révision `24e6872`), jamais sur la recette — constat Q-281. La copie a
été remise à neuf après chaque mutation et vérifiée par `git status` (vide).

**Ce que j'ai écrit dans la base de recette, et que j'ai retiré.** L'audit de S17/S18 exige
les gestes réels d'un utilisateur : j'ai créé 24 documents d'essai (préfixe `AUDIT-B`), une
revue de direction, et déposé trois pièces jointes. **Tout a été supprimé** ; les volumes de
la filiale TLS sont revenus à leur état d'avant l'audit (`actions` 3, `risques` 2, `audits`
1, `personnes` 6, `documents` **0**). ⚠️ **Deux traces subsistent volontairement** : un
fichier EICAR en quarantaine (le produit **ne l'efface jamais**, à dessein — c'est ce que
`--diagnostic` rend compte) et les entrées du journal d'audit, qui est inaltérable par
construction. **Aucune filiale n'a été créée** (Q-155) ; `preparer_base_dev.sh` n'a pas été
joué (Q-81) ; le cas négatif d'authentification n'a été éprouvé que sur un identifiant
**qui n'existe pas** (`compte.qui.nexiste.pas.auditB`).


> ### Numérotation définitive — posée par l'orchestrateur après consolidation
>
> L'auditeur a employé des étiquettes locales, **sans réserver de plage** : une plage
> réservée est exactement le genre de convention qui devient fausse, et la leçon a dû
> être apprise deux fois (7ᵉ passage, garde-fou « LA NUMÉROTATION est continue »).
> Les numéros définitifs, contigus après **Q-290**, sont :
>
> | Étiquette | Registre |
> |---|---|
> | **B-1** | **Q-301** |
> | **B-2** | **Q-302** |
> | **B-3** | **Q-303** |
> | **B-4** | **Q-304** |
> | **B-5** | **Q-305** |
> | **B-6** | **Q-306** |
> | **B-7** | **Q-307** |
> | **B-8** | **Q-308** |
> | **B-9** | **Q-309** |
>
> Registre : `docs/PLAN_EXECUTION.md` §7.

---

# 1. Verdict des onze contrôles

| | Contrôle | Verdict | La preuve |
|---|---|---|---|
| **S6** | Droits vérifiés côté serveur à chaque requête | ✅ **passé** | 6 routes × 4 profils réels d'annuaire, mesurées à travers Apache. `/api/journal` → 403 pour `rssi.tls`, `qualite.tls`, `contrib.tls`, 200 pour `admin.grc`. `/api/rgpd/registre-produit` → 403 pour `contrib.tls` (sans domaine `rgpd`) et pour `direction`, 200 pour les trois qui le portent. Sans cookie → 401 ; cookie forgé de 43 signes → 401 |
| **S7** | Le droit d'export est distinct de la lecture | ❌ **EN ÉCHEC** | **B-1** (🔴) et **B-2** (🟠). `GET /api/export` rend bien 403 à `rssi.tls` avec la bonne phrase ; mais `GET /api/rafraichir` rend le jeu **sans trace** sous le seuil, et **invente un volume** au-dessus. Troisième porte consécutive où S7 échoue |
| **S8** | Secrets | ✅ **passé** | `/etc/cyber-grc/env` en `0640 root:cyber-grc` ; `/var/lib/cyber-grc` en `0700` ; aucune chaîne de 64 hexadécimaux ni mot de passe dans les 81 fichiers servis ni dans le dépôt ; `/api/sante` ne rend que statut, version, environnement et latence |
| **S9** | Chaîne de contrôle des pièces jointes | ✅ **passé** | EICAR **véritable** (68 o, confirmé par `clamd` interrogé **en témoin indépendant** sur son socket → `Eicar-Test-Signature FOUND`) → **400**, dépôt refusé, mise en quarantaine annoncée. Un `.docx` dont le contenu n'est pas un conteneur OOXML → 400 « le contenu ne correspond pas à son extension ». Fichier sain → 201 avec SHA-256 et `etat_analyse: saine`. ⚠️ Mon premier EICAR était **mal formé** (70 o) et le produit l'a laissé passer : il avait raison, `clamd` le déclare sain lui aussi. *Une sonde non vérifiée aurait produit un faux bloquant* |
| **S10** | Sortie et en-têtes | ✅ **passé** | CSP complète, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, COOP/CORP, `Permissions-Policy` sur **toutes** les réponses mesurées, API comprise. `Cache-Control: no-store` sur l'API. `/` → 200 (le **chemin que l'utilisateur emprunte**, pas `/index.html`). `/.git/config`, `/backend/README.md`, `/grc-backup.json` → **403**. Cookie `HttpOnly; SameSite=Strict; Secure` |
| **S11** | Limitation du rythme | ✅ **passé, et bien** | 40 tentatives sur un identifiant **inexistant** : 40 × 401, **aucune distinction observable**. Le journal montre ce qui s'est réellement passé — **5** « Échec de connexion » puis **36** « Connexion refusée : trop de tentatives ». Le verrouillage a mordu au 5ᵉ et le refus est **indiscernable à l'octet près**, ce qui est exactement la propriété recherchée |
| **S12** | Les erreurs ne renseignent pas l'attaquant | 🟡 **passé avec réserve** | 12 chemins d'erreur sondés : aucun code SQL, aucun nom de contrainte, aucun nom de table, aucune trace d'exécution. Chaque refus porte une `reference` opaque. Réserves : **B-7** (la carte du schéma est rendue en clair par une route de lecture) et **B-8** (une phrase de reprise employée sur une création bloquée) ; **B-3** annonce à l'utilisateur qu'un enregistrement « appartient à une autre filiale », ce qui est faux |
| **S13** | Dénis de service applicatifs | ❌ **EN ÉCHEC** | **B-9** et l'amplification de **B-1**. Les bornes elles-mêmes tiennent (corps 30 Mo → 413 en 13 ms ; JSON à 1 000 niveaux → 400 ; `titre` > 200 000 signes → 400 ; > 1 000 étiquettes → 400), mais **aucune n'est mordue par un essai** (**B-4**), et le journal inaltérable est devenu un amplificateur d'écriture non borné |
| **S15** | Dépendances | ✅ **passé** | `npm audit --omit=dev` → `found 0 vulnerabilities`, code de retour **0**, rejoué à `24e6872` |
| **S17** | Le chemin complet a été parcouru pour de vrai | ✅ **passé** | Chromium réel derrière l'Apache du dépôt : **29 écrans de section + 4 écrans de fiche et de formulaire**, soit **33 passages**, **0 violation de politique de sécurité de contenu**, **0 écran vide**. Les deux seules erreurs de console sont le 401 attendu sur `/api/session` avant la connexion, et celle de **B-3** |
| **S18** | Le produit fait ce qu'il doit faire | ❌ **EN ÉCHEC** | **B-3**. Le reste tient et a été joué de bout en bout : créer, saisir, classer, étiqueter, enregistrer, **recharger**, filtrer, imprimer — rien n'est détruit, rien n'est perdu |

---

# 2. Les constats

## B-1 🔴 — La trace du sondage compte l'INVENTAIRE, pas ce qui sort : elle se déclenche sur un sondage ordinaire et inscrit un volume FAUX dans le journal inaltérable

**L'énoncé.** Le correctif du constat **Q-279** (7ᵉ passage) a remplacé le discriminant de la
trace : on ne regarde plus la fenêtre demandée, on regarde « ce qui sort ». Son commentaire
l'écrit en toutes lettres :

> *« ⚠️ **On trace donc sur ce qui SORT, pas sur ce qui est demandé.** Un sondage ordinaire
> — la SPA en émet un toutes les vingt secondes — rend zéro à quelques lignes ; au-delà de
> ce seuil, ce n'est plus un sondage. »*

**Le code ne fait ni l'un ni l'autre : il compte ce qui EXISTE.**

```
src/api/index.ts:2249   const lignes = Object.values(charge.volumes).reduce((n, v) => n + v, 0);
src/api/index.ts:2279   const extractionParLeVolume = lignes >= LIGNES_SONDAGE_ORDINAIRE_MAX;
```

Or `volumes` n'est pas ce qui est rendu. `src/entites/index.ts:1806` :
`volumes[nom] = await this.compterCollection(client, nom, filiale)` — **le compte total de la
collection, indépendant de `depuis`**. Ce qui sort vit dans `modifications`.

**La mesure (1) — la fausse alerte, par une commande.** La filiale portée à 30 lignes, puis
un sondage dont la fenêtre est de **trois secondes** :

```
SONDAGE ORDINAIRE (depuis −3 s) :
  lignes REELLEMENT envoyees : 0
  collections modifiees      : 0
  somme des VOLUMES (inventaire) : 30
  delta journal = 1
  -> « Extraction du jeu de données par le sondage (30 lignes rendues) »
     {"motif":"volume_rendu","lignes":30,"collections":0,"export_autorise":false}
```

**Zéro ligne est sortie. L'entrée dit trente.** Et elle porte, dans le même objet, sa propre
réfutation : `collections: 0` à côté de `lignes: 30`.

**La mesure (2) — par l'usage réel, sans aucun geste.** Une SPA ouverte dans Chromium
derrière l'Apache réel, sous `rssi.tls`, laissée **70 secondes sans qu'on touche à rien** :

```
sondages emis par la SPA en 70 s, sans aucun geste : 3
delta journal = 9, dont :
  3 x « Extraction du jeu de données par le sondage (30 lignes rendu… »
  1 x « Chargement du jeu de données complet de la filiale active »
  4 x « Modification d’un enregistrement. »   (l'instantané quotidien)
  1 x « Connexion réussie. »
```

**Trois accusations d'extraction en soixante-dix secondes, pour un onglet que personne ne
touche.**

**Le rayon, et pourquoi c'est bloquant.**

1. **Cela détruit l'objet du journal.** Le commentaire du produit dit lui-même pourquoi on
   ne trace pas chaque sondage : *« vingt filiales noieraient la seule question à laquelle
   le journal doit répondre vite »*. C'est fait. Un onglet ouvert écrit **≈ 3 750 entrées
   « Extraction du jeu de données » par jour** ; « qui a extrait le jeu de données ? » — la
   première question d'un auditeur ISO 27001 — n'a plus de réponse lisible, elle a 3 750
   réponses fausses par utilisateur et par jour.
2. **Cela inscrit un énoncé FAUX dans un registre qu'on ne peut pas corriger.** Le journal
   est en ajout seul, chaîné par empreinte, conservé trois ans. Une entrée qui affirme
   « 30 lignes rendues » quand zéro l'a été **ne peut plus être démentie**. C'est le produit
   qui sert de preuve en audit.
3. **Le seuil ne discrimine plus rien.** Toute filiale au-delà de 25 lignes — c'est-à-dire
   **toutes**, passé la première semaine — trace **chaque** sondage ; toute filiale en deçà
   n'en trace **aucun**, quoi qu'il sorte (voir **B-2**). Le discriminant est devenu une
   propriété de la taille de la filiale, et non de ce que fait l'appelant.
4. **Amplification d'écriture** : ≈ 1 286 octets par entrée (mesuré :
   `pg_total_relation_size('journal_audit')/count(*)`). Vingt filiales, cent sessions
   ouvertes → ≈ 375 000 entrées et ≈ 480 Mo **par jour**, indélébiles trois ans.

**Ce qu'il faut corriger, en une phrase :** compter `modifications` — ce qui part — et non
`volumes` — ce qui existe. La ligne le dit déjà ; c'est la variable qui est fausse.

⚠️ **La classe du constat est celle de Q-197/Q-208 et du §3 des règles neuves de S8** : *la
règle était écrite, en toutes lettres, vingt lignes au-dessus de la ligne fautive.* Écrire
la règle dans un commentaire ne suffit pas — il faut qu'une machine la vérifie. Ici l'essai
qui prétend la vérifier (`test/journal/couverture.test.mjs`, §Q-279) **sème trente lignes
pour dépasser le seuil**, donc il mesure `volumes` en même temps que `modifications` : les
deux valent trente dans son scénario, et l'erreur est invisible pour lui.

## B-2 🟠 — Et l'échappée demeure : le jeu COMPLET d'une petite filiale sort sans trace, quand `/api/donnees` trace la même extraction

**L'énoncé.** L'auteur du correctif Q-279 a écrit honnêtement qu'une échappée restait :
*« un appelant patient qui pagine en fenêtres étroites reste sous le seuil »*. **Ce n'est pas
l'échappée atteignable** — `rafraichir` n'ayant pas de borne supérieure, on ne peut pas
paginer avec. **L'échappée réelle n'est nommée nulle part** : il suffit que la filiale soit
petite.

**La mesure**, à travers Apache, avec `rssi.tls`, compte dont la charte déclare
`export: false` et dont `GET /api/export` rend **403** (« L'export des données est une
autorisation distincte de la consultation »):

| Fenêtre `depuis` | Lignes rendues | Entrée de journal |
|---|---|---|
| − 1 h | 18 | **0** |
| − 6 h | 18 | **0** |
| − 11 h | 18 | **0** |
| − 13 h | 18 | 1 (`fenetre_anterieure_a_la_session`) |

Dix-huit lignes **sont** le jeu de données visible par ce compte — la filiale en porte
dix-neuf au total. Et le même compte, sur `/api/donnees`, laisse une trace :

```
1108  consultation_sensible | rssi.tls | Chargement du jeu de données complet de la filiale active
      {"lignes": 19, "collections": 23, "export_autorise": false}
```

**Le rayon.** Deux routes, le même compte, le même jeu, la même absence de droit d'export :
l'une est tracée, l'autre non. La condition d'échappement est *« la filiale change moins de
25 lignes sur douze heures »* — c'est-à-dire **toute filiale qui vient d'être acquise**, sur
un produit dont le cadrage dit « 20+ filiales, acquisitions régulières ». Le seuil est une
constante absolue là où la question est une proportion.

⚠️ Le même remède que B-1 ne suffit pas ici : compter `modifications` rend 18 lignes, toujours
sous 25. Ce qu'il faut est un **compteur cumulé par session** — l'auteur l'a écrit, et c'est
la seule issue qui ferme les deux faces.

## B-3 🟠 — La fiche qui vient d'être créée annonce « introuvable… ou il appartient à une autre filiale », et cache un circuit d'approbation bien réel

**L'énoncé.** Après l'enregistrement d'un document, le panneau « Circuit d'approbation » de
la fiche interroge le serveur avec **l'identifiant provisoire du navigateur**, que le serveur
a réattribué. Il reçoit 404 et affiche un message d'erreur, alors que le circuit existe.

**La mesure**, dans Chromium derrière l'Apache réel, gestes d'un utilisateur ordinaire :

```
URL après enregistrement : …#/documents/DOC-1789117457265-8jq8ny1qf4m3dmbrvq4e9f08w
appel en échec           : HTTP404 GET /api/approbations/documents/DOC-1789117396226-1-wg37d1cyjxks
data-id du conteneur     : DOC-1789117457265-8jq8ny1qf4m3dmbrvq4e9f08w   ← le BON

ENCART juste après création : « …Cet enregistrement est introuvable. Il a peut-être été
                               supprimé, ou il appartient à une autre filiale. »
ENCART après rechargement   : « État du circuit — En cours — Tour n° 1 — Étape attendue :
                               Rédaction — 1 Rédaction / 2 Revue / 3 Approbation /
                               4 Publication — Prendre la décision : Rédact… »
```

**La cause, et elle est amère.** `js/modules/approbations.js` a construit la parade, et son
commentaire nomme exactement ce cas :

> *« ⚠️ L'entité et l'identifiant sont **relus dans les attributs du conteneur** quand
> l'appelant ne les fournit pas : c'est la convention du `CLAUDE.md` §3, et elle protège du
> cas où le serveur a réattribué l'identifiant. »*

`brancherEncart(entite, id)` fait `const i = id || noeud.dataset.id;`. **Le seul appelant du
dépôt fournit l'identifiant** — `js/modules/documents.js:283`,
`ApprobationsModule.brancherEncart("documents", doc.id)` — et `id ||` gagne sur le `dataset`
que le recalage avait pourtant **correctement mis à jour** (mesuré ci-dessus). La parade est
juste ; son unique appelant la désarme.

**Le rayon.**

1. **Une action du produit est bloquée.** Les quatre étapes du circuit et le bouton
   « Prendre la décision » sont **invisibles** tant que l'utilisateur ne recharge pas. Le
   geste nominal — créer une politique puis engager sa validation — ne se termine pas.
2. **Le message est faux, et il est faux SUR LE CLOISONNEMENT.** « il appartient à une
   autre filiale » est ce que le produit dit d'un enregistrement que l'utilisateur vient de
   créer dans sa propre filiale. C'est la classe **Q-201 / Q-207** : *un message qui annonce
   une perte qui n'a pas eu lieu apprend à ne plus croire les bandeaux, y compris le jour où
   ils disent vrai* — et ici il apprend à ne pas croire les messages de cloisonnement.
3. La ligne fautive date du 08/09 (`39b6dc5`, lot L16-D1/D4/D5) : **elle a traversé le 7ᵉ
   passage de S8 sans être vue**, et aucun essai ne la couvre.

## B-4 🟠 — Les sept bornes de `src/entites/index.ts` — le remède même du constat Q-214 d — ne sont mordues par AUCUN essai

**L'énoncé.** L'objet `BORNES` (`src/entites/index.ts:210-240`) porte les sept garde-corps
de S13 : `lignesParReprise`, `lignesParLiaison`, `lignesParSondage`,
`champsParEnregistrement`, `elementsParLiaison`, `caracteresParValeur`, `profondeurJson`,
`noeudsJson`. Ils **fonctionnent** — je les ai mesurés un par un à travers Apache. **Aucun
essai du banc ne s'en aperçoit s'ils disparaissent.**

**La mutation (M4).** `elementsParLiaison: 1000` → `100000000` — un facteur cent mille, qui
ouvre la porte à un document portant cent millions d'étiquettes :

```
node --test test/documents/classification.test.mjs test/api/routes.test.mjs
# pass 53   # fail 0
```

**Cinquante-trois essais verts.** Et la recherche est sans appel :

```
grep -rln "elementsParLiaison|trop d'éléments" test/   →  (aucun fichier)
grep -rn  "BORNES" test/                               →  (aucune ligne)
```

**Le rayon.** Trois portes successives ont trouvé trois dénis de service (Q-197, Q-208,
Q-215) ; le remède posé pour la quatrième famille (Q-214 d, « trois collections non
bornées ») **n'est retenu par rien**. Un refactorisation, un changement de valeur, une
suppression accidentelle passeraient au vert. *Un garde-fou que rien n'appelle est un
commentaire* — celui-ci est appelé, mais rien ne vérifie qu'il l'est.

## B-5 🟠 — Le lot introduit une chaîne libre affichée en liste, et aucun essai ne fait DÉCIDER son échappement

**L'énoncé.** Les étiquettes (migration `027`) sont de la donnée utilisateur rendue dans la
liste des documents et dans un `<option value="…">`. Elles acceptent du balisage.

**La mesure — ce que la base accepte :**

```
POST /api/entites/documents  {"etiquettes":["<img src=x onerror=alert(1)>","\"><script>a</script>"]}
→ 201, les deux étiquettes sont STOCKÉES telles quelles
```

**La mesure — ce que le produit en fait (et il le fait bien) :** dans Chromium, derrière
l'Apache réel, images injectées = **0**, balises `<script>` injectées = **0**, boîtes de
dialogue = **0**, violations de CSP = **0**. `escapeHtml` tient.

**La mutation (M6) — et c'est là que le banc se tait.** Échappement retiré du seul endroit
qui rend de la donnée utilisateur :

```
- `<span class="etiquette">${escapeHtml(e)}</span>`
+ `<span class="etiquette">${e}</span>`

node --test test/navigateur/classification-documents.test.mjs
# pass 5   # fail 0
```

**Le rayon.** La famille neuve n'emploie que des étiquettes inoffensives — `'RH'`,
`'Revue 2026'`, `'Site A'`. C'est exactement le motif du constat **Q-210** : *un essai qui
couvre une règle sans jamais la faire décider ne la couvre pas.* La porte S2 avait trouvé
deux injections résiduelles dont une dans un `<option>` ; le lot en rouvre la surface et
n'en pose pas la garde.

## B-6 🟡 — Le composant à puces a été réécrit ; son consommateur préexistant n'a AUCUNE couverture

**L'énoncé.** `UI.multiPersonHtml / wireMultiPerson / getMultiPerson` — le champ des
participants d'une revue de direction — est devenu une enveloppe de trois lignes au-dessus
de `chipsHtml / wireChips / getChips`. C'est une réécriture d'un composant partagé.

**La mesure — la bonne nouvelle d'abord, et elle est entière.** Écran
« Revues de Direction », dans Chromium derrière l'Apache réel :

```
champ #r-participants présent : true
datalist = personnes-list   |  placeholder = « Ajouter une personne… »
options d'annuaire proposées : 6
ajout par bouton   → ["Jean DUPONT","Marie CURIE"]   (« jean dupont » dédoublonné)
ajout par Entrée   → ["Jean DUPONT","Marie CURIE","Ada LOVELACE"]
retrait d'une puce → ["Marie CURIE","Ada LOVELACE"]
après enregistrement — « Marie CURIE » présent : true | « Ada LOVELACE » : true
```

**Aucune régression.** Le composant tient sur son ancien consommateur.

**La mauvaise : rien ne le dit.**

```
grep -rln "r-participants|multiPerson|mp-label|mp-chip" test/
→ test/navigateur/classification-documents.test.mjs      (et rien d'autre)
```

Le **seul** essai du banc entier qui touche ce composant est celui **écrit hier avec lui**.
Le consommateur qu'il fallait protéger — la revue de direction — n'est mesuré par personne.

**La mutation (M8)** confirme le trou : le dédoublonnage insensible à la casse retiré
(`var exists = false;`), la famille reste **5/5 verte**. Et ce dédoublonnage n'est pas
décoratif : sans lui, taper « RGPD » puis « rgpd » fait échouer l'enregistrement complet par
un 409 de la base (voir **B-8**), et la saisie est perdue.

## B-7 🟡 — La route neuve rend la carte complète du schéma interne — `utilisateurs.mot_de_passe_hash` compris — à tout compte en lecture, et sans laisser de trace

**L'énoncé.** `GET /api/rgpd/registre-produit` est déclarée `{ action: 'lire', domaine:
'rgpd' }`, délibérément et avec un motif écrit (« c'est une pièce à montrer »). Elle rend
**58 lignes** qui nomment, table par table et colonne par colonne, l'intégralité du modèle —
y compris ce qui n'a rien à voir avec le registre d'un DPO :

```
groupes_ad       -> nom
journal_audit    -> adresse_ip, utilisateur_libelle
migrations_schema-> nom
parametres       -> libelle
profils          -> nom
sessions         -> agent_utilisateur, motif_revocation, perimetre
utilisateurs     -> email, identifiant, mot_de_passe_hash, nom, nom_affichage,
                    prenom, sid_ad, upn
```

**La mesure.** `qualite.tls` — profil qualité et auditeur **d'une seule filiale**, ni
administrateur, ni exportateur — obtient **200 et les 17 031 octets complets**. Et cinq
lectures consécutives produisent un **delta de journal de 0** : la route ne laisse aucune
trace.

**Le rayon.** Ce n'est pas une fuite de données personnelles — le motif de la route est
juste sur ce point, elle décrit le schéma et non les gens. C'est un **renseignement donné à
un attaquant interne** (contrôle S12) : les noms exacts des tables d'authentification, de
session et de droits, et la confirmation que `utilisateurs.mot_de_passe_hash` existe. La
même information est refusée à `contrib.tls`, ce qui montre que la borne existe ; elle est
simplement placée plus bas que ce que le contenu justifie. **A minima, cette route devrait
laisser une trace** — c'est la seule route de lecture large du produit qui n'en laisse pas.

## B-8 🟡 — Sur une CRÉATION bloquée, le produit dit « Rechargez la liste, puis reprenez la saisie »

**L'énoncé.** Deux étiquettes qui ne diffèrent que par la casse font rougir le déclencheur
`f_normaliser_etiquette()` en `23505`, et le client reçoit :

```
HTTP 409
{"erreur":"contrainte_base",
 "message":"Cet enregistrement n'a pas pu être créé : l'une de ses clés est déjà utilisée.
            Rechargez la liste, puis reprenez la saisie."}
```

**Le rayon.** C'est, à la formulation près, le **bloquant du 6ᵉ passage de la porte S2**,
consigné au `CLAUDE.md` : *« une même formulation servait deux couches : vraie pour la
reprise (« rechargez »), destructrice pour une création bloquée, où recharger jette la
saisie. »* Le message dit lui-même « n'a pas pu être **créé** » puis conseille de
**recharger** — c'est-à-dire de perdre le formulaire.

⚠️ **Honnêteté sur l'atteignabilité** : le dédoublonnage du navigateur (B-6) écarte ce cas
pour le geste ordinaire. Restent l'import généralisé, la reprise d'un export et `psql` — et
le jour où B-6 se réalise, la voie s'ouvre. Les deux constats se lisent ensemble.

## B-9 🟡 — Aucun limiteur de rythme par session : 201 entrées de journal en 2,13 s

**L'énoncé.** Le constat **Q-286** a été **arbitré ouvert par écrit**, et je confirme que
**l'arbitrage est honnête** : il n'y a effectivement aucun limiteur sur les routes coûteuses
authentifiées, et le motif donné (« n'en couvrir qu'une donnerait la fausse assurance que le
sujet est traité ») est défendable.

**La mesure** — ce qu'il en coûte, pour que l'arbitrage se reprenne avec le bon chiffre :

```
200 appels parallèles à GET /api/donnees, session rssi.tls (lecture seule, export: false)
→ 201 entrées de journal en 2,13 s   =  94 entrées/s
→ 1 286 octets par entrée (mesuré)   ≈  121 Ko/s  ≈ 10,4 Go/jour
```

Le journal est **en ajout seul, chaîné, conservé trois ans** ; `deploy/retention.sh` ne
purge qu'au-delà de la rétention. Le limiteur d'API, lui, ne compte **que les requêtes non
authentifiées** (`src/api/limiteur.ts`, et c'est écrit).

**Le rayon.** Une session ordinaire peut saturer le disque de la VM du client en quelques
jours — et le premier effet d'un disque plein sous PostgreSQL est l'arrêt de toute écriture,
donc du produit. Le motif de la borne manquante n'est pas l'attaquant : c'est **B-1**, qui
fait faire ce travail au produit **tout seul**.

---

# 3. Le tri

| Classe | Nombre | Lesquels |
|---|---|---|
| **Bloquent le fonctionnement du produit** | **2** | **B-1** — le journal d'audit, registre de preuve du produit, est noyé de 3 750 fausses accusations d'extraction par jour et par onglet, et l'énoncé qu'il inscrit est faux ; **B-3** — le circuit d'approbation d'un document qu'on vient de créer est inaccessible sans rechargement, et le produit affirme à tort que l'enregistrement « appartient à une autre filiale » |
| **Fuite ou perte de données entre filiales** | **0** | Aucune. Aucun franchissement de frontière observé, et B-3 est un message faux, pas un accès |
| **Le reste** | **7** | B-2, B-4, B-5, B-6, B-7, B-8, B-9 |

**Par gravité : 1 🔴 bloquant · 5 🟠 majeurs · 3 🟡 mineurs.**

⚠️ **Quatre des neuf constats — B-4, B-5, B-6 et la moitié de B-1 — ne sont pas des défauts
du produit mais des défauts du DISPOSITIF QUI LE MESURE.** C'est la troisième porte
consécutive où ce motif domine (7ᵉ passage : « sur 12 mutations, 3 ne mordent pas — et les
trois sont des gardes posés la veille »). Le produit est en meilleur état que son banc.

---

# 4. Les mutations jouées

**Huit mutations, toutes sur la copie du dépôt, jamais sur la recette.**

| | Ce qui a été cassé | Famille jouée | Verdict |
|---|---|---|---|
| **M1** | `LIGNES_SONDAGE_ORDINAIRE_MAX` 25 → 1 000 000 (la trace du sondage neutralisée) | `test/journal/couverture.test.mjs` | ✅ **mord** — 2 échecs |
| **M2** | `/api/rgpd/registre-produit` déclarée `publique` au lieu de `lire`/`rgpd` | `test/cycle/registre-produit.test.mjs` | ✅ **mord** — 5 échecs |
| **M3** | La trace de `GET /api/donnees` retirée (le correctif Q-209) | `test/journal/couverture.test.mjs` | ✅ **mord** — 2 échecs |
| **M4** | `elementsParLiaison` 1 000 → 100 000 000 (la borne de collection, remède de Q-214 d) | `documents/classification` + `api/routes` | ❌ **NE MORD PAS** — 53/53 verts → **B-4** |
| **M5** | `escapeHtml` retiré du badge de diffusion | `navigateur/classification-documents` | ❌ ne mord pas — **mutation faible, que je ne compte pas comme un trou** : la valeur échappée est une constante littérale du module, non atteignable par l'utilisateur. L'essai a raison de s'en désintéresser |
| **M6** | `escapeHtml` retiré de l'**étiquette affichée** (donnée utilisateur, atteignable) | `navigateur/classification-documents` | ❌ **NE MORD PAS** — 5/5 verts → **B-5** |
| **M7** | Le refus d'étiquette (virgule, longueur) retiré : la valeur est avalée en silence | `navigateur/classification-documents` | ✅ **mord** — 1 échec (§3) |
| **M8** | Le dédoublonnage insensible à la casse du composant à **puces** retiré | `navigateur/classification-documents` | ❌ **NE MORD PAS** — 5/5 verts → **B-6** |

**Bilan : 8 mutations, 4 mordent, 4 ne mordent pas — dont 3 sont de vrais trous de
couverture** (M4, M6, M8) et une (M5) est une mutation que je juge non exploitable et dont
l'absence de morsure est légitime.

⚠️ **Les trois trous portent tous sur du code livré les 10 et 11/09** — la borne de
collection, l'échappement de la donnée neuve, et le composant partagé qui vient d'être
réécrit. C'est le motif du 7ᵉ passage, à l'identique.

---

# 5. Ce qui tient — chiffré

- **33 passages d'écran** dans Chromium réel derrière l'Apache du dépôt (29 sections + 4
  fiches et formulaires) : **0 violation de politique de sécurité de contenu**, **0 écran
  vide**, **0 erreur de console** hors le 401 attendu avant connexion et celle de B-3.
- **Le parcours complet d'un utilisateur sur le lot neuf, et rien n'est détruit** : créer un
  document, choisir un niveau de diffusion (la note explicative suit la bascule), cocher
  « données personnelles », poser quatre étiquettes dont un doublon de casse et une valeur
  interdite, enregistrer, **recharger la page entière**, retrouver
  `confidentialite = public`, `donnees_personnelles = true`, puces
  `["RGPD","audit 2026"]` **à l'identique** ; le bandeau « public + données personnelles »
  s'affiche, la colonne Diffusion est là, le filtre par niveau ramène 1 ligne sur 3 et le
  bouton de remise à zéro les rend, et l'impression produit **2 335 085 octets de PDF**.
- **Le champ à puces généralisé n'a rien cassé** sur son consommateur préexistant : ajout au
  bouton, ajout à la touche Entrée, dédoublonnage à la casse, retrait, conservation à
  l'enregistrement — sept propriétés mesurées sur l'écran « Revues de Direction », toutes
  vertes.
- **S11 est le meilleur contrôle du périmètre** : 40 tentatives sur un identifiant
  inexistant, 40 × 401 **indiscernables**, et le journal montre que le verrouillage a mordu
  à la cinquième. Le refus de verrouillage est à l'octet près celui d'un mot de passe faux.
- **S9** : EICAR véritable refusé et mis en quarantaine, faux `.docx` refusé **par ce qu'il
  contient**, fichier sain accepté avec son SHA-256. Témoin indépendant pris sur le socket
  de `clamd`.
- **Les bornes de S13 tiennent toutes**, même si rien ne les mesure : corps de 30 Mo →
  **413 en 13 ms** ; JSON à 1 000 niveaux → 400 ; `titre` de 26 000 000 signes → 400
  (« dépasse 200000 caractères ») ; 5 000 étiquettes → 400 (« maximum 1000 ») ; 1 000
  étiquettes acceptées en 1,55 s.
- **S12** : douze chemins d'erreur sondés (entité inconnue, traversée `../../etc/passwd`,
  octet nul, apostrophe en paramètre, corps non-JSON, `23503`, `23505`, `23514`, valeur de
  domaine invalide, élément vide) — **aucun code SQL, aucun nom de contrainte, aucun nom de
  table, aucune trace d'exécution**, et une `reference` opaque sur chacun.
- **S6** : 24 mesures (6 routes × 4 profils d'annuaire réels), toutes conformes aux droits
  déclarés dans la charte de session.
- **`npm audit --omit=dev`** → **0 vulnérabilité**, code 0.
- **`install.sh --diagnostic`** → **14 conformes, 1 réserve, 0 bloquant**, code de retour
  **1** (mesuré, pas supposé — le premier relevé par `PIPESTATUS` était faux). Le constat
  **Q-290 est bien fermé** : la quarantaine est rendue (« 4 fichier(s), 52K — conservés à
  dessein, jamais effacés ») et le minuteur de ré-analyse aussi.
- **Q-280 est bien fermé, sur les deux voies que j'ai pu éprouver** : un document
  « en validation » refuse le passage « en vigueur » avec `GRC06` et une phrase qui dit quoi
  faire ; et le contournement par un retour au **brouillon** est fermé — `validation_engagee`
  survit au retour en arrière, mesuré (`brouillon`, `validation_engagee: true`, puis `GRC06`).
- **Q-288 est bien fermé** : `CLAUDE.md` annonce `/usr/lib/node_modules`, et `npm root -g`
  rend `/usr/lib/node_modules`.
- **Q-286** : l'arbitrage est **honnête** — aucun limiteur par session n'existe, et le motif
  écrit correspond à ce que j'ai mesuré. Ce qui manque à l'arbitrage est son coût, que
  **B-9** chiffre.

---

# 6. Ce que je n'ai pas pu mesurer

- **`POST /api/reprise` en mode « remplacer »** (la seconde voie de Q-280) n'a **pas** été
  jouée : elle détruit le jeu de la filiale de recette, et je n'avais pas de base jetable
  sous la main sans jouer une migration complète. La voie 1 et le contournement par le
  brouillon sont mesurés ; la voie de reprise reste **non rejouée** — et *« non rejoué » ne
  vaut ni « passé » ni « en échec »*.
- **Les écrans de détail** de vingt-deux modules sur vingt-six n'ont pas été ouverts un par
  un : j'ai parcouru les listes et les quatre fiches qui portaient le lot neuf. Une
  régression de fiche ailleurs resterait invisible à ce passage.

---

*Rapport clos le 11/09/2026. `git status` du dépôt vérifié vide de toute modification du
produit, du banc et de la documentation, au début et à la fin.*
