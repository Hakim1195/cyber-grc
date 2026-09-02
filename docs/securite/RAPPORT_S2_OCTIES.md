# Porte de sécurité S2 (8ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-OCTIES**, agent indépendant. Je n'ai écrit aucune des lignes
> examinées, ni aucun des sept rapports précédents. Travail en **lecture seule** sur le
> dépôt : le seul fichier que je crée est celui-ci, et toutes mes mutations ont vécu dans
> une copie hors dépôt (`…/scratchpad/s2viii/copie`).
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, révision
> examinée **`ab53aec`** (« Registre : les huit constats du 7e passage sont fermés »).
>
> Références : `docs/PLAN_EXECUTION.md` §4 (les dix-huit contrôles), §5 (définition de
> « terminé »), §7 (journal des portes, registre des **quarante-trois** constats) ;
> `docs/securite/RAPPORT_S2_SEPTIES.md` ; `backend/db/CONVENTIONS.md` §16 à §24 ;
> `backend/README.md` §8 ; `docs/PLAN_SERVEUR.md`.
>
> Date : 02/09/2026.

---

## 1. Le verdict

> ### ❌ **PORTE REFUSÉE** — **0 bloquant**, **4 majeurs**, **3 mineurs**. **Deux contrôles de la grille sont en échec : S13 et S17.**

Il faut commencer par ce qui a changé, parce que c'est réel : **le lot est plus solide
qu'à aucun des sept passages précédents.** Les fermetures que j'ai rejouées mordent
toutes — **dix-sept par mutation ou sabotage, zéro exception**, y compris les trois que le
7ᵉ passage avait trouvées fermées sur le papier et vertes sous mutation (constat Q-38).
Le cœur serveur n'a pas bougé : **119 sondes de périmètre, 0 dérive** ; **36 noms
d'entité hostiles, 0 fuite** ; aucun champ technique accepté en écriture. Le
cloisonnement rend **107/107** et tombe à **104/107, code 3** au retrait d'un seul
`force row level security`. Et le bloquant du 7ᵉ passage est bel et bien fermé : j'ai
monté **mon propre Apache 2.4.58 sur le fichier livré**, et `http://hôte` → 308 →
`https://hôte/` rend **200**.

J'ai aussi traité une réserve que sept passages ont reconduite sans la lever : **la
politique TLS livrée est mesurée pour la première fois** — TLS 1.0 et 1.1 refusés, les
suites à RSA statique et les suites CBC refusées, seules les suites AEAD à
confidentialité persistante acceptées. C'était une minute de travail.

Ce qui refuse la porte n'est ni un bloquant, ni un correctif retourné contre son auteur.
Ce sont **quatre contrôles verts qui ne contrôlent rien** — une borne qui ne borne pas,
un banc qui ne s'exécute pas, un balayage qui ne balaie pas, et un registre qui perd la
ligne d'un bloquant. C'est la forme exacte que ce chantier traque depuis quatorze
passages, et dont il n'a pas fini de payer les variantes :

