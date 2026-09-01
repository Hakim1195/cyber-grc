# Porte de sécurité S2 (6ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-SEXIES**, agent indépendant. Je n'ai écrit aucune des lignes
> examinées, ni aucun des cinq rapports précédents. Travail en **lecture seule** sur le
> dépôt : le seul fichier que je crée est celui-ci, et toutes mes mutations ont vécu
> dans une copie hors dépôt.
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, révision
> examinée **`f0b4eec`** (« Le garde-fou d'entropie est tenu par six mutations — 564 verts »).
>
> Références : `docs/PLAN_EXECUTION.md` §4 (les dix-huit contrôles), §7 (journal des
> portes, registre des vingt-huit constats) ; `docs/securite/RAPPORT_S2_QUINQUIES.md` ;
> `backend/db/CONVENTIONS.md` §2 et §16 à §24 ; `backend/README.md` §8 ;
> `docs/PLAN_SERVEUR.md`.
>
> Date : 01/09/2026.

---

## 1. Le verdict

> ### ❌ **PORTE REFUSÉE** — **1 bloquant**, **3 majeurs**, **2 mineurs**. **Deux contrôles de la grille sont en échec : S17 et S18.**

Je refuse, et cette fois le motif n'est pas une chaîne de configuration : **le produit
détruit une saisie de l'utilisateur, sur le chemin qu'il lui recommande lui-même, et
annonce le succès.** C'est le contrôle S18, mot pour mot : *« les gestes réels de
l'utilisateur aboutissent, **et ne détruisent rien**. Un correctif de sécurité qui casse
une fonction n'est pas un correctif. »*

Le bloquant est **une régression du correctif Q-27**, accepté à ce passage-ci :

> Une création dont la réponse expire **sans que la requête soit jamais arrivée** était,
> avant le correctif, **rattrapée toute seule** par le sondage : mesuré, `base=1`,
> `bloques=0`, `enAttente=false` après 26 s et sans un geste. Depuis le correctif, elle
> est **bloquée pour toujours** (`base=0`, `bloques=1`), le bandeau affiche « L'opération
> a peut-être été appliquée : **rechargez la page avant de recommencer** » et propose un
> bouton **« Recharger les données »**. L'utilisateur clique. Mesuré : **écran 0, base 0,
> bandeau vide, et le message vert « Données rechargées depuis le serveur. »**
>
> La saisie a disparu de partout, et le produit annonce que tout va bien.

Le commentaire du correctif affirme précisément le contraire — *« la saisie ne bouge pas
de l'écran : bloquer n'efface rien […] Si elle disparaissait, on aurait troqué un doublon
contre une perte — c'est-à-dire la voie « recharger avant de rejouer », qui a été écartée
pour cela »* (`js/core/sync.js`, en-tête de `rejeuDangereux`). **La voie écartée est celle
que le bandeau propose au bouton.**

| # | Constat neuf | Gravité |
|---|---|---|
| **Q-29** | **Le bouton « Recharger les données » du bandeau Q-27 détruit la saisie et annonce le succès** — et le geste est celui que la phrase du bandeau demande. Régression : le même stimulus se rattrapait tout seul avant le correctif | 🔴 **bloquant** |
| **Q-30** | **Q-27 n'est fermé qu'à moitié.** Le doublon silencieux se reproduit **mot pour mot** — écran 1, base 2, `enAttente=false`, bandeau vide — quand le **frontal** rend `502` ou `504` au lieu du délai de garde du navigateur. `issueInconnue` n'est posé que dans la branche `AbortError` ; la branche « réponse non JSON venue du frontal » ne le pose pas | 🟠 majeur |
| **Q-31** | **Trois classeurs de données réelles d'un client sont livrés dans la racine web d'Apache** et servis sans aucun contrôle d'accès : registre des risques, scénarios PCA/PRA, questionnaire BoostAerospace, plus un fichier de verrou Excel portant le nom d'une personne. Aucun code ne les référence ; `install.sh` les recopie sans exclusion | 🟠 majeur |
| **Q-32** | **Q-23 est fermé en apparence.** Le détecteur de collision de `UI.genId` **n'a aucun essai** : neutralisé, le banc reste vert 43/43. Les « deux silences justes vérifiés » que le registre revendique appartiennent à **d'autres mécanismes** — c'est le motif de Q-21, un passage plus tard, dans le correctif écrit pour le fermer | 🟠 majeur |
| **Q-33** | **Trois remèdes de constats antérieurs ne sont tenus par aucun essai** : le recalage de l'adresse (N-3, dont le retrait affiche « Mesure introuvable » pour une fiche qu'on vient de créer), le vidage avant rechargement (m-6), et le contrôle d'abandon *avant* transaction (Q-19). Les trois se neutralisent sans que le banc rougisse | 🔵 mineur |
| **Q-34** | **Q-4, cinquième signalement.** `backend/README.md` et `CHANGELOG.md` ignorent la **migration `006`** et les **douze constats** Q-15 à Q-28 ; le §8 annonce « 5 migrations » quand le catalogue en porte 6, et le §5 enseigne la correction d'un commentaire en citant `005` comme le dernier cas | 🔵 mineur |

**Ce que je n'ai pas réussi à casser, et qu'il faut dire.** Le cœur serveur reste solide,
et il l'est davantage qu'au passage précédent. Quatre-vingt-une sondes hostiles n'ont fait
bouger ni le périmètre, ni une frontière de filiale, ni une requête SQL. Le cloisonnement
rend 107 contrôles au vert et **s'effondre proprement au sabotage**. Les vingt fermetures
que j'ai rejouées par mutation mordent, sauf une (Q-23). Et surtout : **l'hypothèse la plus
chargée du correctif Q-19 — « en coupant la connexion arrière, Apache fait annuler la
transaction » — est vraie**, je l'ai mesurée sous un mandataire qui reproduit
`ProxyTimeout` à l'octet près. Personne ne l'avait fait.

**Ce qu'il reste à faire est étroit** : une décision sur ce que le bouton « Recharger »
doit faire d'un enregistrement bloqué (Q-29), une ligne dans la branche non-JSON
d'`api.js` (Q-30), un `--exclude` dans `install.sh` et un `git rm` (Q-31), un essai
(Q-32).

---

## 2. Comment cette porte a été jouée