| # | Constat neuf | Gravité |
|---|---|---|
| **Q-44** | **`LimitRequestBody` est inopérante sur `/api/`, le seul chemin qui porte un corps.** Sous Apache 2.4.58 et le vhost du dépôt, un corps de **28 311 552 octets** traverse le frontal en entier et arrive au service, alors que la directive vaut **27 262 976**. Ce n'est pas un mauvais nombre : la directive **ne s'applique pas à un chemin mandaté**, y compris posée dans un `<Location /api/>`. Contrôle symétrique dans le même serveur : le même envoi sur `/index.html` rend **413**. Le commentaire du vhost affirme l'inverse, et `install.sh` compare les deux valeurs pour imprimer « ok » — un garde-fou dont la prémisse est fausse. **Contrôle S13 en échec.** | 🟠 majeur |
| **Q-45** | **Le banc ne tourne pas sur une machine propre : 14 essais échouent sur `ENOTFOUND grc.exemple.interne`.** Toute la cinquième famille — celle née du bloquant Q-36 — dépend d'une entrée `/etc/hosts` qu'**aucun essai ne pose, qu'aucun essai ne réclame, et qu'aucun document ne mentionne**, alors que le `README` §5 annonce sa liste de prérequis close (« Quatre, et aucun n'est facultatif »). Mesuré : `npm test` → **628 · 614 · 14** ; entrée ajoutée, rien d'autre changé → **628 · 628 · 0**. **Contrôle S17 en échec.** | 🟠 majeur |
| **Q-46** | **Le quatrième annuaire.** Le balayage qui mesure la conversion des gestionnaires en ligne — l'instrument du constat M-6, celui qui avait rendu l'application inerte sous la CSP de production — porte une **liste de 28 écrans écrite à la main**, annoncée dans son propre commentaire comme « TOUTES les routes de l'application […] la liste est celle de `js/app.js` ». Rien ne compare les deux, ni dans un sens ni dans l'autre. **Mutation : une route neuve portant un `onclick=` est ajoutée à `js/app.js` → le balayage reste vert, 10/10, sans l'avoir seulement visitée.** Et la liste a **déjà dérivé sans que personne le voie** : `#/soa` n'est pas une route ; le balayage y inspecte la page « Page introuvable » (534 caractères) et la compte comme un écran visité. | 🟠 majeur |
| **Q-47** | **Le registre perd une ligne entière, et c'est celle d'un bloquant.** La ligne 467 de `docs/PLAN_EXECUTION.md` §7 porte **13 barres verticales** là où toutes les autres en portent 7 : les lignes de **Q-28 et de Q-29 sont collées sur un seul retour à la ligne**. Le tableau rendu compte donc **42 constats, pas 43**, et celui qui manque est **Q-29 — le seul 🛑 bloquant du 6ᵉ passage**. Ligne 481, une barre non échappée dans le fragment `` `js|css` `` décale toutes les colonnes de Q-43 : sa colonne « État » rend son **échéance**. C'est **Q-40 au carré, produit par le correctif de Q-40** | 🟠 majeur |
| **Q-48** | **Q-4, septième signalement.** `README` §5 annonce **615 essais** en cinq familles (272 · **175** · 77 · 53 · **38**) ; la mesure rend **628** (272 · **180** · 77 · 53 · **46**). Le « contrôle de fraîcheur » du §8 — « rejouée après la fermeture du constat suivant (qui ne touche que `src/serveur.ts`) et rend toujours 615 · 615 · 0 » — est faux deux fois : cette fermeture a ajouté **un fichier d'essai entier** (`test/api/reference-incident.test.mjs`, 292 lignes) et 354 lignes à deux autres | 🔵 mineur |
| **Q-49** | **La façade `DataStore` expose 131 membres, pas 130.** `README` §8 et `CLAUDE.md` §8 écrivent tous deux « 130 membres avant, 130 après ». La **propriété** est vraie, et je l'ai vérifiée plus finement qu'eux — 131 à `d4aeff0` (avant la vague 2), 131 à `HEAD`, et le `diff` des deux listes triées est **vide** — mais le nombre publié est faux, et c'est celui qu'un lecteur comparerait | 🔵 mineur |
| **Q-50** | **Une conséquence non écrite du motif de la liste blanche.** Le commentaire du vhost explique le `(?!$)` par le seul **nom vide** d'une requête de répertoire *avec* barre finale. Sans barre finale, le nom n'est pas vide : `GET /assets` rend **403** au lieu de la redirection `301 → /assets/` qu'Apache ferait normalement. Sans effet sur l'application livrée — aucune de ses URL n'est un répertoire, et les 64 fichiers publiés sont tous servis — mais c'est une propriété du motif que son commentaire ne décrit pas | 🔵 mineur |

**Pourquoi je ne conclus pas « franchie ».** Deux contrôles de la grille sont en échec, et
la règle est celle que l'orchestrateur a appliquée deux fois — au 4ᵉ passage de S1 et au
2ᵉ de S2 : *un contrôle en échec ne se franchit pas.* **S13** exige « taille de corps
bornée » ; à l'endroit où un corps arrive, elle ne l'est pas par le frontal. **S17** exige
que le chemin complet ait été parcouru « dans la configuration de déploiement réelle » ;
la famille d'essais qui le fait ne s'exécute pas sur une machine qui n'a pas reçu, à la
main, une ligne que rien ne documente. Je n'ai pas la latitude de requalifier cela en
réserve : ce chantier a écrit noir sur blanc, deux fois, ce que valent les réserves.

**Ce que j'ai essayé de casser sans y parvenir**, parce qu'un refus qui ne le dit pas est
un caprice : le périmètre (119 sondes), l'injection SQL (36 noms, 0 fuite), les champs
techniques en écriture (7 refusés sur 7), les en-têtes de sortie (7 réponses, 0 manquant),
l'indiscernabilité du caché et de l'absent (404 identiques au gabarit près), le journal en
ajout seul (`UPDATE`/`DELETE`/`TRUNCATE` refusés **au propriétaire** avec « en ajout
seul »), le chaînage (0 anomalie), les cinq garde-fous du schéma (débranchés un par un,
cinq refus), `npm run verifier-types` (0 erreur), `npm audit --omit=dev` (0
vulnérabilité), et la chaîne complète sous Apache réel — URL d'entrée, en-têtes posés sur
les réponses **d'erreur** comme de succès, `TRACE` → 405, bannière réduite à « Apache »,
`LimitRequestLine` et `LimitRequestFields` qui mordent, seize formes d'URL hostiles toutes
refusées par la liste blanche.

---

## 2. Comment cette porte a été jouée

Rien de ce qui suit ne repose sur la lecture seule ni sur la démonstration de l'auteur du
code. Chaque affirmation porte la commande qui la produit.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2viii`**, neuve (`db/dev/preparer_base_dev.sh --base grc_audit_s2viii --recreer`), recréée après chaque sabotage de schéma, plus les bases jetables d'`ouvrirBaseEssai` |
| Copie de travail | **Copie complète du dépôt hors du dépôt** (`…/scratchpad/s2viii/copie`, `node_modules` en lien symbolique), où vivent **toutes** mes mutations |
| Serveur | `monterServeurReel()` réel, monté une vingtaine de fois, en `developpement` **et** en `production` |
| **Apache** | **Le mien**, 2.4.58, monté à la main sur `deploy/apache/cyber-grc.conf` **et** `durcissement-global.conf`, avec neuf substitutions déclarées (ports, chemins, certificat, cible du mandataire) et **aucune touchant une directive de décision** |
| Navigateur | Playwright / Chromium ; les 53 essais de `test/navigateur/`, rejoués sept fois sous mutation ; une sonde d'écran écrite par moi |
| Sondes écrites par moi | 119 sondes de périmètre, 36 noms d'entité hostiles, 16 formes d'URL hostiles, 5 sondes TLS, 3 sondes de bornes HTTP, un balayage mécanique de la façade |
| Mutations | **17 mutations** appliquées une par une, compilées, jouées, annulées ; **2 sabotages de schéma** sur base vivante ; 3 sabotages de configuration Apache |

### Ce que j'ai vérifié de mon propre outillage avant d'accuser le code

C'est la règle du chantier, et elle m'a évité d'écrire **quatre** sottises. Je les donne
toutes, parce que trois d'entre elles ressemblaient à des constats sérieux.

1. **PostgreSQL était arrêté au démarrage de ma session.** `pg_isready` →
   `no response`, puis `Removed stale pid file` au redémarrage. C'est le premier geste
   que le `README` §8 prescrit, et il a servi : sans lui, mon premier banc aurait rendu un
   total effondré **sans un seul échec**, et j'aurais cherché une régression là où il n'y
   avait qu'un conteneur redémarré.

2. **Mon premier Apache rendait 403 sur tout, `/index.html` compris.** Cela ressemblait à
   une aggravation du bloquant Q-36. `namei -l` a dit la vérité en une ligne : les
   répertoires parents de mon répertoire de travail sont `drwx------`, et `www-data` ne
   peut pas les traverser. **Mon instrument, pas le produit.** Racine déplacée sous
   `/tmp`, et tout est rentré dans l'ordre. Le banc du dépôt, lui, utilise
   `mkdtempSync(tmpdir())` — il ne pouvait pas tomber dans ce trou.

3. **Mes quatre premières sondes HTTPS rendaient `000` et « 200 Connection
   Established ».** C'était le mandataire de l'environnement qui détournait la sonde —
   exactement le piège que `deploy/install.sh` documente et neutralise par
   `--noproxy '*'`. J'ai fait comme lui.

4. **Ma première mutation du verrou optimiste (S4) « ne mordait pas ».** Avant de
   l'écrire, j'ai relu où elle avait atterri : les **quatre** occurrences de
   `and version = ` dans `src/entites/index.ts` sont dans des **commentaires**. J'avais
   muté de la prose. La vraie clause se construit à la ligne 3280 ; mutée là, elle fait
   **14 essais rouges**. Le banc n'avait rien à se reprocher, mon motif si.

5. **J'ai failli consigner un constat que la mesure a réfuté.** J'avais noté que
   `durcissement-global.conf` pose un `Timeout 60` dont la « chaîne de trois délais » du
   vhost ne parle pas — un quatrième maillon caché. Mesuré avant d'écrire :
   `ProxyTimeout 120` + `Timeout 60`, service qui répond en **90 s** → **HTTP 200 après
   90 s**. `ProxyTimeout` prime, `Timeout` ne coupe rien sur ce chemin. **Le constat était
   faux, il n'est pas dans ce rapport** ; il est au §6, où il sert d'exemple.

### Contrôles d'environnement, joués avant tout le reste

```
pg_isready                    /var/run/postgresql:5432 - accepting connections  (après redémarrage)
node --version                v22.22.2
psql --version                psql (PostgreSQL) 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
apache2 -v                    Apache/2.4.58 (Ubuntu)
rsync --version               rsync  version 3.2.7
git status --porcelain        (vide)
git rev-parse HEAD            ab53aec5be1f47a05ccef4ef553dca7032865977
npm run verifier-types        EXIT=0
npm audit --omit=dev          found 0 vulnerabilities
npm audit (complet)           found 0 vulnerabilities
```

---

## 3. Le sort des quarante-trois constats du registre

Le registre porte **43 constats** : 38 déclarés fermés, **4 reportés** (Q-9, Q-10, Q-16,
Q-28) et **1 refus argumenté** (Q-11). Je les ai tous repris. Ceux marqués « mutation »
ont été **cassés dans la copie hors dépôt**, joués, puis restaurés : une fermeture qui ne
rougit pas sous la mutation qui l'a motivée n'est pas une fermeture.

### 3.1 Les dix-sept fermetures rejouées par mutation ou sabotage — **toutes mordent**

| Constat | Mutation appliquée | Ce que le banc a rendu |
|---|---|---|
| **Q-1 · Q-26** | `OCTETS_ALEA = 16` → `5` (aléa serveur ramené à 40 bits) | `api/identifiants` **16 · 11 · 5** |
| **Q-5** | `drop function f_verifier_couverture_rls()` sur base vivante | `migrate.mjs --verifier` **code 7**, `point_appel` — et le message nomme la date de la dernière observation et la signature disparue |
| **Q-19 · Q-20** | `BORNES.lignesParReprise: 8000` → `500000` | `api/bornes-reprise` **8 annulés**, la suite n'aboutit plus |
| **Q-24** | `champsRefuses.add(…)` retiré du refus | `navigateur/bascule` **43 · 42 · 1** |
| **Q-25** | `rechargeable: false` → `true` sur le refus de droit | `navigateur/bascule` **43 · 42 · 1** |
| **Q-29** | `aPreserver = Array.from(creationsBloquees…)` → `[]` | `navigateur/bascule` **43 · 42 · 1** |
| **Q-30** | `issueInconnue = modifie && (502 ‖ 504)` → `false` | `navigateur/bascule` **43 · 41 · 2** |
| **Q-31** | `xlsx` ajouté à `FRONTEND_PUBLIABLE` sans toucher au vhost | `test/deploiement` **46 · 17 · 15** |
| **Q-32** | séparateur retiré entre compteur et aléa dans `UI.genId` | `navigateur/bascule` **43 · 42 · 1** |
| **Q-33 (a)** | `history.replaceState(…)` du recalage d'adresse neutralisé | `navigateur/bascule` **43 · 42 · 1** |
| **Q-33 (b)** | `if (aDesModificationsEnAttente()) await cycle();` retiré | `navigateur/bascule` **43 · 42 · 1** |
| **Q-33 (c)** | `if (abandonne()) signalerAbandon('avant transaction');` retiré | `api/bornes-reprise` **8 · 7 · 1** |
| **Q-36** | `(?!$)` retiré du `<FilesMatch>` de la liste blanche | `test/deploiement` **46 · 39 · 7**, dont *« LE BLOQUANT : http → 308 → https → 200 »* |
| **Q-37** | le bloc `frontend` d'`install.sh` meurt avant son message de succès | `install-blocs` **26 · 25 · 1** — l'assertion d'absence **ne se satisfait plus d'un script mort** |
| **Q-39** | `requestIdHeader: false` → `'x-request-id'` | `api/reference-incident` **5 · 1 · 4** |
| **Q-42** | `text/javascript application/javascript` → `application/javascript` | `vhost-apache` **14 · 12 · 2** |
| **Q-43** | `ExpiresByType image/png "access plus 30 days"` réintroduit | `vhost-apache` **14 · 11 · 3** |

**Q-38 est le résultat qui compte le plus**, parce que c'est celui que le 7ᵉ passage avait
trouvé faux : les **trois** remèdes de Q-33 étaient inscrits « ✅ corrigé » sans une ligne
d'essai, et les trois mutations laissaient le banc vert. **Les trois mordent aujourd'hui**,
séparément, chacune sur l'essai qui porte son nom.

### 3.2 Les fermetures vérifiées autrement

| Constat | Comment je l'ai vérifiée | Verdict |
|---|---|---|
| **Q-2 · Q-13** | `src/reprise/` ne contient plus **aucun** générateur aléatoire (`grep -n "randomBytes\|Math.random"` → seul `createHash` subsiste) ; la ré-émission `-r-` et la dérivation `-d-` sont des empreintes | ✅ tenue |
| **Q-3 · Q-21** | la famille `test/navigateur/` existe et compte **53 essais** ; les avertissements sont éprouvés **quand ils parlent** (« LE CANARI PARLE », « LE SONDAGE POUSSE ») | ✅ tenue |
| **Q-4 · Q-34 · Q-41** | ❌ **rouverte** — voir **Q-48** : le `README` §5 annonce 615 essais et deux comptes de famille faux | ⚠️ à rouvrir |
| **Q-6 · Q-12 · Q-18 · Q-22** | balayage mécanique : **tout membre `X.methode()` appelé dans les 58 fichiers du frontend existe** sur l'objet réellement construit — 0 appel dans le vide, sur les 11 objets globaux | ✅ tenue |
| **Q-7** | `imports.id` n'a plus de `Math.random()` en ligne ; le générateur unique du serveur est le seul chemin | ✅ tenue |
| **Q-8** | le sondage ne recalcule plus le différentiel complet par battement ; l'essai « le sondage POUSSE » l'exerce | ✅ tenue |
| **Q-14 · Q-17** | le seuil du garde-fou SQL est en **bits** ; le témoin base 36 n'est plus crié | ✅ tenue (migration `006` présente et appliquée) |
| **Q-15** | essais « après le renommage, et SANS aucun autre geste, la page revient au repos » + son contrôle symétrique — verts, et le mécanisme est celui décrit | ✅ tenue |
| **Q-23 → Q-32** | la coche de Q-23 avait été retirée à raison ; Q-32 la remplace, et **sa mutation mord** (3.1) | ✅ tenue |
| **Q-27** | fermé, puis complété par Q-29 et Q-30, dont **les deux mutations mordent** | ✅ tenue |
| **Q-35** | `install.sh` est joué par le banc : `blocsAnnonces()` **découvre** les marqueurs au lieu de les énumérer, et exige la réciproque | ✅ tenue — et c'est le seul endroit du banc où j'ai trouvé les **deux** sens d'un contrôle de liste |
| **Q-40** | ❌ **rouverte, et aggravée** — voir **Q-47** : la case d'état de Q-28 est bien remplie, mais la ligne porte **deux** constats et **Q-29 n'a pas de ligne du tout** | ⚠️ à rouvrir |

### 3.3 Les quatre reports et le refus argumenté

| # | Report | Mon verdict |
|---|---|---|
| **Q-9 / Q-20** | fond de la saturation → **lot L7**, vague 5 | **Défendable.** La borne (8 000 lignes) et le refus **avant** prise de connexion sont en place et mordent : mutée, la suite n'aboutit plus. Ce qui reste à L7 est la reprise fractionnée, c'est-à-dire une fonctionnalité, pas un correctif. Le chiffre qui avait fait requalifier Q-9 en Q-20 (98,9 s pour 60 000) n'est plus atteignable : le serveur refuse au-delà de 8 000. |
| **Q-10** | ~160 ms d'analyse de corps avant décision → **lot L3**, vague 3 | **Défendable, et je le re-mesure avec une conséquence de plus.** En `production`, la barrière *fail-closed* rend bien **503** sur `/api/session`, `/api/modele`, `/api/donnees`, `/api/rafraichir`, `POST` et `PUT /api/entites/…`. Mais la **validation de schéma passe avant** : un corps mal formé rend **400** là où un corps bien formé rend **503**. Un appelant non authentifié distingue donc les deux, et apprend par là **la forme attendue du corps**. Ce n'est pas une fuite de données, c'est un oracle de schéma — et il disparaît avec le contrôle en `onRequest` que Q-10 prescrit déjà. **À joindre à Q-10, pas à numéroter à part.** |
| **Q-16** | les 26 modules métier sans filet → **vague 3** | **Défendable, mais le constat Q-46 en change le prix.** Le seul instrument qui balaie aujourd'hui les 28 écrans est celui que Q-46 démasque : il ne voit pas un écran neuf. Tant que Q-46 n'est pas fermé, « les modules ne sont pas couverts » est **plus vrai que le registre ne le dit** — il n'y a pas de filet *et* le seul balayage transversal est aveugle aux ajouts. |
| **Q-28** | `LONGUEUR_ALEA` dupliquée dans `src/reprise/index.ts` → **vague 3** | **Défendable sur le fond, mais sa ligne au registre est cassée** (Q-47). Vérifié : `src/reprise/index.ts:587` porte bien `padStart(25, '0')` en dur, `src/entites/index.ts:4414` porte `LONGUEUR_ALEA = 25`. Rien ne casse aujourd'hui ; les deux dérivations restent des dérivations. |
| **Q-11** | repli d'`applyImport` : **documenté, non fermé** | **Refus défendable, et je le confirme par la mesure.** Fermer exigerait une liste de champs-références tenue à la main ; `/api/modele` rend le *type* d'une colonne, jamais sa nature de référence. Les deux essais « le bandeau nomme la réécriture et son compte » et son **contrôle symétrique muet** sont verts, et le second est ce qui empêche le premier d'être un décor. C'est le bon arbitrage : une liste dont l'omission **réussirait en silence** est le mauvais outil (`CLAUDE.md` §3). |

---

## 4. La grille §4, contrôle par contrôle

| # | Verdict | Ce que j'ai exécuté, et ce que cela a rendu |
|---|---|---|
| **S1** | ✅ | `db/verifier_cloisonnement.sql` sous **`grc_app`** : **107 contrôles, 107 réussis, 0 échec, code 0**. Catalogue relevé sur la base réelle : **48 tables publiques, 0 sans RLS activée, 0 sans RLS forcée**. Rôles : `grc_app`, `grc_lecture` et `grc_proprietaire` ont tous `bypassrls=false` et `super=false`. **Sabotage sur base vivante** — `alter table risques no force row level security` → démonstration **104/107, 3 échecs nommés, code 3**, avec la phrase « CLOISONNEMENT EN DÉFAUT » ; le même sabotage fait sortir `migrate.mjs --verifier` en **code 7** (`couverture_rls : risques → force_absente`). |
| **S2** | ✅ | **119 sondes de périmètre écrites par moi.** 16 formes d'en-tête (`x-filiale`, `grc-filiale`, `x-perimetre`, `x-administration-groupe`, `x-forwarded-user`, `x-grc-filiales`, `authorization`, `cookie`, `x-tenant`, `x-scope`…) × 6 valeurs (dont la filiale voisine et `' or 1=1 --`), 6 paramètres d'URL × 3 valeurs, 5 enveloppes de corps (dont `filiale_id`, `portee: 'groupe'`, `administrationGroupe: true`, `perimetreLecture: [A, B]`). **`0` dérive** : filiale active, périmètre de lecture et `administration_groupe` identiques à la référence sur les 119. Aucune pollution de prototype. La propriété reste tenue par la **forme** — `resoudre()` ne prend aucun argument. |
| **S3** | ⬜ sans objet (L5) | Rejoué quand même. L'API **n'écrit jamais** dans `journal_audit` : les deux seules occurrences dans `backend/src/` sont des **commentaires** qui le disent. Sous `grc_app` : `delete` et `truncate` → `permission denied`. **Sous le propriétaire** : `update`, `delete` et `truncate` → *« Table journal_audit en ajout seul : opération … refusée »*. `f_journal_audit_verifier()` → **0 anomalie**. La réserve **C22** (lecture non cloisonnée) reste un livrable ferme de L5, et la démonstration la dit en toutes lettres avant tout le reste. |
| **S4** | ✅ | Mutation sur la **vraie** clause (`src/entites/index.ts:3280`, `majAvecVersion`) : `and version = $2` supprimé → **`test/api` : 180 · 166 · 14**, dont « version périmée → motif conflit_version », « la seconde reçoit conflit_version », « 409 — GRC03 ET la version réelle », « 404 — absente et cachée rendent une réponse INDISCERNABLE ». Aucun des 7 champs techniques (`version`, `cree_le`, `cree_par`, `filiale_id`, `portee_groupe`, `modifie_par`, `id`) n'est accepté en écriture. |
| **S5** | ✅ | **36 sondes** : 18 noms d'entité hostiles (`risques"; drop table risques; --`, `pg_catalog.pg_class`, `../risques`, `__proto__`, `information_schema.tables`, `journal_audit`, `sessions`, `pg_sleep(5)`, `constructor`, `prototype`…) × 2 méthodes. **0 fuite** : ni fragment SQL, ni `SQLSTATE`, ni pile, ni nom de table ou de colonne dans aucune réponse. |
| **S6** | ⬜ sans objet (L3) — **barrière provisoire vérifiée** | En `production`, corps **valides** : `/api/session`, `/api/modele`, `/api/donnees`, `/api/rafraichir?depuis=…`, `POST /api/entites/risques`, `PUT /api/entites/risques/:id` → **503 `indisponible`** ; `/api/sante` → **200**. Réserve mesurée : la **validation précède la barrière** (corps mal formé → 400, corps bien formé → 503). C'est **Q-10**, déjà attribué à L3. |
| **S7** | ⬜ sans objet | Droit d'export distinct : **lot L3** (`PLAN_SERVEUR` §3.3). |
| **S8** | ✅ | Aucun secret dans les fichiers suivis ; le mot de passe `dev` ne vit que dans `db/dev/preparer_base_dev.sh`, sous refus explicite en `NODE_ENV=production`. La racine web publiée par le vrai `rsync` ne porte que des types de la liste blanche — j'ai déposé quatre intrus (`data/registre.xlsx`, `secret.env`, `LISEZMOI`, un lien symbolique) : **tous refusés en 403 par l'Apache réel**. |
| **S9** | ⬜ sans objet | Pièces jointes : **lot L6**. |
| **S10** | ✅ | Côté API : `x-content-type-options: nosniff` **et** `cache-control: no-store` sur **7 réponses** (200, 400, 404, 415, route inconnue, `DELETE`, `PUT`) — **0 manquant**. Côté frontal, mesuré sur **mon** Apache : les 9 en-têtes du fichier livré, CSP comprise, sont posés **aussi sur les réponses d'erreur** — un `403` de la liste blanche porte HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` et la CSP complète. Bannière : `Server: Apache` (le `ServerTokens Prod` du durcissement global s'applique). |
| **S11** | ⬜ sans objet | Limitation de rythme : **lot L3**, condition E4. |
| **S12** | ✅ | « Caché » et « absent » rendent une réponse **identique au gabarit près** : `PUT` sur `RISK-B` (filiale voisine) et sur `RISK-NEXISTE-PAS` → **404**, `ressource_inconnue`, même phrase, seuls l'`identifiant` renvoyé et la `reference` diffèrent. Aucune pile, aucun `SQLSTATE`, aucun nom d'objet de base dans mes 155 sondes. La `reference` est désormais engendrée par le serveur et préfixée `REQ-` (correctif Q-39, visible dans toutes mes réponses d'erreur). |
| **S13** | ❌ **EN ÉCHEC** | Les bornes **applicatives** mordent — c'est la moitié qui va bien. Mais la borne du **frontal**, `LimitRequestBody 27262976`, **ne s'applique pas au seul chemin qui porte un corps** : un envoi de **28 311 552 octets** sur `/api/…` traverse Apache en entier et arrive au service, alors que le même envoi sur `/index.html` rend **413**. Y compris en posant la directive dans un `<Location /api/>`. C'est **Q-44**, et le vhost comme `install.sh` affirment le contraire. `LimitRequestLine` (414 à 9 000 signes) et `LimitRequestFields` (400 à 140 en-têtes, 200 à 40) mordent, eux. |
| **S14** | ✅ | Une reprise dont un enregistrement est refusé rend **400** et ne laisse rien ; le sabotage du contrôle d'abandon *avant transaction* fait rougir l'essai qui l'énonce (3.1, Q-33 c). L'abandon **avant validation** est distingué de l'abandon **avant transaction** dans le journal, et les deux essais sont verts. |
| **S15** | ✅ | `npm audit --omit=dev` → **0 vulnérabilité** ; `npm audit` complet → **0**. Deux dépendances d'exécution (`fastify`, `pg`), épinglées par `package-lock.json`. |
| **S16** | ✅ | Garde-fous éprouvés **par leur débranchement**. (a) `drop function f_verifier_couverture_rls()` → `migrate.mjs` **code 7**, motif `point_appel`, et le message **nomme la signature disparue et la date de sa dernière observation** (registre de `005`, constat Q-5) ; (b) `no force row level security` → **code 7**, `couverture_rls` ; (c) aléa du générateur serveur ramené à 40 bits → **5 essais rouges** et le service refuse de démarrer. Trois débranchements, trois refus. |
| **S17** | ❌ **EN ÉCHEC** | Le chemin complet est **bon**, et je l'ai parcouru sur mon propre Apache : `http://hôte` → 308 → `https://hôte/` → **200**, TLS 1.2/1.3 seuls, suites AEAD seules, en-têtes posés sur succès **et** erreurs, `TRACE` → 405, `/api/**` relayé, seize formes d'URL hostiles toutes refusées. **Mais la famille d'essais qui prouve tout cela ne s'exécute pas sur une machine propre** : 14 échecs `ENOTFOUND grc.exemple.interne`, faute d'une entrée `/etc/hosts` que rien ne pose et qu'aucun document ne réclame (**Q-45**). Un contrôle qui ne s'exécute que sur la machine où quelqu'un a tapé une ligne à la main ne prouve rien ailleurs — et c'est le contrôle né du bloquant du 7ᵉ passage. |
| **S18** | ✅ | Les gestes réels aboutissent, et le banc les joue : chargement sans erreur, formulaire réel enregistré, création dont la réponse expire (une ligne, pas deux), **rechargement qui préserve une création bloquée**, refus de droit sans bouton de rechargement, suppression groupée, reprise de son propre export, round-trip double convergent. **Balayage mécanique de ma main** : sur les 58 fichiers du frontend et les 11 objets globaux, **aucun appel `X.methode()` ne vise un membre qui n'existe pas**. La façade est intacte au sens fort — **131 membres avant la vague 2 (`d4aeff0`), 131 à `HEAD`, `diff` des deux listes triées vide**. Réserve : l'instrument qui balaie les écrans est aveugle à un écran neuf (**Q-46**) — mais aucun écran existant ne porte de gestionnaire en ligne, et je l'ai vérifié. |

**Décompte** : **12 passés · 4 sans objet · 2 en échec (S13, S17)**.

---

## 5. Les constats neufs

La série continue après Q-43.

### Q-44 — 🟠 majeur — `LimitRequestBody` est inopérante sur `/api/`, le seul chemin qui porte un corps

**Ce que le vhost dit** (`backend/deploy/apache/cyber-grc.conf`, bloc « Dénis de service (S13) ») :

> `# Doit rester >= SERVEUR_TAILLE_MAX_CORPS (26 Mio) : Apache refuserait sinon`
> `# des envois que l'application accepte. install.sh compare les deux valeurs`
> `# et alerte si elles divergent.`
> `LimitRequestBody 27262976`

**Ce qui se passe.** Apache 2.4.58, vhost du dépôt, `durcissement-global.conf` chargé,
`/api/` relayé vers une doublure qui compte les octets reçus :

```
POST /api/reprise, corps de 28 311 552 octets  ->  HTTP 200,  doublure : {"recu":28311552}
POST /api/reprise, corps de 27 262 977 octets  ->  HTTP 200,  doublure : {"recu":27262977}   (1 octet au-dessus de la borne)
POST /api/reprise, corps de 27 262 975 octets  ->  HTTP 200,  doublure : {"recu":27262975}
```

**Ce n'est pas un mauvais nombre : c'est une directive qui ne s'applique pas là.** Deux
contrôles l'établissent, dans le même serveur, la même seconde :

```
LimitRequestBody 1000  ·  POST /index.html   corps de 1 Mio  ->  413      la directive est VIVANTE
LimitRequestBody 1000  ·  POST /api/reprise  corps de 1 Mio  ->  200      et elle n'agit pas ici
```

Et ce n'est pas un problème de placement — la même valeur posée dans un
`<Location /api/>` englobant le mandataire donne le même résultat :

```
<Location /api/> LimitRequestBody 1000 </Location>  ·  POST /api/reprise  1 Mio  ->  200, {"recu":1048576}
```

**Ce que cela coûte, dit exactement.** L'application, elle, borne toujours : Fastify porte
`bodyLimit: config.serveur.tailleMaxCorpsOctets` et rend **413**. Ce qui est perdu est la
**première** barrière — celle qui devait absorber un envoi surdimensionné *avant* qu'il
n'atteigne le processus Node —, et avec elle la défense en profondeur que le contrôle
**S13** demande au frontal. Sur un service dont le seul point d'entrée est ce frontal, et
qui n'a **pas encore d'authentification** (lot L3), c'est la seule chose qui se tienne
entre un client du VPN et le service.

**Ce qui l'aggrave, et qui est la vraie leçon.** `deploy/install.sh:1480-1493` compare les
deux valeurs et imprime :

```
ok LimitRequestBody (27262976) ≥ SERVEUR_TAILLE_MAX_CORPS (26214400)
```

C'est un **garde-fou dont la prémisse est fausse** : aligner deux nombres dont l'un n'a
aucun effet sur le chemin concerné ne peut pas échouer utilement. Le `CONVENTIONS.md`
§17.5 nomme exactement cette figure — *un garde-fou auquel on prête plus de portée qu'il
n'en a endort la vigilance au lieu de l'entretenir*.

**Reproduction.**

```bash
# Apache réel sur le vhost du dépôt, /api/ vers une doublure qui compte les octets
curl -sk --noproxy '*' -X POST --data-binary @corps-27Mio.bin \
     -H 'Content-Type: application/json' https://grc.exemple.interne/api/reprise
# -> 200, et la doublure a reçu 28 311 552 octets
```

**Ce qu'il faudrait, et je ne tranche pas** — c'est un arbitrage de déploiement. Trois
voies existent : borner en amont du mandataire (`mod_reqtimeout` ne borne qu'un **débit**,
pas une taille), refuser sur `Content-Length` par une règle de réécriture, ou **assumer
par écrit** que la borne de corps est applicative et corriger les deux fichiers qui
affirment le contraire. La seule chose qui n'est pas défendable est de laisser en place un
contrôle vert et deux commentaires faux. **À re-mesurer sur l'Apache de Debian 13** : j'ai
mesuré sur 2.4.58.

---

### Q-45 — 🟠 majeur — Le banc ne tourne pas sur une machine propre, et c'est la famille née du bloquant qui tombe

```
npm test  (machine telle qu'elle m'a été remise)   ->  tests 628 · pass 614 · fail 14
```

Les **14** échecs sont tous dans `test/deploiement/`, et tous portent la même cause :

```
Error: getaddrinfo ENOTFOUND grc.exemple.interne
    code: 'ENOTFOUND', hostname: 'grc.exemple.interne'
  test at test/deploiement/vhost-apache.test.mjs:507:3   (LE BLOQUANT : http → 308 → https → 200)
  test at test/deploiement/vhost-apache.test.mjs:538:3   (TOUS LES FICHIERS PUBLIÉS sont réellement servis)
  … 12 autres
```

**La cause est une ligne que personne ne pose.** `test/deploiement/vhost-apache.test.mjs:75`
porte, en commentaire :

> `/** Le nom d'hôte du vhost livré. /etc/hosts le fait pointer sur la boucle locale. */`
> `const HOTE = 'grc.exemple.interne';`

C'est une **affirmation sur l'état de la machine**, pas une action ni un contrôle. Aucun
essai ne pose cette entrée, aucun ne vérifie qu'elle existe, et `grep -rn
"exemple.interne" backend/README.md docs/ backend/deploy/install.sh` ne rend **rien** : le
prérequis n'est écrit nulle part. Le `README` §5 annonce pourtant sa liste comme close —
« Quatre, et aucun n'est facultatif » — et explique, deux lignes plus haut, que
« *une dépendance non écrite est celle qui casse sur la machine de quelqu'un d'autre* ».

**Preuve que c'est bien cela, et rien d'autre** — une ligne ajoutée, rien d'autre touché :

```
echo '127.0.0.1 grc.exemple.interne' >> /etc/hosts
npm test  ->  tests 628 · pass 628 · fail 0     (124,1 s)
```

**Pourquoi c'est un majeur et pas un mineur.** Le contrôle **S17** repose entièrement sur
cette famille : c'est elle qui monte l'Apache réel, elle qui rejoue le bloquant Q-36, elle
qui a été créée *parce que* six passages avaient conclu à tort sur un vhost jamais servi.
Sur la VM cible, sur la machine d'un exploitant, ou après un simple redémarrage de
conteneur, elle **ne s'exécute pas** — et le lecteur voit 14 rouges sans savoir s'il
regarde un produit cassé ou une machine incomplète. Le chantier a écrit la règle
lui-même, pour `psql` et pour `rsync` : *l'absence d'un outil ne doit jamais ressembler à
une propriété tenue*. `exigerOutil()` le fait pour trois binaires ; **rien ne le fait pour
le nom d'hôte**.

**Le remède est petit, et il y en a deux.** Soit un `exigerHote()` sur le modèle
d'`exigerOutil()` — qui dise la ligne à ajouter ; soit, mieux, **supprimer la dépendance** :
le banc se connecte déjà en TLS avec `servername: HOTE`, il lui suffirait de composer
`127.0.0.1` et de porter l'en-tête `Host` — c'est ce que fait `install.sh`, avec
`--resolve`, et il explique pourquoi.

---

### Q-46 — 🟠 majeur — Le quatrième annuaire : l'instrument qui mesure la conversion CSP ne voit pas un écran neuf

`backend/test/navigateur/constats-s2.test.mjs:374-386` :

> `// TOUTES les routes de l'application, et non un échantillon : ce test est`
> `// l'instrument de mesure de la conversion en cours dans js/modules/**, et un`
> `// instrument qui ne regarde que huit écrans sur vingt-huit annoncerait la fin`
> `// du travail avant l'heure. La liste est celle de js/app.js.`
> `const ecrans = [ '#/dashboard', '#/synthese', … ];   // 28 entrées, écrites à la main`

**Rien ne compare cette liste à `js/app.js`, dans aucun des deux sens.**

**Mutation — la moitié qui compte.** Dans la copie hors dépôt, j'ajoute à `js/app.js` une
route neuve portant précisément le défaut que ce balayage existe pour voir :

```js
"/zz-neuf": () => { document.getElementById("app").innerHTML =
  "<section class=\"page\"><h1>Ecran neuf</h1>" +
  "<button id=\"zz\" onclick=\"window.__inerte=true\">Enregistrer</button></section>"; },
```

```
node --test test/navigateur/constats-s2.test.mjs
  ✔ aucun ÉCRAN ne porte de gestionnaire en ligne : sinon il est inerte (10682 ms)
  ✔ LE DÉTECTEUR MORD : un gestionnaire en ligne déclenché EST vu (1655 ms)
ℹ tests 10 · pass 10 · fail 0
```

Le balayage reste vert **sans avoir visité l'écran**. Le contrôle de morsure voisin —
« LE DÉTECTEUR MORD » — ne rattrape rien : il prouve que le banc verrait un gestionnaire
*sur un écran qu'il regarde*, ce qui est l'autre question.

**Et la liste a déjà dérivé, sans que personne le voie.** `#/soa` y figure ; ce n'est pas
une route. `js/app.js` déclare `"/soa/:id"`, jamais `"/soa"`. Mesuré dans le navigateur,
contre le serveur réel :

```
routes déclarées dans js/app.js : 46 (dont 27 sans paramètre)
entrées du banc qui ne sont PAS une route : ["/soa"]
routes sans paramètre que le banc ne visite pas : []

#/soa            attendreApplication=chargee  h1=« Page introuvable »  534 caractères
#/couverture     attendreApplication=chargee  h1=« Couverture croisée »  7645 caractères
```

Le balayage inspecte donc la page 404 et la compte dans `couverture.ecrans`, dont
l'assertion (`couverture.ecrans === ecrans.length + fiches.length`) est satisfaite. Le
plancher de matière (`caracteres > 200_000`) l'est largement par les 41 autres écrans.
**Les deux réclamations de couverture sont vraies et ne voient rien.**

**Pourquoi majeur.** C'est le seul balayage transversal du produit ; la classe de défaut
qu'il garde — un gestionnaire en ligne rendu inerte par `script-src 'self'` — a rendu
l'application partiellement morte pendant tout un lot (constat M-6, 70 gestionnaires dans
25 fichiers) ; et le registre range en face **Q-16**, « les 26 modules sans filet », comme
un report acceptable. Il l'est moins qu'il n'y paraît tant que l'unique filet transversal
est aveugle aux ajouts.

**Le remède est celui que le banc applique déjà ailleurs, à trois lignes près.**
`test/aide/install.mjs` a résolu exactement ce problème pour les blocs d'`install.sh` :
`blocsAnnonces()` **découvre** la liste dans le fichier et exige **la réciproque**. La
même recette s'écrit ici : extraire les clés de l'objet passé à `Router.init(...)` — ma
sonde le fait en trois lignes — et exiger l'égalité dans les deux sens.

---

### Q-47 — 🟠 majeur — Le registre perd une ligne entière et une colonne d'état, et c'est celle qu'on ordonne de lire

`CLAUDE.md` §8 : *« Y lire la **colonne d'état**, qui distingue trois situations »*. Deux
lignes du registre ne rendent pas cette colonne.

```
colonnes de l'en-tête (6) : ['#', 'Constat', 'Gravité', 'Propriétaire', 'Échéance', 'État']

lignes du registre dont le nombre de cellules diffère de l'en-tête :
  ligne 467 : **Q-28** -> 12 cellules au lieu de 6
  ligne 481 : **Q-43** ->  7 cellules au lieu de 6

identifiants portés en PREMIÈRE cellule (42, pas 43) :
  Q-1 … Q-27, Q-28, Q-30, Q-31 …            <-- Q-29 est ABSENT
```