Rien de ce qui suit ne repose sur la lecture seule du code ni sur la démonstration de son
auteur. Chaque affirmation porte la commande qui la produit.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2x`**, neuve (`db/dev/preparer_base_dev.sh --base grc_audit_s2x --recreer`), recréée après chaque sabotage de schéma, plus les bases jetables ouvertes par `ouvrirBaseEssai` |
| Copie de travail | **Copie complète du produit hors du dépôt** (`…/scratchpad/s2vi/copie`), où vivent **toutes** les mutations |
| Serveur | `construireServeur()` réel, monté une trentaine de fois, en `developpement` et en `production`, par `inject()` **et** sur un vrai port (`ecouter()`) |
| Navigateur | Playwright / Chromium, les 43 essais de `test/navigateur/`, rejoués **onze fois** sous mutation |
| Sondes écrites par moi | **12 fichiers de sonde** (`scratchpad/s2vi/sondes/`) : 81 sondes hostiles, un **mandataire qui reproduit `ProxyTimeout`**, une marche complète des 27 écrans sous la CSP du vhost, des mesures de durée et de saturation |
| Mutations | **23 mutations de code** appliquées **une par une**, compilées, jouées, annulées, plus **4 sabotages de schéma** sur base vivante |

### Ce que j'ai vérifié de mon propre outillage avant d'accuser le code

C'est la règle du chantier, et elle m'a évité d'écrire trois sottises.

1. **Ma copie rend exactement ce que rend le dépôt.** Sans quoi tout écart aurait pu être
   le mien :

   ```
   dépôt : npm test → tests 564 · pass 564 · fail 0   (100,5 s)
   copie : npm test → tests 564 · pass 564 · fail 0   ( 97,2 s)
   ```

2. **Ma première mutation « le sondage qui pousse » visait la mauvaise ligne.** J'avais
   neutralisé `rechargerApresEcriture` (ligne 1566) en croyant toucher `sonder()`
   (ligne 1584). Le banc restait vert et j'ai failli en conclure que Q-21 (c) ne mordait
   pas. Rejouée au bon endroit, elle mord. **L'erreur a eu un effet utile** : elle a
   révélé que le remède du constat m-6, lui, n'est effectivement tenu par rien (Q-33).
3. **Ma première hypothèse de déclenchement de Q-29 était fausse, et je l'ai mesurée
   avant de l'écrire.** J'avais raisonné qu'une reprise à la borne bloquerait la boucle
   d'événements de Node assez longtemps pour faire expirer l'écriture d'un autre
   utilisateur. **Mesuré : faux.** Pendant une reprise de 7 954 enregistrements, quatre
   écritures ordinaires ont été servies en **6 à 17 ms**. La reprise est liée aux
   entrées-sorties, pas au processeur ; le « facteur quatre » du commentaire d'
   `entites/index.ts` porte sur le **débit**, pas sur la famine. J'ai retiré cet argument
   et j'ai cherché ailleurs le chemin d'accès à Q-29.
4. **Ma sonde S12 se trompait de propriété.** Elle comparait les corps de réponse
   caractère pour caractère, alors qu'ils réfléchissent l'URL demandée — c'est-à-dire ma
   propre entrée. Réécrite en gabarit (identifiant masqué), elle montre que « caché » et
   « absent » sont indiscernables sur `GET`, `PUT` **et** `DELETE`.
5. **Deux de mes mutations ne compilaient pas** (`TS6133` sur un import devenu inutilisé,
   `TS18047` sur un `null` non gardé) : le banc rendait alors des échecs qui n'étaient
   qu'un `tsc` en panne. Réécrites avec `void`, revérifiées, puis lues.
6. **Ma mutation de la « barrière 1 » ne sabotait rien**, et j'ai failli écrire qu'un
   essai du dépôt ne mordait pas. J'avais affaibli `aleaFort()` à mille valeurs en
   laissant `compteurSession` — or `genId` concatène **le compteur monotone** avant
   l'aléa, si bien que l'identifiant reste unique dans la page quelle que soit la qualité
   du tirage. Le banc restait vert **parce que le produit avait raison**. Rejouée en
   retirant aussi le compteur, elle rend l'essai « BARRIÈRE 1 — l'entropie : 250 créations
   d'affilée, 250 identifiants distincts » **rouge**. Ce détour a une conséquence pour le
   constat **Q-32**, et je l'y ai reportée.
7. **Un fichier de sonde oublié dans le répertoire d'essais** a fait passer un total de 43
   à 45 sur une exécution. Sans conséquence sur le verdict — les 43 essais du produit
   étaient tous là —, mais c'est la forme exacte du piège que le `README` §8 décrit :
   comparer des totaux avant de comparer les arbres.

### Contrôles d'environnement, joués avant tout le reste

```
$ pg_isready                                → /var/run/postgresql:5432 - accepting connections
$ git status --porcelain                    (vide, avant / pendant / après)
$ git log -1 --format="%H %s"
f0b4eec4da7e761014ffb0a556a98cc1118610d0 Le garde-fou d'entropie est tenu par six mutations — 564 verts

$ npm run verifier-types                    → aucune erreur
$ npm audit --omit=dev                      → found 0 vulnerabilities
$ npm audit                                 → found 0 vulnerabilities
$ npm test                                  → tests 564 · pass 564 · fail 0 (100 480 ms)

$ node db/migrate.mjs --verifier            → « garde-fous du schéma : aucune anomalie », code 0
$ psql -U grc_app -f db/verifier_cloisonnement.sql
  | contrôles | réussis | échoués |
  |       107 |     107 |       0 |     (code 0)