**Ligne 467 — `Q-29` n'a pas de ligne.** Les lignes de Q-28 et de Q-29 sont sur **un seul
retour à la ligne** : la ligne porte 13 barres verticales là où toutes les autres en
portent 7. En Markdown, les cellules au-delà de l'en-tête sont ignorées : le tableau rend
**42 lignes**, et **Q-29 n'y est pas**. Or Q-29 est le **seul 🛑 bloquant du 6ᵉ passage** —
*« le correctif de Q-27 a échangé un doublon silencieux contre une DESTRUCTION
silencieuse »* —, et son état (« ✅ corrigé — recharger PRÉSERVE une création bloquée »)
disparaît avec lui. Un agent de la vague 3 qui lit le registre conclura que ce constat
n'existe pas.

**Ligne 481 — `Q-43` rend la mauvaise colonne.** Une barre verticale non échappée vit dans
le fragment de code `` `js|css` `` ; Markdown ne protège pas les barres dans un code
littéral. La ligne se coupe en 7 cellules, tout décale d'un cran, et la colonne « État »
rend :

```
Q-43 · État rendu = « avant le 8ᵉ passage »        (c'est l'échéance)
Q-28 · État rendu = « ouvert — report daté »       (juste, par chance : la 6ᵉ cellule est la bonne)
```