```

Machine : Node 22.22.2, **PostgreSQL 16.13** (la cible est 17), `psql` 16.13, Playwright
global, Chromium. **Apache est absent** — voir §7 pour ce que j'ai mis à sa place.

---

## 3. Le sort des vingt-huit constats du registre

**Je n'ai fermé aucun constat sur la foi d'un texte.** Vingt fermetures sont rejouées par
mutation ; le reste est vérifié par exécution ou par relevé du catalogue.

| # | Annoncé | Ce que j'ai joué | Verdict |
|---|---|---|---|
| **Q-1** | ✅ corrigé | `OCTETS_ALEA` ramené de 16 à **5 octets (40 bits)** dans ma copie → **5 essais rouges**, dont « le garde-fou du démarrage ne trouve rien à redire ». Point d'appel relu : `onReady` → `assurerDepot` → `verifierRegistre` → `verifierGenerateurIdentifiants` | ✅ **fermé et rejoué** |
| **Q-2** | ✅ corrigé | `identifiantDerive()` re-salée d'un `Math.random()` → le serveur **refuse de démarrer**, dix suites s'effondrent | ✅ **fermé et rejoué** |
| **Q-3** | ✅ corrigé | **Les cinq comportements neufs, mutés un par un dans ma copie.** Entropie de `UI.genId` (mille valeurs **et** compteur retiré) → rouge ; `ordonnerCreations` ré-indexée par identifiant → rouge, et sept essais tombent ; canari de doublons (`doublons.add` neutralisé) → **rouge** ; corps de `signalerRetrecissement` vidé → **rouge** ; `|| aDesModificationsEnAttente()` retiré de `sonder()` → **rouge**. **Les trois qui ne mordaient pas au 5ᵉ passage mordent tous les trois** | ✅ **fermé et rejoué** |
| **Q-4** | ✅ corrigé | Relu `README` §8 et `CHANGELOG` en entier. Les chiffres du §8 se reproduisent **exactement** contre le catalogue (48 tables, 192 politiques, 71 clés étrangères, 8 garde-fous) — sauf **« 5 migrations »**, qui en porte 6. Et **aucun des deux documents ne mentionne `006` ni un seul des constats Q-15 à Q-28** | ❌ **rouvert** — constat **Q-34** |
| **Q-5** | ✅ corrigé (`005`) | Deux sabotages sur base vivante. (a) `drop function f_verifier_couverture_rls()` + RLS retirée de `risques` → `point_appel`, **code 7**. (b) fonction **re-signée** (argument par défaut) → `point_appel`, **code 7** | ✅ **fermé et rejoué**, sur ses deux scénarios |
| **Q-6 (a)(b)(c)** | ✅ corrigés | Relevé **dans le catalogue** : `col_description('imports','cle_idempotence')` et `obj_description('uq_imports_idempotence')` portent les textes corrigés, qui citent « constat Q-6 b » et expliquent pourquoi l'index reste sans effet | ✅ **fermés** |
| **Q-7** | ✅ corrigé | `grep -rn "Math.random" backend/src/` → **aucune occurrence**. Les seuls tirages sont `randomBytes` (générateur) et `randomUUID` (identifiant de requête Fastify) | ✅ **fermé** |
| **Q-8** | ✅ corrigé | `parcourirEcarts` est bien le parcours unique à deux réglages. **Toujours aucun essai de performance** : la mesure « 3 ms au lieu de 41 » ne vit que dans un commentaire | ✅ **fermé** sur le fond ; observation §6 |
| **Q-9** | ouvert, reporté **L7** | Voir Q-20 | ✅ **report défendable** |
| **Q-10** | ouvert, reporté **L3** | Rejoué en `production` (barrière fermée) : corps de 157 o → **503 en 51 ms** ; corps de **16 Mio → 503 en 310 ms**. Le facteur 6 est payé avant toute décision, sans authentification | ✅ **report défendable** — la mesure confirme le registre, le remède (`onRequest`) est bien de L3, condition E4 |
| **Q-11** | ◐ refus argumenté | Le repli n'est atteignable que sur 404/405. Le bandeau est éprouvé **dans les deux sens** (identifiant court → il nomme la réécriture ; identifiant canonique → il se tait) | ✅ **l'argument tient** |
| **Q-12** | ✅ corrigé | `grep -rn "Vault\." js/ index.html` hors `vault.js` → une seule occurrence, `js/app.js:7 Vault.boot(...)`. L'en-tête dit exactement cela | ✅ **fermé et rejoué** |
| **Q-13** | ✅ corrigé | `grep -rn "Math.random\|randomBytes\|getRandomValues\|randomUUID" backend/src/reprise/` → **aucune**. `identifiantDeFichier` dérive et marque `-d-` | ✅ **fermé** |
| **Q-14** | ✅ corrigé (`006`) | Le seuil est en **bits** (`v_plancher constant numeric := 52`). Sabotage : `f_generer_id` remplacée par un **remplissage** de 32 signes hexadécimaux pour 20 bits réels → `identifiant_entropie_faible`, **code 7** ; générateur figé (`repeat('0',32)`) → 0,0 bit, **code 7** | ✅ **fermé et rejoué** |
| **Q-15** | ✅ corrigé | `reprendreRenommages()` retiré du `finally` de `cycle()` → l'essai dédié devient **rouge** (« après le renommage, et SANS aucun autre geste, la page revient au repos ») | ✅ **fermé et rejoué** |
| **Q-16** | ouvert, **vague 3** | Vérifié en propre : **0 fermeture capturant un identifiant** dans les 26 modules (analyse de portée sur les 26 fichiers) ; 29 navigations par `dataset.id`, 7 par `<objet>.id`, le reste étant des routes littérales. Et j'ai marché les **27 écrans** sous la CSP exacte du vhost : 0 violation, 0 erreur. Le risque décrit est réel mais **la convention est tenue partout** aujourd'hui | ✅ **report défendable**, et le protocole de la vague 3 est le bon |
| **Q-17** | ✅ corrigé (`006`) | Voir Q-14 : la mesure est en bits, position par position, et elle voit le remplissage. Sabotages : 20 bits → refus ; 0 bit → refus | ✅ **fermé et rejoué** |
| **Q-18** | ✅ corrigé (`006`) | Relevé **dans le catalogue** : `obj_description` du domaine `id_metier` porte le texte corrigé, dit que le format n'est **pas** une contrainte du domaine, et déclare explicitement la justification par le round-trip « fausse ET VÉRIFIÉE FAUSSE » | ✅ **fermé et rejoué** |
| **Q-19** | ✅ corrigé | Trois mutations. (a) borne de volume portée à 900 000 → **7 essais rouges** ; (b) borne anticipée de la route neutralisée → rouge (« POOL SATURÉ : un fichier hors borne reçoit 413 ») ; (c) `if (abandonne()) throw new AbandonClient()` retiré → rouge (« ABANDON en cours de reprise : ZÉRO ligne écrite »). Et **l'hypothèse du vhost est mesurée vraie** : voir §4 S17 | ✅ **fermé et rejoué** — réserve : le contrôle *avant transaction* ne mord pas (**Q-33**) |
| **Q-20** | ✅ corrigé | `try/catch` autour de `pool.connect()` retiré → rouge. Et rejoué en vrai : **dix reprises simultanées, cinq lectures ordinaires → 0 en 500, 3 en 503 (≈5 s), 2 en 200**. Le 500 « erreur interne » du 5ᵉ passage a disparu | ✅ **fermé et rejoué** ; le fond reste à **L7**, et le report est désormais défendable |
| **Q-21** | ✅ corrigé | Les trois mutations du 5ᵉ passage, rejouées : canari (`doublons.add` neutralisé) → **rouge** ; rétrécissement (corps de `signalerRetrecissement` vidé) → **rouge** ; sondage qui pousse (`|| aDesModificationsEnAttente()` retiré de `sonder()`) → **rouge** | ✅ **fermé et rejoué**, sur ses trois branches |
| **Q-22** | ✅ corrigé | Les trois renvois relus. `CONVENTIONS.md` §2 attribue désormais le manque à **Q-23** et non à Q-3 ; le §22 E5 et l'encadré d'arbitrage du `PLAN_EXECUTION` §7 portent la mention « déjà dépassé par les faits » ; Q-15 est cité hors registre | ✅ **fermé** |
| **Q-23** | ✅ corrigé | Détecteur neutralisé (`if (identifiantsEmis.has(id))` → `if (false)`) : **banc vert 43/43**. `grep -rn "Q-23\|signalerGenerateurDouble\|identifiantsEmis\|Défaut interne du générateur" test/` → **rien** | ❌ **fermé en apparence** — constat **Q-32** |
| **Q-24** | ✅ corrigé | Bandeau `champsRefuses` neutralisé → **rouge** (« le bandeau nomme la collection et le champ écartés ») | ✅ **fermé et rejoué** |
| **Q-25** | ✅ corrigé | `rechargeable: false` du refus de droit passé à `true` → **rouge** (« REFUS DE DROIT : la valeur du serveur revient, le bandeau parle, PAS de bouton ») | ✅ **fermé et rejoué** |
| **Q-26** | ✅ corrigé | Voir Q-1 : `mesurerBitsParPosition` est en bits, et le contrôle de justesse (128,08 bits, retrouvés par le calcul) est éprouvé. Le générateur est **paramétrable** pour que le garde-fou soit interrogeable dans le sens où il parle | ✅ **fermé et rejoué** |
| **Q-27** | ✅ corrigé | L'essai du dépôt mord. Mais le correctif **ouvre une destruction** (**Q-29**) et **ne couvre pas** la moitié frontale du même défaut (**Q-30**) | ❌ **fermé sur son cas, rouvert sur deux autres** |
| **Q-28** | ouvert, **vague 3** | Vérifié : `src/reprise/index.ts:587` porte bien `toString(36).padStart(25, '0')` en dur. C'est une **dérivation**, elle ne tire rien, et le module reste pur. Rien ne casse | ✅ **report défendable** |

**Décompte** : 22 fermés et rejoués · 4 reports défendables (Q-9/Q-20 vers L7, Q-10 vers
L3, Q-16 et Q-28 vers la vague 3) · 1 refus argumenté qui tient (Q-11) · **2 rouverts**
(Q-4 → Q-34, Q-23 → Q-32) · **1 fermé sur son cas mais percé sur deux autres** (Q-27 →
Q-29 et Q-30).

---

## 4. La grille §4, contrôle par contrôle

| # | Verdict | Ce que j'ai exécuté, et ce que cela a rendu |
|---|---|---|
| **S1** | ✅ | `db/verifier_cloisonnement.sql` sous **`grc_app`** : **107 contrôles, 107 réussis, 0 échec, code 0**. **Sabotage sur base vivante** : `alter table risques no force row level security` → la démonstration tombe à **104/107** avec trois échecs nommés (C27 « tables sans RLS active et forcée », C28, C84) et **code 3** ; le même sabotage fait sortir `migrate.mjs --verifier` en **code 7** (`couverture_rls : risques : force_absente`). Catalogue relevé : 48 tables, **0 sans RLS activée, 0 sans RLS forcée**, 192 politiques. |
| **S2** | ✅ | **81 sondes écrites par moi.** Dix-huit formes d'entête (`x-filiale`, `grc-filiale`, `x-perimetre`, `x-administration-groupe`, `x-forwarded-user`, `x-original-url`, `authorization`, un cookie composite `grc.filiale_id=…; cyber-context=…`…), six paramètres d'URL, quatre enveloppes de corps, plus 18 entrées hostiles sur le seul paramètre du produit (`/api/rafraichir?depuis=`). **Aucune ne fait bouger le périmètre.** `filiale_id` dans `champs` est **refusé et nommé** ; `portee: 'groupe'` depuis une filiale → **403** nommé. La propriété reste tenue par la **forme** : `resoudre()` ne prend aucun argument, `js/core/api.js` n'expose aucun paramètre de filiale. |
| **S3** | ⬜ sans objet | Journal d'audit : **lot L5**. Rejoué quand même : l'API **n'y écrit jamais** (2 lignes avant, 2 après une création et une lecture) ; sous `grc_app`, `update`/`delete`/`truncate` → `42501` ; **sous le propriétaire**, les trois rendent **`GRC01` « Table journal_audit en ajout seul »**. La réserve C22 (lecture non cloisonnée) reste écrite dans la démonstration et livrable ferme de L5 (§22 E6). |
| **S4** | ✅ | `version` est **structurelle** : `{champs:{version:99}}` → « Le champ « version » n'appartient pas à l'entité « risques » ». Idem `cree_le`, `cree_par`, `modifie_par`, `filiale_id`, `portee_groupe` — **refusés et nommés, jamais ignorés** ; `id` reçoit son message dédié. Deux navigateurs sur la même fiche : le second reçoit `GRC03` et garde sa saisie (essai du banc, rejoué). |
| **S5** | ✅ | Onze noms d'entité hostiles (`risques"; drop table risques; --`, `risques' `, `pg_class`, `__proto__`, `constructor`, `../risques`…), douze noms de champ (avec guillemet, apostrophe, `);drop`), 18 valeurs sur `?depuis=` (`'; select pg_sleep(5); --`, `infinity`, `now()`, 5 000 signes). **Aucune fuite** : ni SQL, ni nom de table, ni `SQLSTATE`, ni pile. `({}).pollue === undefined` après les sondes de prototype. |
| **S6** | ⬜ sans objet (L3) — **barrière provisoire vérifiée** | En `production` : `/api/session`, `/api/donnees`, `/api/modele` → **503** ; `/api/sante` → 200. **Sabotage** : une route `GET /api/annuaire-sonde` ajoutée sans barrière → l'essai de complétude **la nomme** et devient rouge. C'est le garde-fou dont la vague 3 aura besoin, et il fonctionne. |
| **S7** | ⬜ sans objet | Droit d'export distinct : **lot L3** (§3.3). |
| **S8** | ⚠️ **passé avec réserve** | Balayage du dépôt suivi (clés privées, mots de passe, jetons, `AKIA…`, `xox…`) : **aucun secret**. Le seul `.env` versionné est `.env.example`. Le mot de passe `dev` est gardé par un refus sous `NODE_ENV=production`. **La réserve n'est pas un secret, c'est de la donnée client** : `cyber-gouvernance_V4/data/` porte trois classeurs réels et un fichier de verrou nommant une personne — voir **Q-31**. |
| **S9** | ⬜ sans objet | Pièces jointes : **lot L6**. |
| **S10** | ✅ | `x-content-type-options: nosniff` **et** `cache-control: no-store` sur **huit** réponses d'API — succès (200) comme échecs (400, 404) et route inconnue. CSP du vhost **lue dans le fichier livré** et appliquée à un Chromium réel : `script-src 'self'` sans `unsafe-inline` ni `unsafe-eval`. **Zéro gestionnaire en ligne** dans l'intégralité des fichiers livrés (balayage de tous les `.js` et `.html`, commentaires exclus). |
| **S11** | ⬜ sans objet | Limitation de rythme : **lot L3**, condition E4. |
| **S12** | ✅ | « Caché » et « absent » rendent une réponse **identique au gabarit près** sur `GET`, `PUT` et `DELETE` (404 / `ressource_inconnue` / même phrase). Le 503 de saturation ne nomme **ni pool, ni connexion, ni PostgreSQL**, et dit quoi faire (« réessayez »). Six sondes d'erreur : aucune pile, aucun nom de table, aucun `SQLSTATE`. |
| **S13** | ✅ | Toutes les bornes mordent, mesurées une par une : `nom` de 200 001 signes → **400** nommé (199 000 passe : la borne est exacte) ; 91 champs → **400** (« maximum 80 ») ; corps de 27 Mio → **413** ; **11 188 enregistrements de reprise → 413 en 168 ms**, message donnant le reçu, l'admis et la plus grosse collection. Le pool est borné, et sa saturation se rend désormais en **503** (Q-20). La réserve du 5ᵉ passage — « aucun délai ne borne la durée totale » — est **levée par la borne de volume** : une reprise à 7 990 enregistrements a été mesurée à **18,6 s** (2,32 ms/enr.), bien en deçà des 60 s de la chaîne. |
| **S14** | ✅ | Reprise en une transaction, rejouée sous mandataire coupant : **1 exigence avant, 1 après, stable à t+32 s**. Un fichier dont un enregistrement est refusé ne modifie rien ; l'aperçu applique puis annule. |
| **S15** | ✅ | `npm audit --omit=dev` → **0 vulnérabilité** ; `npm audit` complet → 0. Deux dépendances d'exécution seulement (`fastify`, `pg`), épinglées par `package-lock.json`. |
| **S16** | ✅ | Cinq garde-fous éprouvés **par leur débranchement**, jamais par leur lecture. (a) `f_verifier_schema()` : disparition d'un contrôle → **code 7** ; re-signature → **code 7**. (b) couverture RLS retirée → **code 7**. (c) entropie SQL affaiblie (remplissage, générateur figé) → **code 7**. (d) `verifierGenerateurIdentifiants` : entropie TypeScript à 40 bits → le service **ne démarre pas**. (e) complétude des routes : route neuve → l'essai la nomme. Registre `controles_schema` relevé : **8 garde-fous consignés, 0 anomalie**. |
| **S17** | ❌ **EN ÉCHEC** | **La moitié que ce passage devait éprouver est bonne.** J'ai monté un mandataire qui reproduit `ProxyTimeout` d'Apache — il détruit la connexion arrière au bout du délai et rend 502 au client, comme `mod_proxy` — et lancé une reprise de 7 193 enregistrements coupée à 1 200 ms : le client reçoit **502**, et la base reste à **1 exigence pendant 32 s**. *« Apache fait annuler la transaction par le serveur »* est donc **vrai, mesuré**, et le commentaire du vhost dit désormais la vérité. **Mais deux défauts nouveaux ne vivent que dans la configuration livrée**, et aucun essai du dépôt ne peut les voir : le **502/504 du frontal** rejoué en doublon silencieux (**Q-30**), et la **racine web qui sert des classeurs de données réelles** (**Q-31**). C'est la définition même de ce contrôle. |
| **S18** | ❌ **EN ÉCHEC** | Le geste nominal aboutit — création par le formulaire réel, adresse recalée sur l'identifiant du serveur, fiche relue après ré-affichage et après F5, 27 écrans sans une erreur. **Mais un geste réel détruit une saisie** : bandeau « rechargez la page avant de recommencer » → clic sur « Recharger les données » → **écran 0, base 0, message de succès** (**Q-29**). Et le même geste, dans l'autre moitié du cas, fabrique un doublon en silence (**Q-30**). |

**Décompte** : **11 passés · 1 passé avec réserve (S8) · 4 sans objet · 2 en échec (S17, S18)**.

---

## 5. Les constats neufs

La série continue après Q-28.

### Q-29 — 🔴 **BLOQUANT** — Le bouton que le correctif Q-27 met sous les yeux de l'utilisateur détruit sa saisie, et annonce le succès

**Le mécanisme, en quatre fichiers dont aucun n'a tort seul.**

* `cyber-gouvernance_V4/js/core/api.js:131` — `issueInconnue: expire && modifie`. Le
  drapeau est posé sur **toute** expiration d'une méthode non-`GET`. Il ne distingue pas
  — et **ne peut pas** distinguer — deux réalités disjointes :
  * (a) le serveur a reçu et **validé** : la réponse s'est perdue ;
  * (b) la requête **n'est jamais arrivée** : elle a stagné dans le réseau jusqu'au
    délai de garde de 30 s.
* `js/core/sync.js:1406` — `rejeuDangereux()` : sur une **création** portant ce drapeau,
  le rejeu automatique est refusé.
* `js/core/sync.js:1412` — l'enregistrement est **bloqué**, avec un incident de type
  `incertain` et `rechargeable: true`.
* `js/core/sync.js:1735` — le bandeau affiche alors le bouton **« Recharger les
  données »**, qui appelle `rechargerApresEcriture()` → `recharger()` →
  `source.remplacer(neuf)`.

**Ce que l'utilisateur lit, mot pour mot** (relevé par la sonde) :

```
1 modification(s) non enregistrée(s).
Enregistrement incertain — Risque « Saisie SONDE jamais partie » :
Le serveur n'a pas répondu dans le délai imparti. L'opération a peut-être été appliquée :
rechargez la page avant de recommencer.
[Recharger les données]  [×]
```

**Ce qui se passe quand il fait ce qu'on lui dit** — cas (b), le serveur n'a rien validé :

```
AVANT  ecran=1 base=0 bouton=true
APRES  ecran=0 base=0 toast_succes=true bandeau=""
VERDICT: la saisie a DISPARU DE PARTOUT
```

Le message vert affiché est **« Données rechargées depuis le serveur. »**

**Le contrôle symétrique, joué dans la même sonde** — cas (a), le serveur avait validé :

```
AVANT  ecran=1 base=1 bouton=true
APRES  ecran=1 base=1 toast_succes=true
VERDICT: la saisie a survécu
```

Le remède est donc **juste pour (a) et destructeur pour (b)**, et rien ne les sépare.

**Et c'est une régression.** Même stimulus, comparaison A/B du produit avec et sans
`rejeuDangereux`, sans aucun geste de l'utilisateur pendant 26 s :

```
A) code ACTUEL      : base=0  bloques=1  enAttente=true   → « toujours en rade »
B) code ANTÉRIEUR   : base=1  bloques=0  enAttente=false  → « ARRIVÉE TOUTE SEULE »
```