**Pourquoi majeur, alors que c'est de la documentation.** Parce que c'est **Q-40 au carré,
et par le correctif de Q-40**. Q-40 disait : *« la ligne Q-28 porte 6 barres là où les
autres en portent 7 : la colonne État — celle que le `CLAUDE.md` §8 ordonne de lire — est
absente pour ce constat »*, et il a été fermé en ajoutant la cellule manquante. La cellule
a bien été ajoutée ; **personne n'a vu que la ligne continuait avec un second constat**.
Le coût annoncé était « une barre verticale » ; la barre a été posée du bon côté et la
ligne est restée cassée. Et le registre est le document dont le `PLAN_EXECUTION` §7 dit
qu'il est *la seule source* : « Ce registre n'est ni recopié ni résumé […] deux listes des
mêmes constats divergent, et la divergence est silencieuse. » Ici la divergence est entre
le registre et **lui-même** : le texte source porte 43 constats, le tableau rendu en porte
42.

**Reproduction** (le script est au §2 de ce rapport, six lignes de Python ; la version
courte) :

```bash
awk 'NR>=438 && NR<=481 {n=gsub(/\|/,"|"); if (n!=7) printf "ligne %d : %d barres  %s\n", NR, n, substr($0,1,26)}' \
    docs/PLAN_EXECUTION.md
# ligne 467 : 13 barres  | **Q-28** | **`LONGUEUR_A
# ligne 481 :  8 barres  | **Q-43** | **Une politiq
```

---

### Q-48 — 🔵 mineur — Q-4, septième signalement : le `README` décrit un banc qui n'existe plus

```
README §5   : « npm test  # 615 essais »       et le tableau des familles :
              base 272 · api 175 · reprise 77 · navigateur 53 · déploiement 38   (= 615)