Avant le correctif, le cas (b) **se rattrapait tout seul**. Depuis, il est bloqué, et le
seul geste que le produit propose l'efface. Le correctif a échangé un doublon silencieux
(cas a) contre une **destruction silencieuse** (cas b) — et le commentaire de
`rejeuDangereux` affirme l'inverse : *« Si elle disparaissait, on aurait troqué un doublon
contre une perte — c'est-à-dire la voie « recharger avant de rejouer », qui a été écartée
pour cela. »*

**Pourquoi (b) n'est pas un cas de laboratoire.** Le déploiement est **VPN uniquement**,
avec des filiales « en France et à l'étranger ». Une stagnation TCP de 30 s sans
réinitialisation — renégociation de tunnel, bascule de concentrateur, saturation d'Apache
qui laisse la connexion dans la file d'écoute — produit exactement un `AbortError` sur une
requête jamais servie. Le navigateur ne peut pas savoir ; c'est là tout le problème.
J'ai par ailleurs **testé et écarté** une hypothèse plus commode : la reprise à la borne
**ne bloque pas** la boucle d'événements (voir §2, point 3).

**Pourquoi je le classe bloquant.** Il détruit une donnée de gouvernance saisie par un
utilisateur, dans un outil qui sert de preuve en audit ISO 27001 ; il le fait **sur le
geste que le produit recommande** ; il l'annonce comme un succès ; et c'est une
**régression** introduite par un correctif soumis à cette porte. Les trois bloquants du
premier passage de S2 étaient de cette famille exacte.

**Deux voies de sortie, et le choix appartient à l'agent FRONT, pas à moi.**
(1) Faire du bouton un geste **non destructeur** pour ce qui est bloqué : `recharger()`
préserve les enregistrements de `bloques` absents du serveur, et le bandeau dit ce qui a
été conservé. (2) Ou bien avertir avant : une confirmation nommant l'enregistrement et
disant qu'il sera perdu s'il n'est pas côté serveur. Ce qui n'est pas tenable, c'est
d'écrire « rechargez » à côté d'un bouton qui efface.

**Reproduction** : `scratchpad/s2vi/sondes/sonde-secu.test.mjs` (les deux cas) et
`sonde-avant.test.mjs` (la comparaison A/B), à copier dans `backend/test/navigateur/`.

---

### Q-30 — 🟠 majeur — Q-27 n'est fermé qu'à moitié : un 502/504 du frontal rejoue la création

`js/core/api.js:62` :

```js
estPassagere() { return this.reseau || this.statut === 503 || this.statut === 502 || this.statut === 504; }
```

`js/core/api.js:152-157` — la branche « réponse non JSON », dont le commentaire dit
lui-même *« Une réponse non JSON vient du **frontal**, pas de l'application »* :

```js
if (!charge || typeof charge !== "object") {
    throw new ErreurApi({
        statut: reponse.status,
        code: reponse.status >= 500 ? "indisponible" : "erreur_interne",
        message: "Le serveur a refusé la demande (code " + reponse.status + ")."
    });
}
```

**`issueInconnue` n'y est pas posé.** Or c'est précisément la branche où le navigateur
*sait* que la requête est partie et *ignore* ce qu'elle a produit. Conséquence mesurée,
avec la classe d'erreur du produit et les champs exacts que cette branche construit :

```
502 : écran=1  BASE=2  bloques=0  enAttente=false  bandeau=VIDE
      VERDICT : DOUBLON SILENCIEUX (2 lignes)
504 : écran=1  BASE=2  bloques=0  enAttente=false  bandeau=VIDE
      VERDICT : DOUBLON SILENCIEUX (2 lignes)
```

C'est **le constat Q-27 mot pour mot** — *« écran 1, base 2, `enAttente=false`, bandeau
vide — le produit annonce que tout est enregistré »* — par une autre porte.

**La justification du correctif est réfutée par la mesure.** L'en-tête du bloc
« expiration » de `api.js` écrit : *« Le discriminant est la **MÉTHODE**, pas la route […]
Une route non idempotente ajoutée demain hérite donc du bon défaut sans que personne ait à
y penser — **tenu par la forme, pas par la discipline**. »* Le discriminant n'est appliqué
que dans le `catch` de `fetch`. Le chemin par **statut HTTP**, lui, ne le connaît pas : il
n'est tenu ni par la forme ni par la discipline.

**Reachabilité.** `502` est rendu par Apache dès que la connexion arrière échoue —
redémarrage du service pendant une livraison (`Restart=on-failure`, `TimeoutStopSec=30s`),
sortie sur `uncaughtException`, réinitialisation TCP — y compris **après** que la
transaction a été validée et pendant l'écriture de la réponse. Contrairement à
`POST /api/reprise`, les routes d'écriture d'entité **n'ont aucun `surveillerAbandon`** :
le serveur va au bout et valide. Un mandataire intermédiaire ou le concentrateur VPN
peuvent aussi rendre 502/503/504.

**Le remède est d'une ligne**, dans la branche qui identifie déjà le cas : poser
`issueInconnue` quand la réponse ne vient pas de l'application (corps non JSON) **et** que
la méthode modifie. Une réponse **JSON** portant `erreur: "indisponible"` vient, elle, de
l'application — saturation du pool, environnement fermé — et n'a rien écrit : elle doit
continuer de se rejouer. Le discriminant existe déjà dans le code, il n'est pas employé.

**Reproduction** : `scratchpad/s2vi/sondes/sonde-502.test.mjs`.

---

### Q-31 — 🟠 majeur — Trois classeurs de données réelles d'un client sont livrés dans la racine web d'Apache

`backend/deploy/install.sh:456` :

```bash
rsync -a --delete "$DEPOT/cyber-gouvernance_V4/" "$RACINE/frontend/"
```

**Aucune exclusion** — contrairement au `rsync` du backend juste au-dessus, qui exclut
`db/dev/`, `test/`, `.env` et `var/`. Et `backend/deploy/apache/cyber-grc.conf:78` pose
`DocumentRoot /opt/cyber-grc/frontend` avec `Require all granted`.

Ce que le dépôt fait donc atterrir dans la racine web, vérifié en rejouant la copie :

```
/opt/cyber-grc/frontend/data/1.Risques informatiques 2024.xlsx                       (503 Ko)
/opt/cyber-grc/frontend/data/Import risques.xlsx                                      (23 Ko)
/opt/cyber-grc/frontend/data/requirements_formatted_boostaerospace_impersonnel.xlsx   (13 Ko)
/opt/cyber-grc/frontend/data/~$1.Risques informatiques 2024.xlsx                      (165 o)
```

Confrontés aux deux blocs d'interdiction du vhost — `<FilesMatch "(^\.|\.(env|sql|ts|json|
md|log|bak|orig|sh|service|conf)$)">` et `<DirectoryMatch "/(\.git|node_modules|db|deploy|
src|test)/">` — **les quatre sont SERVIS** : ni `.xlsx` ni `data/` n'y figurent.

**Ce que ces fichiers contiennent** (inspection du contenu, pas du nom) :

* `1.Risques informatiques 2024.xlsx` — 685 chaînes : scénarios de sinistre, **« PCA »**,
  « Installation », « Description du scénario retenu et vulnérabilités identifiées »,
  « Moyens de prévention/protection existants », « Stratégies de continuité identifiées »,
  « Motif Criticité » : c'est **une analyse de risques et un plan de continuité réels** ;