mesuré      : base 272 · api 180 · reprise 77 · navigateur 53 · déploiement 46   (= 628)
```

Chaque famille jouée séparément :

```
node --test "test/base/**/*.test.mjs"         tests 272 · pass 272 · fail 0
node --test "test/api/**/*.test.mjs"          tests 180 · pass 180 · fail 0
node --test "test/reprise/**/*.test.mjs"      tests  77 · pass  77 · fail 0
node --test "test/navigateur/**/*.test.mjs"   tests  53 · pass  53 · fail 0
node --test "test/deploiement/**/*.test.mjs"  tests  46 · pass  46 · fail 0
npm test                                      tests 628 · pass 628 · fail 0
```

Le §8 porte en plus un **contrôle de fraîcheur faux** : *« la suite a été rejouée après la
fermeture du constat suivant (qui ne touche que `src/serveur.ts`) et rend toujours 615 ·
615 · 0 »*. La fermeture en question a ajouté **un fichier d'essai entier** —
`test/api/reference-incident.test.mjs`, 292 lignes — et 354 lignes à
`install-blocs.test.mjs` et `vhost-apache.test.mjs`. La parenthèse « qui ne touche que
`src/serveur.ts` » est démentie par `git diff --stat 2c7d8d3..HEAD`.

Le §5 de `PLAN_EXECUTION` dit ce qu'il faut en penser, et je m'y range : *« l'auditeur qui
trouve un chiffre faux le compte comme un constat, pas comme une coquille : un exploitant
qui vérifie une installation compare ce chiffre au réel, et faux, il ne mesure plus rien —
pire, il rassure »*.

---

### Q-49 — 🔵 mineur — La façade expose 131 membres, pas 130

`backend/README.md` §8 et `CLAUDE.md` §8 : « **130 membres** avant, 130 après ».

```
Object.keys(DataStore).length = 131          (produit chargé dans l'ordre de index.html)
typeof de chacun : function

d4aeff0 (avant la vague 2) : 131 membres
HEAD    (ab53aec)          : 131 membres
diff des deux listes triées : (vide)
```

**La propriété est vraie, et plus forte que ce que le `README` en dit** : ce n'est pas
seulement le compte qui est conservé, c'est **la liste, nom pour nom**. Seul le nombre est
faux. Je le sépare de Q-48 parce que le propriétaire n'est pas le même : ce chiffre-ci est
recopié dans **deux** documents, dont `CLAUDE.md`, qui est lu au démarrage de chaque
session.

*(Contrôle que j'ai fait avant d'écrire, et qui n'a rien donné : le « 118 méthodes
distinctes / 323 sites d'appel » du même paragraphe est juste — je mesure 118 méthodes et
321 sites sur le périmètre exact qu'il nomme, l'écart de 2 tenant à ma façon d'écarter les
commentaires. Je ne le compte pas.)*

---

### Q-50 — 🔵 mineur — Une conséquence du motif de la liste blanche que son commentaire ne décrit pas

Le commentaire du `<FilesMatch>` explique le `(?!$)` par le seul **nom vide** :

> *« seule une requête de RÉPERTOIRE produit le composant vide que `(?!$)` laisse passer »*

C'est vrai de la forme **avec** barre finale. Sans elle, le dernier composant est le nom
du répertoire, qui ne porte aucune extension publiable :

```
GET /assets      -> 403        (Apache aurait normalement redirigé 301 vers /assets/)
GET /assets/     -> 403        (correct : pas d'index, Options -Indexes)
GET /            -> 200        (correct : DirectoryIndex atteint)
```

Sans effet sur l'application livrée — aucune de ses URL n'est un répertoire, et j'ai
vérifié que les 64 fichiers publiés sont tous servis. Mais c'est une propriété du motif
que sa note ne décrit pas, et ce chantier vient de payer **deux fois** le fait qu'un motif
fasse autre chose que ce que son commentaire annonce (Q-36, puis le motif générique de
`RequestHeader unset`). Le dire coûte une phrase.

---

## 6. Ce que j'ai cherché et n'ai pas trouvé

Un rapport qui refuse doit dire où il a creusé pour rien, sans quoi le passage suivant
recreusera au même endroit.

* **Un cinquième annuaire.** J'ai balayé le banc et la configuration à la recherche
  d'autres listes écrites à la main dont l'omission réussirait en silence. Trouvé : la
  liste des blocs d'`install.sh` (**découverte**, avec réciproque — c'est le modèle) ; la
  liste des en-têtes neutralisés par le vhost (**confrontée** au code par le bloc
  « banc: entetes », et les six essais A→F sont verts, dont un qui exige qu'un **septième
  en-tête neuf non neutralisé arrête l'installation**) ; les deux listes blanches de
  publication (**comparées l'une à l'autre**, et divergentes elles arrêtent
  l'installation : mutée, 15 essais rouges) ; les neuf substitutions du vhost d'essai
  (**comptées**, et une substitution qui ne s'appliquerait plus fait échouer l'essai) ;
  les types MIME des blocs `mod_deflate` et `mod_expires` (**mesurés sur ce qu'Apache
  émet**, régresseur en place depuis Q-42). **La seule qui reste nue est celle des 28
  écrans** — c'est Q-46.

* **Un appel dans le vide dans le frontend.** Balayage mécanique : les 58 fichiers `.js`
  du produit chargés dans l'ordre d'`index.html`, les 11 objets globaux réellement
  construits, et **tout** appel `Objet.membre` confronté aux membres existants.
  **0 appel vers un membre absent.** C'était le motif « le remède rend fausse la phrase
  d'un autre fichier » appliqué au code plutôt qu'aux commentaires ; il n'a rien donné.

* **Un écran survivant du monde local.** Les fonctions de la façade que la bascule a
  vidées (`listBackups`, `restoreBackup`, `createManualBackup`, `deleteBackup`,
  `enableEncryption`) rendent des valeurs **honnêtes** — liste vide, refus explicite avec
  un message qui dit pourquoi — et l'écran Paramètres ne les propose plus : il décrit
  l'état réel (« Vos données ne sont plus stockées sur ce poste »), et affiche même un
  avertissement quand la session est provisoire. Le constat m-7 est bien fermé.

* **Un contournement de la liste blanche.** Seize formes d'URL hostiles sur des intrus que
  j'avais moi-même déposés dans la racine web (`data/registre.xlsx`, `secret.env`,
  `LISEZMOI`) : `%2E`, `%00`, double barre, `./`, `?x=.js`, `/x.js` en suffixe de chemin,
  `/index.html/../…`, et deux liens symboliques vers `/etc/passwd` sous un nom publiable
  et sous un nom interdit. **Toutes refusées** (403, sauf `%00` → 404). Et le contrôle
  symétrique : **les 64 fichiers publiés sont servis, 0 non servi**.

* **Un quatrième délai caché dans la chaîne des trois.** J'ai cru en tenir un :
  `durcissement-global.conf` pose un `Timeout 60` dont le long commentaire du vhost sur
  « la chaîne de trois » ne parle pas. **Mesuré avant d'écrire** : `ProxyTimeout 120` +
  `Timeout 60`, service qui répond en 90 s → **HTTP 200 après 90 s**. `ProxyTimeout` prime
  sur le chemin mandaté ; `Timeout` ne coupe rien. Et le vhost du dépôt coupe bien où il
  le dit : service à 70 s → **502 après 60 s**. Le constat était faux ; il n'existe pas.

* **Une régression du bloquant Q-36 par une autre porte.** `GET /`, `GET /index.html`,
  la chaîne `http → 308 → https → 200`, un répertoire avec et sans index, un répertoire
  sans barre finale : tout se comporte comme le vhost l'annonce, à la nuance du §Q-50
  près.

* **Une fuite dans les messages d'erreur.** 155 sondes hostiles au total, aucune ne rend
  un fragment SQL, un `SQLSTATE`, une pile, un nom de table ou de colonne. Le seul écho
  est celui de ma propre entrée, ce qui n'est pas une fuite.

* **Une écriture au journal d'audit par l'API.** `grep -rn "journal_audit" backend/src/`
  ne rend que **deux commentaires**, qui disent tous deux que ce lot n'y écrit pas. La
  dette est exacte et assumée.

---

## 7. Ce que je n'ai pas pu vérifier

Je distingue ce qui est **impossible ici** de ce qui est seulement **non tenté** — la
distinction est celle que le 7ᵉ passage a payée en installant Apache en une minute après
six passages de réserve écrite.

### Impossible sur cette machine

* **Debian 13 et son Apache (2.4.6x).** Tout est mesuré sur **Ubuntu 24.04 / Apache
  2.4.58**. Le comportement de `LimitRequestBody` sur un chemin mandaté (**Q-44**) doit
  être re-mesuré là-bas avant d'arrêter un remède : c'est un comportement de
  `mod_proxy_http`, pas une règle de configuration.
* **PostgreSQL 17.** La cible ; la machine porte **16.13**, et le dépôt PGDG n'est pas
  configuré (`apt-cache policy postgresql-17` ne rend aucun candidat). J'ai **tenté**, et
  c'est le seul point où j'ai renoncé faute de dépôt, pas faute d'envie. Tout le schéma —
  RLS forcée, colonnes engendrées, contraintes d'exclusion, `gen_random_uuid()` — reste
  donc validé sur 16 seulement.
* **Le TLS d'une vraie PKI.** Je peux affirmer, et c'est neuf, que **la politique de
  protocole et de suites du fichier livré fait ce qu'elle dit** : TLS 1.0 et 1.1 refusés,
  `AES128-SHA`, `AES256-SHA`, `DHE-RSA-AES128-SHA` et `ECDHE-RSA-AES128-SHA` refusées,
  `ECDHE-RSA-AES128-GCM-SHA256` acceptée, négociation réelle en `TLSv1.3 /
  TLS_AES_256_GCM_SHA384`. Ce qui reste hors de portée est la **chaîne ADCS** :
  `SSLCertificateChainFile` n'a jamais été chargé avec un vrai intermédiaire, et
  l'agrafage OCSP n'est pas configuré.
* **L'unité systemd, l'installation Debian complète, `install.sh` de bout en bout.** Ils
  exigent `root` sur une VM propre. J'ai joué trois de ses blocs (`frontend`,
  `proxytimeout`, `configtest`) par le banc et par mes propres mutations.
* **L'Active Directory (L3), ClamAV (L6), le relais SMTP (L12).** Hors périmètre du lot.
  `clamav` est installable ici (`1.5.3+dfsg` est candidat) et ne l'a pas été : il ne sert
  à rien avant L6, et l'installer sans le lot qui l'utilise ne prouverait rien.

### Non tenté, et je le dis plutôt que de le déguiser

* **Le comportement au volume réel côté navigateur.** Mes mesures de reprise sont
  serveur ; je n'ai pas rejoué le sondage sur une filiale de 12 000 enregistrements.
* **La latence du VPN.** Toutes mes mesures sont locales, et les blocs de compression et
  de cache — dont le bénéfice se compte en VPN international — ne sont mesurés qu'en
  taille, pas en temps ressenti.
* **L'export chiffré et les exports Excel/PDF** (`exportEncrypted`, `exportExcel`,
  `exportPDF`). Je me suis assuré que **le code existe, qu'il est atteignable et qu'aucun
  appel ne vise un membre absent**, et l'écran Paramètres le câble correctement. Je n'ai
  pas produit un fichier chiffré pour le relire. C'est le geste le plus proche de la
  « preuve d'audit » que ce produit doit fournir, et **aucun essai du dépôt ne le joue** :
  je le signale ici plutôt que comme constat, parce que je ne l'ai pas mesuré et qu'un
  soupçon n'est pas un constat.
* **La validation formelle du découpage Groupe/Filiale par le RSSI groupe** (risque P5,
  `PLAN_SERVEUR` §8) : toujours aucune trace dans le dépôt, toujours attendue **avant la
  mise en service pilote**. C'est le **huitième** passage de porte qui l'écrit.

### Ce que j'ai changé sur la machine, et qu'il faut savoir

Deux choses, aucune dans le dépôt :

1. `printf '127.0.0.1 grc.exemple.interne\n' >> /etc/hosts` — sans quoi 14 essais
   échouent (**Q-45**). La sauvegarde de l'état antérieur est dans mon répertoire de
   travail.
2. Un Apache d'audit monté sous `/tmp/grc-audit-apache`, sur ses propres ports
   (18080/18443), avec `a2enmod ssl proxy proxy_http headers rewrite deflate expires
   reqtimeout`. Il ne touche à aucun site activé de la machine.

`git status --porcelain` ne rend que ce rapport.

---

## 8. Ce qu'il faut faire, et quand

| # | Constat | Propriétaire | Échéance | Ce que ça coûte |
|---|---|---|---|---|
| **Q-44** | `LimitRequestBody` inopérante sur `/api/` | agent **DÉPLOIEMENT** (l'arbitrage et les deux commentaires) · agent **OUTILLAGE** (le régresseur) | **à la fermeture de cette porte** | un arbitrage écrit, deux commentaires rendus vrais, et un essai qui envoie un corps hors borne **par le mandataire** — le banc a déjà tout ce qu'il faut pour le jouer |
| **Q-45** | le banc ne tourne pas sans une entrée `/etc/hosts` non documentée | agent **OUTILLAGE** | **à la fermeture de cette porte** | soit `exigerHote()` sur le modèle d'`exigerOutil()`, soit — mieux — composer `127.0.0.1` avec l'en-tête `Host`, ce qu'`install.sh` fait déjà avec `--resolve` |
| **Q-46** | le balayage des écrans est un annuaire | agent **OUTILLAGE** | **à la fermeture de cette porte**, et **avant** que Q-16 ne soit repris en vague 3 | trois lignes : extraire les clés de `Router.init(...)`, exiger l'égalité **dans les deux sens**. La recette est dans `test/aide/install.mjs` |
| **Q-47** | le registre perd la ligne Q-29 et l'état de Q-43 | **orchestrateur** | **immédiat** | un retour à la ligne, une barre échappée — et un contrôle mécanique du tableau, sans quoi ce sera la troisième fois |
| **Q-48** | `README` §5 : 615 essais, deux familles fausses, un contrôle de fraîcheur faux | agent **DOC** | avant l'ouverture de la vague 3 | renvoyer au §8 plutôt que recopier, et re-mesurer les cinq familles |
| **Q-49** | « 130 membres » dans deux documents, dont `CLAUDE.md` | agent **DOC** | avant l'ouverture de la vague 3 | un chiffre, à deux endroits — et l'occasion de dire la propriété plus forte qui est vraie : la **liste** est identique, nom pour nom |
| **Q-50** | le commentaire du `<FilesMatch>` ne décrit pas le cas sans barre finale | agent **DÉPLOIEMENT** | avec Q-44 | une phrase |
| Q-9 / Q-20 | fond de la saturation | **lot L7** | vague 5 | report **défendable** — la borne et le refus avant prise de connexion tiennent, et mordent |
| Q-10 | analyse et validation du corps avant décision | **lot L3** | vague 3 | report **défendable**, re-mesuré, avec un oracle de schéma en plus (§3.3) |
| Q-11 | repli d'`applyImport` | agent **FRONT** | — | **refus confirmé** : la liste serait le mauvais outil, et le contrôle symétrique muet empêche le bandeau d'être un décor |
| Q-16 | les 26 modules sans filet | **vague 3** | ouverture de la vague 3 | report **défendable**, mais **plus cher que le registre ne le dit** tant que Q-46 est ouvert |
| Q-28 | `LONGUEUR_ALEA` dupliquée dans `src/reprise` | agent **API** | vague 3 | report **défendable**, rien ne casse — mais sa ligne au registre est cassée (Q-47) |

---

## 9. Ce qui est solide, et qu'il faut dire

Le lot L2 est, sur le fond, **fini**. Ce que je refuse tient dans deux commentaires faux,
une ligne de `/etc/hosts`, une liste de 28 chaînes et deux barres verticales — pas une
seule ligne du cœur.

* **Le périmètre est tenu par la forme, et cela fait quatre passages que personne ne le
  fait bouger.** 119 sondes cette fois, 0 dérive. `resoudre()` ne prend aucun argument ;
  `js/core/api.js` n'expose aucun paramètre de filiale. C'est une propriété, pas une
  vigilance.
* **Le cloisonnement tient, et s'effondre proprement quand on le casse.** 107/107 ;
  un `no force row level security` retiré → 104/107, code 3, **trois** contrôles nommés et la
  phrase « CLOISONNEMENT EN DÉFAUT » ; et le même sabotage arrête l'installateur en code 7.
* **Les garde-fous sont branchés, et le registre de `005` fait ce qu'on lui demandait :**
  une fonction supprimée ne disparaît plus en silence — le message nomme la signature
  perdue **et la date de sa dernière observation**.
* **Dix-sept mutations, dix-sept morsures.** Y compris les trois que le 7ᵉ passage avait
  trouvées vertes (Q-38), et y compris le bloquant Q-36, dont le retrait du `(?!$)` fait
  tomber sept essais sur un Apache réel.
* **Le journal d'audit est inaltérable au sens fort** : `UPDATE`, `DELETE` et `TRUNCATE`
  sont refusés **au propriétaire des tables**, pas seulement au rôle applicatif.
* **La façade synchrone est intacte au sens le plus fort qui soit** : 131 membres avant la
  vague 2, 131 après, et le `diff` des deux listes triées est vide. Le risque P3 est payé
  d'avance.
* **La chaîne complète, sous un Apache réel, est bonne** : URL d'entrée à 200, TLS 1.2/1.3
  et suites AEAD seules, en-têtes de sécurité posés jusque sur les 403, `TRACE` refusée,
  bannière muette, 64 fichiers publiés servis, 16 formes hostiles refusées,
  `LimitRequestLine` et `LimitRequestFields` qui mordent.

**Ce qu'il reste à faire est étroit — et c'est précisément pour cela qu'il faut le faire
avant d'ouvrir la vague 3.** Les trois majeurs sont tous des *instruments*, pas des
défauts de produit : une borne qui ne borne pas, un banc qui ne s'exécute pas, un
balayage qui ne balaie pas. Ce sont les instruments avec lesquels la vague 3 mesurera
l'authentification et le journal d'audit. Les livrer faux, c'est livrer à L3 les mêmes
verts trompeurs qui ont coûté sept passages à L2.

---

*Fin du rapport — SECU-S2-OCTIES, 02/09/2026.*