* `Import risques.xlsx` — un registre de risques renseigné (« Panne du fournisseur
  électrique », « Pas d'analyse de log régulièrement », « Pas de maintenance préventive »…),
  c'est-à-dire **des vulnérabilités nommées** ;
* `requirements_formatted_boostaerospace_impersonnel.xlsx` — exigences client avec statuts
  « Conforme » / « Non conforme » et responsables ;
* `~$1.Risques informatiques 2024.xlsx` — fichier de **verrou Excel**, qui porte en clair
  le nom de la personne ayant ouvert le classeur.

**Aucun code de l'application ne les référence** : `grep` sur `js/`, `index.html` et
`css/` ne rend aucune occurrence de `data/` hors du répertoire `js/data/` (les
référentiels). Ce sont des **matériaux sources oubliés**, versionnés depuis
`26ebba6`.

**Pourquoi c'est majeur, et pas un simple oubli de ménage.** (1) Ils sont servis
**sans aucune authentification**, y compris après le lot L3 : la SPA est statique, Apache
la délivre à quiconque atteint le vhost, et l'écran de connexion de L3 vivra *dans* la
page, pas devant elle. (2) Dans un produit dont la promesse centrale est le
**cloisonnement strict par filiale**, un utilisateur de n'importe quelle filiale
télécharge le registre de risques et le PCA d'une autre par une URL devinable. (3) Le
`CLAUDE.md` §5 pose « Pas de données de démo pré-chargées (interdit par le brief) » ; ici
il ne s'agit même pas de démonstration, mais de documents réels. (4) Le `PLAN_SERVEUR`
§1.6 exige que les pièces jointes vivent **hors de l'arborescence web** et ne soient
délivrées qu'après contrôle de droits — ces quatre fichiers sont exactement ce que cette
règle interdit, arrivés par une autre porte.

**Le remède est court et il a trois moitiés** : retirer `cyber-gouvernance_V4/data/` du
dépôt ; ajouter `--exclude 'data/'` au `rsync` du frontend (ou, mieux, une liste blanche
de ce qui est publié) ; et compléter le `<FilesMatch>` du vhost, dont l'existence même
montre que l'intention était là.

**Reproduction** :

```bash
python3 -c "
import zipfile,re
z=zipfile.ZipFile('cyber-gouvernance_V4/data/1.Risques informatiques 2024.xlsx')
s=z.read('xl/sharedStrings.xml').decode('utf-8','replace')
print(re.findall(r'<t[^>]*>(.*?)</t>',s,re.S)[:12])"
strings 'cyber-gouvernance_V4/data/~$1.Risques informatiques 2024.xlsx'
```

---

### Q-32 — 🟠 majeur — Q-23 est fermé en apparence : son détecteur n'a aucun essai

Le registre porte : *« Q-23 ✅ corrigé — détecteur de collision en session, **deux
silences justes vérifiés** »*. Le détecteur existe (`js/core/ui.js:256`), il est bien
écrit, et son en-tête explique proprement pourquoi il a été préféré à une mesure
d'entropie. **Mais rien ne l'éprouve.**

Mutation, une ligne, dans ma copie :

```js
if (identifiantsEmis.has(id)) {     →     if (false) {
```

```
[q23] résultat : tests 43 · pass 43 · fail 0
```

Balayage du banc :

```
$ grep -rn "Q-23\|signalerGenerateurDouble\|identifiantsEmis\|Défaut interne du générateur" backend/test/
(rien)
```

**Et les « deux silences justes vérifiés » appartiennent à d'autres mécanismes.** Les deux
appels d'`exigerSilence` que l'on pourrait croire attachés au détecteur sont :

* `test/navigateur/bascule.test.mjs:790` — `exigerSilence(bandeau, /double/i, 'LE CANARI
  PARLE …')` : c'est le **canari de `calculerDifferentiel`**, pas le détecteur ;
* `test/navigateur/bascule.test.mjs:878` — `exigerSilence(bandeau, /défaut interne/i, 'le
  filet PARLE encore sur ses deux canaux')` : le motif `/défaut interne/i` correspond à
  **deux** messages du produit, celui de `signalerRetrecissement` (`sync.js:1216-1218`) et
  celui du détecteur (`sync.js:1779`). Le troisième argument nomme l'essai qui fait parler
  le **premier**. Et cet appel vit dans « BARRIÈRE 2 — générateur SABOTÉ à trois valeurs »,
  où `UI.genId` est **remplacé en entier** : le détecteur y est hors de portée, ce que
  l'en-tête du code dit lui-même.

C'est le motif de **Q-21**, un passage plus tard, dans le correctif écrit pour fermer un
constat qui portait déjà sur un garde-fou absent. Et il révèle une limite du remède
inventé au 5ᵉ passage : **`exigerSilence` oblige à *nommer* un essai, mais rien ne
rattache ce nom au mécanisme** — deux mécanismes dont les messages satisfont la même
expression régulière sont indiscernables pour lui.

**Et il y a pire que l'absence d'essai — le détecteur ne peut presque pas se déclencher.**
Je l'ai découvert en me trompant de mutation (§2, point 6). `genId` s'écrit :

```js
compteurSession += 1;
var id = (prefix || "ID") + "-" + Date.now() + "-" + compteurSession.toString(36) + aleaFort();
```

Le **compteur monotone** est concaténé avant l'aléa : deux identifiants d'une même page ne
peuvent pas être égaux, **quelle que soit la qualité du tirage**. J'ai ramené `aleaFort()`
à mille valeurs, et non seulement le détecteur ne dit rien, mais l'essai « BARRIÈRE 1 »
lui-même reste vert — le produit avait raison. Il faut retirer *aussi* le compteur pour
qu'une collision existe.

L'en-tête du détecteur le dit d'ailleurs en toutes lettres : *« ce qu'il faut garantir est
l'unicité DANS LA SESSION, et elle est portée par le compteur monotone, pas par le
hasard »*. La conséquence n'y est pas tirée : **le détecteur surveille une propriété qu'un
autre mécanisme rend structurellement vraie.** Il ne parlera qu'à un rechargement du
compteur ou à un recul de l'horloge. C'est très exactement la famille que Q-17 et Q-26
viennent de nommer — *« un contrôle sans pouvoir de détection qui rend une fausse
assurance »* —, cette fois dans le remède écrit pour combler l'absence de garde-fou du
navigateur.

**Portée réelle, pour ne pas le gonfler.** Le détecteur ne protège rien : il *signale*, et
les deux barrières (indexation par rang, identifiant réattribué par le serveur) tiennent —
je les ai vues mordre toutes les deux. Ce qui est faux est le **verdict du registre** : ce
constat n'est pas fermé, il est écrit ; et ce qui est écrit ne peut pratiquement pas
s'exécuter.

**Deux remèdes possibles, et le choix appartient à l'agent FRONT.** Soit assumer que le
compteur *est* le garde-fou, le dire, et retirer un détecteur qui ne servira jamais — un
garde-fou mort est ce que ce chantier appelle un commentaire. Soit le garder et l'éprouver
pour de bon : remplacer `genId` par un générateur à une valeur, créer deux
enregistrements, exiger que le bandeau porte « Défaut interne du générateur
d'identifiants » et que `console.error` ait parlé — c'est-à-dire l'interroger **dans le
sens où il parle**. Ce qui n'est pas tenable, c'est le troisième état actuel : ni éprouvé,
ni déclenchable, et déclaré vérifié.

**Reproduction** : mutation d'une ligne, journal dans `scratchpad/s2vi/mut-q23.txt`.

---

### Q-33 — 🔵 mineur — Trois remèdes de constats antérieurs ne sont tenus par aucun essai

Trois mutations d'une ligne, chacune appliquée seule, chacune laissant le banc **vert
43/43** (ou 172/172 côté API).

| Remède | Constat d'origine | Mutation | Banc | Conséquence mesurée |
|---|---|---|---|---|
| `history.replaceState(…)` — recalage de l'**adresse** après renommage (`sync.js:546`) | **N-3** | ligne neutralisée | vert 43/43 | **« Mesure introuvable — Cette mesure n'existe pas ou a été supprimée »** pour une mesure créée dix secondes plus tôt, au premier ré-affichage **et après F5** |
| Vidage de la file **avant** rechargement (`rechargerApresEcriture`, `sync.js:1565`) | **m-6** | `if (aDes…()) await cycle();` retiré | vert 43/43 | `recharger()` remplace le jeu de données entier ; les saisies en attente sur d'autres fiches sont perdues sans un mot (le commentaire du code l'annonce : *« sans quoi le rechargement emporterait les saisies faites sur d'autres fiches »*) |
| Contrôle d'abandon **avant transaction** (`api/index.ts`, `if (abandonne()) signalerAbandon('avant transaction')`) | **Q-19 / Q-20** | ligne neutralisée | vert 172/172 | Une reprise complète est exécutée pour un client déjà parti — le gaspillage que Q-20 reproche, l'intégrité restant tenue par le contrôle avant validation |

Le premier est le plus instructif, et il complète l'observation §6 du rapport
*quinquies* : celui-ci avait mesuré que **la réécriture d'attributs** de
`recalerBalisage` se retire sans rougir, mais que le retrait **complet** de la fonction
mord (je l'ai rejoué : rouge sur « le geste complet — créer, voir, sélectionner, supprimer
— aboutit VRAIMENT (S18) »). Le recalage de l'**adresse** est une **troisième** moitié,
distincte des deux, et son retrait produit un écran qui affirme à l'utilisateur que son
enregistrement n'existe pas.

Je les classe mineurs parce que **le produit est juste aujourd'hui** : c'est la couverture
qui manque, pas le comportement. Mais c'est la famille de constat que ce chantier paie le
plus cher, et le premier tombe pile dans le périmètre du filet de la vague 3 (**Q-16**) :
il devrait y être ajouté nommément.

**Reproduction** : `scratchpad/s2vi/mut-adresse.txt`, `mut-m6.txt`, `mut-q19c.txt` ;
conséquence du premier mesurée par `sondes/sonde-fiche.test.mjs`.

---

### Q-34 — 🔵 mineur — Q-4, cinquième signalement : la documentation ignore la migration `006` et douze constats

`backend/README.md` §8 et `CHANGELOG.md` nomment honnêtement leur point de mesure
(`fef2db3`, 534 essais) — c'est la bonne pratique, et j'ai vérifié qu'elle tient : **tous
les chiffres du §8 se reproduisent exactement** contre le catalogue de `grc_audit_s2x`.

```
migrations appliquées : 6      README annonce : 5      ← FAUX
tables (public)       : 48     README annonce : 48     ✓
politiques RLS        : 192    README annonce : 192    ✓
clés étrangères       : 71     README annonce : 71     ✓
sans RLS activée / forcée : 0 / 0                      ✓
garde-fous consignés  : 8      README annonce : 8      ✓
```

Ce qui n'est pas couvert par la discipline du point de mesure :

1. **`006_entropie_et_commentaires.sql` n'existe dans aucun des deux documents**
   (`grep "006" backend/README.md CHANGELOG.md` → rien). C'est une migration **appliquée**,
   qui réécrit `f_verifier_entropie_identifiants`, `f_verifier_privileges` et le
   commentaire du domaine `id_metier`.
2. **Le §5 du `README` enseigne la correction d'un commentaire** en citant `005` comme le
   cas de référence — alors que `006` vient de refaire l'opération pour le **troisième**
   commentaire (Q-18). C'est très exactement la forme du constat **Q-22 (a)** : un renvoi
   qui a vieilli et qui fera croire à un lecteur de la vague 3 que le sujet est clos.
3. **Aucun des constats Q-15 à Q-28 n'est mentionné** dans `README.md` ni dans
   `CHANGELOG.md`. Le `CHANGELOG` reste juste sur l'essentiel — il dit que la porte est
   refusée — mais douze constats fermés, dont trois majeurs et un travail de migration,
   n'ont laissé aucune trace hors du registre.

`CLAUDE.md` et `docs/PLAN_EXECUTION.md`, eux, sont **à jour** et cohérents entre eux : le
premier annonce « la porte S2 a été REJOUÉE ET REFUSÉE au 5ᵉ passage », le second aussi.
Je le dis parce que c'est le fichier lu à chaque ouverture de session, et qu'une
divergence y aurait été le pire endroit possible.

---

## 6. Observations qui ne méritent pas de numéro

* **Les clés d'enveloppe inconnues sont retirées en silence.** `SCHEMA_CREATION` porte
  `additionalProperties: false`, mais Fastify compile avec `removeAdditional: true` : un
  corps `{champs:{…}, filiale_id:"FIL-B"}` rend **201** et la clé est simplement effacée.
  Le cas est connu — c'est pour cela qu'`id` est déclaré `not: {}` — et il est sans
  conséquence de sécurité (le périmètre ne vient pas de là, je l'ai éprouvé). Il reste
  qu'un client qui envoie `perimetre` ou `portee_groupe` dans l'enveloppe reçoit un succès.
* **Le contrôle de matière de la CSP est un `includes`.** Observation reprise du passage
  précédent, toujours vraie : une seconde directive ou un `Header append` ailleurs dans le
  fichier passerait. Ma marche des 27 écrans emploie la CSP **extraite du fichier**, ce qui
  couvre la première moitié du risque, pas la seconde.
* **Q-8 n'a toujours aucun essai de performance.** La mesure « 3 ms au lieu de 41 » ne vit
  que dans un commentaire de `sync.js`. Aucune régression de coût ne serait vue.
* **`GET /api/entites/<collection>` rend 404 en développement comme en production** : il
  n'existe pas de route de liste. Ce n'est pas un défaut, mais un balayage de complétude
  qui l'ignorerait conclurait à tort.
* **Le repli non cryptographique de `UI.genId`** (`Math.random` si `crypto.getRandomValues`
  manque) contredit la lettre du §2. Inatteignable en contexte sécurisé, documenté sur
  place, sans conséquence. Les deux enveloppes de `datastore.js:81` et
  `importExcel.js:27` délèguent bien à `UI.genId` et ne gardent qu'un repli d'ordre de
  chargement.
* **`assets/logo/favicon.svg`** est servi depuis la racine web. Sous la CSP livrée
  (`script-src 'self'`), un script inline dans un SVG rendu comme document serait bloqué ;
  et l'absence de SVG dans les logos est un critère de la **porte S5**, pas de celle-ci. Je
  le signale pour que la vague 5 ne le découvre pas comme une surprise.
* **`~$1.Risques informatiques 2024.xlsx` porte un nom de personne en clair.** Compté avec
  Q-31 plutôt qu'à part, mais c'est une donnée personnelle, dans un produit qui embarque un
  registre RGPD.

---

## 7. Ce que j'ai cherché et n'ai pas trouvé

Pour que le septième passage, s'il a lieu, aille chercher ailleurs. Chaque ligne est un
échec de ma part, et c'est ce qui la rend utile.

* **Une valeur du navigateur qui atteint un réglage de session** — dix-huit formes
  d'entête, six paramètres d'URL, quatre enveloppes de corps, un cookie composite. Rien.
  Et il n'existe pas de chemin *structurel* : `resoudre()` est sans argument, et la seule
  autre entrée est l'environnement du processus.
* **Une injection SQL** — onze noms d'entité hostiles, douze noms de champ, **18 entrées
  sur `?depuis=`** (le seul paramètre d'URL du produit, que le passage précédent n'avait
  pas sondé), pollution de prototype. Rien ne fuit, rien ne s'exécute.
* **Un champ système imposé par le client** — `version`, `cree_le`, `cree_par`,
  `modifie_par`, `filiale_id`, `id`, `portee_groupe` : tous refusés **et nommés**.
* **Une écriture qui franchit la frontière de filiale** — `PUT` et `DELETE` sur `RISK-B`
  depuis la filiale A rendent 404, **indiscernable** d'un identifiant qui n'existe pas ;
  `portee: 'groupe'` depuis une filiale rend 403 ; le socle Groupe rend 403.
* **Le mensonge que le vhost était accusé de porter.** J'ai monté un mandataire qui
  reproduit `ProxyTimeout` et **la transaction est bien annulée** : 1 exigence avant, 1
  après, stable sur 32 s. C'était l'hypothèse la plus chargée du correctif Q-19 ; elle
  tient.
* **Une famine de la boucle d'événements pendant une reprise à la borne** — j'y croyais
  assez pour bâtir une sonde dessus. Faux : 6 à 17 ms pour une écriture concurrente
  pendant une reprise de 7 954 enregistrements.
* **Un 500 pendant la saturation du pool** — c'était le second axe de Q-20. Dix reprises
  simultanées, cinq lectures : **0 en 500**, 3 en 503, 2 en 200.
* **Une fermeture d'identifiant dans les 26 modules** — analyse de portée sur les 26
  fichiers : **zéro** capture d'identifiant réutilisée dans une fermeture. La convention du
  `dataset.id` est tenue partout, et le recalage de l'adresse fonctionne (mesuré par le
  geste réel : création d'une mesure, fiche relue après ré-affichage et après F5).
* **Un gestionnaire en ligne survivant** — balayage de **tous** les `.js` et `.html`
  livrés, commentaires exclus : **zéro**. Et 27 écrans sous la CSP exacte du vhost : **0
  violation, 0 erreur de console**.
* **Un garde-fou décoratif dans le schéma ou au démarrage** — j'en ai débranché **cinq**,
  de cinq façons différentes ; les cinq font échouer le déploiement, le démarrage ou le
  banc. (Le sixième, côté navigateur, n'a pas résisté : c'est **Q-32**.)
* **Une collision réelle de `UI.genId`** — je n'ai pas su en fabriquer une sans retirer le
  compteur de session. C'est une bonne nouvelle pour le produit, et c'est ce qui rend le
  détecteur de Q-23 pratiquement inerte.
* **Une borne du moteur qui ne mordrait pas** — je les ai toutes franchies, une par une.
* **Un secret** dans le dépôt, dans une réponse, dans un message d'erreur, dans le vhost
  ou dans l'unité systemd. L'unité est d'ailleurs remarquablement durcie
  (`CapabilityBoundingSet=`, `IPAddressDeny=any`, `ProtectSystem=strict`,
  `ProcSubset=pid`), et l'arrêt est **propre** (`SIGTERM` → `serveur.close()` qui attend
  les requêtes en cours).
* **Une altération du journal d'audit** — `update`, `delete`, `truncate` refusés en
  `42501` sous `grc_app` et en **`GRC01` sous le propriétaire**.
* **Une modification du dépôt par mes propres essais** — `git status --porcelain` vide du
  début à la fin, et `diff -r` entre le dépôt et ma copie ne rend rien.

---

## 8. Ce que je n'ai pas pu vérifier

* **Apache** : absent de la machine. Je l'ai **remplacé par un mandataire de mon
  écriture** qui reproduit le seul comportement dont dépendait un correctif — la
  destruction de la connexion arrière à l'échéance de `ProxyTimeout`. Restent non
  éprouvés : `LimitRequestBody`, la redirection TLS, `mod_deflate`, les `DirectoryMatch`
  et `<FilesMatch>`, `ExpiresByType` et le jeton de cache. **Q-31 est donc établi par
  lecture du vhost et rejeu de la copie de fichiers, pas par une requête HTTP réelle** ;
  je n'ai trouvé dans le fichier aucune directive qui protégerait `data/`, et j'ai vérifié
  les deux blocs d'interdiction motif par motif.
* **Debian 13 et PostgreSQL 17** : tout a été joué sur **PostgreSQL 16.13**. Je n'ai relevé
  aucun emploi de fonctionnalité postérieure à 16.
* **L'Active Directory, ClamAV, le relais SMTP** : hors périmètre du lot et absents.
* **`deploy/install.sh` en entier** : je n'en ai exécuté que la copie du frontend et lu le
  reste. `jeton_frontend` / `injecter_jeton_frontend` sont bien écrits — motif de détection
  volontairement plus large que le motif d'injection, contrôle de complétude qui échoue
  bruyamment — mais je ne les ai pas fait tourner.
* **Le comportement au volume réel côté navigateur** : mes mesures de reprise sont
  serveur. Je n'ai pas rejoué le sondage sur une filiale de 12 000 enregistrements.
* **La latence du VPN** : toutes mes mesures sont locales. Sur le lien réel, **Q-29 se
  déclenche plus souvent**, pas moins : c'est la stagnation réseau qui l'arme.
* **La validation du découpage Groupe/Filiale par le RSSI groupe** (risque P5) : toujours
  aucune trace dans le dépôt, et toujours attendue **avant la mise en service pilote**.
  C'est le sixième passage de porte qui l'écrit.

---

## 9. Ce qu'il faut faire, et quand

| # | Constat | Propriétaire | Échéance | Ce que ça coûte |
|---|---|---|---|---|
| **Q-29** | Le bouton « Recharger » détruit la saisie bloquée et annonce le succès | agent **FRONT** (arbitrage) · agent **OUTILLAGE** (l'essai rouge d'abord) | **à la fermeture de cette porte** — c'est le bloquant | une décision, puis quelques lignes dans `recharger()` et le bandeau |
| **Q-30** | Un 502/504 du frontal rejoue la création en doublon | agent **FRONT** | **à la fermeture de cette porte** | une ligne dans la branche non-JSON d'`api.js`, plus son essai |
| **Q-31** | Données réelles d'un client dans la racine web | agent **DÉPLOIEMENT** (l'`--exclude` et le vhost) · **orchestrateur** (le retrait du dépôt) | **à la fermeture de cette porte** | un `git rm`, un `--exclude`, un motif de `<FilesMatch>` |
| **Q-32** | Q-23 n'a aucun essai ; le registre le déclare vérifié | agent **OUTILLAGE** (l'essai) · **orchestrateur** (l'état au registre) | **à la fermeture de cette porte** | un essai, dans le sens où le mécanisme parle |
| **Q-33** | Trois remèdes antérieurs sans couverture (N-3 adresse, m-6, Q-19 avant transaction) | agent **OUTILLAGE** | **vague 3**, à joindre nommément au filet de **Q-16** | trois essais |
| **Q-34** | `006` et douze constats absents de `README`/`CHANGELOG` ; « 5 migrations » | agent **DOC** | **à la fermeture de cette porte** | une mise à jour, avec son point de mesure |
| Q-9 / Q-20 | fond de la saturation | **lot L7** | vague 5 | report **défendable** : la borne tient, le 500 a disparu |
| Q-10 | analyse de corps avant décision | **lot L3** | vague 3 | report **défendable**, mesuré à nouveau (facteur 6) |
| Q-16 | les 26 modules sans filet | **vague 3** | ouverture de la vague 3 | report **défendable** ; la convention est tenue partout aujourd'hui |
| Q-28 | `LONGUEUR_ALEA` dupliquée dans `src/reprise` | agent **API** | vague 3 | report **défendable**, rien ne casse |

---

## 10. Ce qui est solide, et qu'il faut dire

Un rapport qui refuse une porte doit dire ce qu'il a essayé de casser sans y parvenir,
sans quoi son verdict est un caprice.

* **Le cœur serveur ne bouge pas.** Quatre-vingt-une sondes hostiles, dont dix-huit sur un
  paramètre d'URL que personne n'avait sondé : ni le périmètre, ni une frontière de
  filiale, ni une requête SQL n'ont bougé. Et le périmètre est tenu par la **forme**, pas
  par la vigilance.
* **Le cloisonnement tient, et il tient sous sabotage.** 107 contrôles au vert ; le retrait
  d'un seul `force row level security` fait tomber trois contrôles nommés, sortir la
  démonstration en code 3 **et** l'installateur en code 7. Le dispositif de preuve refuse
  aussi de rétrécir.
* **Les garde-fous sont branchés, et le débranchement le prouve — cinq fois.** Schéma,
  couverture RLS, entropie SQL, entropie TypeScript, complétude des routes : chacun refuse
  respectivement le déploiement, le démarrage ou le banc.
* **Le garde-fou d'entropie mesure enfin une entropie, des deux côtés.** Un remplissage de
  32 signes pour 20 bits réels est refusé en base ; un générateur ramené à 40 bits empêche
  le serveur de démarrer. Le contrôle de justesse — retrouver 128,08 bits par le calcul —
  est ce qui distingue cette mesure d'une croyance.
* **Q-19 et Q-20 sont réellement réparés, et je les ai éprouvés autrement que leur
  auteur.** Un mandataire reproduisant `ProxyTimeout` montre que la transaction est
  annulée ; la borne refuse 11 188 enregistrements en 168 ms avec un message actionnable ;
  dix reprises simultanées ne produisent plus un seul 500.
* **Le produit fonctionne dans sa configuration de déploiement**, pour tout ce qui n'est
  pas le chemin de Q-29 : 27 écrans sous la CSP exacte du vhost, zéro violation, zéro
  erreur de console, zéro gestionnaire en ligne dans l'intégralité des fichiers livrés, le
  geste complet « nouvelle mesure → formulaire → enregistrer » qui aboutit et dont
  l'adresse est recalée sur l'identifiant du serveur.
* **Vingt fermetures sur vingt-deux se rejouent au sabotage.** C'est un taux que ce
  chantier n'avait encore jamais atteint, et il faut le dire : les trois assertions de
  silence que le passage précédent avait prises en défaut mordent toutes les trois
  aujourd'hui.

Le lot est plus près d'être fini qu'il ne l'a jamais été. Il ne l'est pas, et le motif
n'est plus une chaîne de configuration : c'est qu'un correctif accepté à cette porte a
échangé un mensonge silencieux contre une **destruction silencieuse**, et que la phrase
qu'il affiche invite l'utilisateur à la déclencher. C'est exactement la question que ce
chantier s'est apprise à poser — *« qu'est-ce qui passerait aussi ? »* — et elle valait, ce
coup-ci, contre le remède plutôt que contre le défaut.
