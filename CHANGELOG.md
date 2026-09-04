# Changelog — Cyber GRC

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/).
Deux composants depuis le chantier serveur : la SPA `cyber-gouvernance_V4/`
(HTML/CSS/JS, sans build) et le serveur applicatif `backend/`
(Node.js 22 + TypeScript + PostgreSQL). Cadrage : `docs/PLAN_SERVEUR.md` ;
conduite du chantier : `docs/PLAN_EXECUTION.md`.

## [Non publié]

### Serveur — vague 3 : la documentation cesse de nier ce que L3 a livré (constat Q-90)

**Huitième signalement de la famille Q-4 (`README` périmé), et le premier à l'envers** :
le `README` §8 ne retardait plus sur le code, il **niait** ce qu'il fait. Sa table
« Dette reportée » annonçait encore **ouvertes** cinq propriétés que le lot L3 avait
**livrées** — E1 (substrat de session conditionné), droits par domaine, droit d'export
distinct, limitation de rythme, écriture au journal —, avec cinq chiffres faux dont
**trois se contredisaient à l'intérieur du même fichier** : le §5 comptait **six**
familles d'essais et **637** essais pendant que le §8, dans la même page, en comptait
déjà **onze** et **1030** ; « **huit** contrôles de schéma » contre « **neuf** » deux
paragraphes plus loin ; « **six** migrations » énumérées quand `db/migrations/` en
portait déjà **sept**. Détail complet et mesuré au registre, constat **Q-90**
(`docs/PLAN_EXECUTION.md` §7).

- **Les cinq propriétés sont vérifiées dans le code, une par une, avant d'être
  déclarées closes** — aucune n'est prise sur la foi du registre : `grc.authentification`
  conditionne toute écriture du substrat de session (`db/migrations/007_authentification.sql`,
  condition **E1**) ; `DroitsSession.niveaux` est émis (`src/droits/passerelle-api.ts`)
  et consommé (`src/api/droits.ts`, constat Q-66 fermé) ; `deciderAcces` refuse l'action
  `exporter` indépendamment de `lire`, portée par sa propre route (`GET /api/export`,
  absente jusqu'ici du tableau des routes du §4) ; `src/api/limiteur.ts` borne les
  requêtes sans session en `onRequest`, avant l'analyse du corps (condition **E4**) ; le
  neuvième garde-fou de schéma (`f_verifier_substrat_session()`) est bien consigné dans
  `controles_schema` depuis la migration `007`.
- **Ce qui reste ouvert le reste — ce document ne prétend pas le contraire.** Le journal
  d'audit écrit aujourd'hui **4 actions sur 20** déclarées (connexion réussie/refusée,
  compte de secours, verrouillage par rythme, déconnexion), toutes depuis
  `src/auth/index.ts` seul : la couverture est le lot **L5**, en cours dans cette même
  vague. La justification qui couvrait l'absence de cloisonnement de la lecture du
  journal — « sans effet tant que le journal est vide » (condition **E6**) — est
  corrigée : le journal n'est plus vide, et `grc_lecture` y lit sans filtre de filiale.
- **Le `README` §5 ne porte plus sa propre table d'effectifs.** C'est la cause directe
  des trois contradictions internes : deux tables de comptage, deux révisions de
  référence, aucun contrôle entre elles. Il ne reste plus qu'un seul endroit où compter
  (le bloc de mesure du §8) ; le §5 ne fixe plus que la **vocation** de chaque famille —
  onze aujourd'hui, `test/auth/`, `test/droits/`, `test/annuaire/` et `test/modules/`
  désormais décrites, alors qu'elles n'existaient pas quand cette table a été écrite.
- **`test/documentation/chiffres-du-banc.test.mjs` garde désormais la LISTE des
  familles, pas seulement leur total** (2 essais neufs, constat Q-90) : les répertoires
  décrits au §5 doivent être exactement ceux de la révision que le §8 cite — jugé contre
  cette révision, jamais contre l'arbre de travail, pour la même raison que le reste de
  ce fichier depuis Q-53 (rester vrai pendant que d'autres agents ajoutent des essais en
  parallèle). **Mordu dans les deux sens** : `test/modules/` retiré du §5 fait rougir en
  le nommant explicitement ; le titre de la section renommé fait rougir aussi — le
  contrôle refuse de rendre vert en ne lisant plus rien.
- Aucun changement de code ni de schéma dans cette entrée : seuls `backend/README.md`,
  `CHANGELOG.md` et `backend/test/documentation/**` sont touchés — périmètre exclusif de
  cet agent (`docs/PLAN_EXECUTION.md` §3, agent **J4**).

**État mesuré à la clôture de cette entrée** : `node --test "test/documentation/*.test.mjs"`
→ **19/19 réussis, aucun échec** (les 17 précédents de cette seule famille, plus les
2 nouveaux). ⚠️ Ce nombre est celui de la famille `test/documentation/` **seule** — à ne
pas lire comme le total du banc, qui vit au §8 du `README` et nulle part ailleurs (c'est
précisément ce que le contrôle « LE MÊME NOMBRE partout » de `chiffres-du-banc.test.mjs`
refuserait de laisser confondre). Le banc **complet** n'a pas été rejoué pour cette
entrée : trois autres agents écrivaient au même moment dans `src/`, `db/migrations/008_*`
et d'autres familles d'essais, et une exécution y a effectivement rougi sur des défauts
**hors du périmètre de cette entrée** (garde-fou de schéma en cours d'écriture, module
frontend 27ᵉ pas encore attendu par son filet) — signalé pour mémoire, volontairement non
corrigé ici, conformément au partage des périmètres de la vague 3.

### Serveur — vague 3 : la machine réelle referme des réserves (nuit du 03 au 04/09/2026)

Huit passages de porte avaient reconduit, honnêtement et sans se contredire, que
l'installation Debian 13 complète, l'unité systemd, le TLS d'une vraie PKI et ClamAV
n'étaient pas éprouvés. Ils le sont depuis cette nuit : le chantier tourne désormais sur
une VM Debian 13 réelle, installée de bout en bout par `deploy/install.sh`, puis un
contrôleur de domaine **Active Directory Samba réel** a été monté pour la recette.
Comme à chaque fois qu'une réserve écrite est enfin traitée, ce n'est pas la réserve qui
était intéressante : ce sont les défauts qu'elle cachait. Quatorze constats en sont
sortis, **Q-72 à Q-85** — le détail et l'état à jour de chacun vivent au registre
(`docs/PLAN_EXECUTION.md` §7, colonne État) et ne sont **pas recopiés ici** : deux listes
des mêmes constats divergent, et la divergence est silencieuse. Deux étaient bloquants,
et ensemble ils rendaient le produit inutilisable pour quiconque venait de s'authentifier
avec succès : **Q-83** (le détecteur de renvoi LDAP refusait toute réponse portant un
`SearchResultReference`, qu'un Active Directory réel émet pourtant sur toute recherche en
sous-arbre depuis la racine du domaine — aucune connexion n'aboutissait) et **Q-84**
(`/api/session` rendait 503 juste après une connexion réussie, la route confondant
« aucun résolveur fourni » et « résolveur fabriqué par requête » — la SPA affichait donc
« serveur indisponible » à l'utilisateur qui venait de s'authentifier).

**État mesuré à la clôture de cette entrée**, révision `d217fbb`, sur cette même machine
réelle (**Node v22.23.2**, **Apache/2.4.68 (Debian)**, **PostgreSQL 17.11**, **rsync
3.4.1**, Debian GNU/Linux 13 trixie) : `npm test` → **1030 essais, 1030 passés, 0 échec**
(130,6 s ; onze familles, détail au `backend/README.md` §8 — le compte est passé de 969 à
1030 pendant la vague, cinquante-neuf essais ayant été ajoutés par les agents B1 et B2
après le passage de l'agent de documentation, constat **Q-87**), `npm run verifier-types`
sans erreur, `npm audit --omit=dev` → 0 vulnérabilité, `db/verifier_cloisonnement.sql` →
107 contrôles, 107 réussis, 0 échec, `f_verifier_schema()` → 0 anomalie (**9** garde-fous
consignés, la migration `007_authentification.sql` en ayant ajouté un neuvième). Sur la
base réelle : 48 tables, RLS activée et forcée 48/48, 192 politiques, 2 filiales actives,
8 profils → 23 groupes `GRC-*`. `systemd-analyze security cyber-grc.service` →
**1,3 OK**.

- **Constat Q-77 fermé.** `backend/README.md` §8 annonçait « Apache 2.4.58 (Ubuntu) » et
  « PostgreSQL 16.13 » — la version d'un conteneur de développement qui n'existe plus —
  pendant que `test/deploiement/` tournait déjà sur la cible réelle, dont le correctif
  Q-42 (le type MIME qu'Apache attribue aux `.js`). Rejoué sur Debian 13 : la prémisse
  tient aussi là, `/etc/mime.types` y déclare bien `text/javascript`, et les 59 scripts
  d'`index.html` sont mesurés à **2 248 762 → 699 088 octets** derrière le vhost livré.
  Les chiffres et noms de version du README §8 sont réécrits en conséquence ; deux
  en-têtes d'essai (`test/api/normalisation-erreurs.test.mjs`,
  `test/deploiement/vhost-apache.test.mjs`) raisonnent encore sur 2.4.58 et restent hors
  du périmètre d'écriture de cette entrée.
- **Constat Q-53 fermé.** Rien ne confrontait les chiffres du README au réel — six
  signalements de documentation périmée en huit passages, la parade restant la
  discipline d'un agent. `test/documentation/chiffres-du-banc.test.mjs` porte désormais
  cinq essais qui **rejouent** `apache2 -v`, `psql --version`, `process.version` et
  `/etc/os-release`, et comparent leur sortie **au même motif** que celui appliqué au
  texte du README : un nombre qui diverge fait rougir le banc au lieu d'attendre un
  septième signalement. Mordu dans les cinq sens (Node, Apache, PostgreSQL, rsync, OS
  falsifiés un par un puis restaurés) — et la première exécution de ce contrôle a
  elle-même trouvé deux bugs en son propre sein avant d'être mordue : une ligne
  `| Base |` homonyme plus haut dans le document (le tableau de sauvegarde, §6, sans
  rapport avec PostgreSQL) et un libellé de colonne répétant le mot « rsync », que le
  motif de comparaison captait à la place de la valeur.
- **Constat Q-4, 7ᵉ signalement, fermé** — par cette entrée même.

### Serveur — vague 3 : lot L3, authentification Active Directory et droits

**État mesuré à la livraison**, révision `f11a9ae`, base neuve : `npm test` → **969 essais,
969 passés, 0 échec** (165,2 s ; base 272 · api 241 · reprise 77 · navigateur 74 ·
déploiement 56 · dépôt 3 · documentation 12 · **auth 84** · **droits 69** · **annuaire 48** ·
**modules 33**), `npm run verifier-types` sans erreur. Le banc a gagné **318 essais** et quatre
familles depuis l'ouverture de la vague.

- **Authentification LDAPS** : liaison, résolution **récursive** des groupes imbriqués (cycle
  compris), provisionnement à la première connexion, déprovisionnement qui **invalide les
  sessions en cours**, compte de secours journalisé à chaque usage, limitation du rythme.
- **Modèle de droits à trois axes** appliqué à chaque requête, **droit d'export distinct**,
  contrôle d'authentification et limitation de rythme en `onRequest` **avant l'analyse du
  corps** — un corps anonyme de 18 Mio passe de 291 ms à **90 ms** derrière Apache réel.
- **Migration `007`** : le substrat de session n'est plus écrivable sans condition (condition
  d'entrée **E1**), et un neuvième garde-fou de schéma la vérifie.
- **Annuaire LDAP simulé** dans le banc, avec cycle d'imbrication, troncature et renvoi — les
  trois détecteurs de réponse incomplète sont **mordus**, dont un contre un serveur que
  l'auteur du client n'a pas écrit.
- **Filet de non-régression des 26 modules** (constat Q-16) : comportemental, pas textuel.
- ⚠️ **Un défaut vivait entre deux fichiers dont aucun n'avait tort seul** (constat Q-71) :
  `src/serveur.ts` n'appartenait à aucun rôle, et les couches d'authentification et d'API
  étaient écrites, éprouvées et **reliées par personne** — sans route de connexion, **et avec
  un banc vert**. C'est le troisième défaut de cette forme sur ce chantier.

### Serveur — vague 3 : ouverture (lot L3, authentification AD et droits)

**La vague 3 est ouverte le 03/09/2026**, sur une porte S2 refusée au 9ᵉ passage — et c'est
délibéré. L'arbitrage de l'utilisateur (`docs/PLAN_EXECUTION.md` §0 bis, objectif d'une V1
complète au 21/09) remplace le veto de la porte par un **tri en trois classes** : ce qui bloque
le fonctionnement et ce qui fuit ou perd des données se corrige sans négociation ; tout le reste
part au registre en `V1.1` et la vague continue. Appliqué constat par constat, ce tri ne laisse
**aucun constat ouvert dans les deux premières classes**.

- **État mesuré à l'ouverture**, révision `e69b184`, machine neuve (PostgreSQL 16.13, Apache
  2.4.58, rsync 3.2.7 installés pour l'occasion) : `npm test` → **651 essais, 651 passés,
  0 échec** (126,3 s ; base 272 · api 187 · reprise 77 · navigateur 54 · déploiement 52 ·
  dépôt 3 · documentation 6), `npm run verifier-types` sans erreur, `npm audit --omit=dev` →
  **0 vulnérabilité**, `db/verifier_cloisonnement.sql` → **107 contrôles, 107 réussis, 0 échec**,
  **6 migrations** appliquées sans intervention.
- **Deux constats étaient périmés, et le sont restés jusqu'à ce qu'on les rejoue** : **Q-54**
  (le garde-fou du registre existait depuis le 02/09 ; rejoué par mutation le 03/09 — dix lignes
  de queue retirées, l'essai les nomme, 5/6) et **Q-59** (637 puis 640 annoncés, **651** mesurés).
- **Découpage arrêté** : cinq agents aux périmètres disjoints (`PLAN_EXECUTION` §3), la partition
  de `backend/test/**` par famille (§2) — chaque agent prouve son travail sans écrire chez le
  voisin, ce que le constat Q-3 avait rendu impossible —, et le **contrat de l'annuaire LDAP
  simulé figé avant le lancement** (`backend/db/CONVENTIONS.md` §25), pour qu'aucun agent
  n'attende l'autre. L'annuaire simulé n'appartient pas à qui écrit le client LDAP : un agent qui
  écrit sa doublure et le code qui l'interroge se trompe deux fois de la même façon.
- **Une phrase fausse retirée avant qu'elle ne coûte** : le tableau de la vague 3 prescrivait une
  migration `005_*.sql`, alors que `005` et `006` sont **appliquées** — une session neuve aurait
  écrit `005_` et `migrate.mjs` serait sorti en code 4.


### Serveur — vague 2 : l'API et la bascule de la persistance (lot L2)
> Travail de la vague 2 terminé, **puis** ses constats fermés — quatre fois. Chiffres
> **rejoués** au 02/09/2026 sur la révision **`ca73ac6`**, arbre propre, base neuve
> (PostgreSQL 16.13, **Apache 2.4.58**, **rsync 3.2.7**) : `npm test` → **637 essais,
> 637 passés, 0 échec** (base 272 · api 180 · reprise 77 · navigateur 53 ·
> déploiement 51 · **documentation 4**), `npm run verifier-types` sans erreur,
> `npm audit --omit=dev` → **0 vulnérabilité**,
> `db/verifier_cloisonnement.sql` → **107 contrôles, 107 réussis, 0 échec**,
> `f_verifier_schema()` → **0 anomalie** (8 garde-fous découverts, joués et consignés),
> **6 migrations** appliquées pour **48 tables** et **192 politiques**.
>
> ⚠️ **La porte de sécurité S2 N'EST PAS FRANCHIE, et ses deux derniers verdicts
> portent chacun un bloquant.** Elle l'a été au 4ᵉ passage (« ✅ FRANCHIE — 0 bloquant, 4 majeurs,
> 7 mineurs », révision `a4116b6`, verdict consigné en `120266e`) ; la fermeture des
> constats est venue après, soumise au **5ᵉ passage** sur `f68f799` — « ❌ refusée —
> 0 bloquant, 3 majeurs, 3 mineurs, contrôle **S17** en échec » ; la fermeture de *ces*
> constats a été soumise au **6ᵉ** sur `f0b4eec` — « ❌ refusée — **1 bloquant**,
> 3 majeurs, 2 mineurs, contrôles **S17 et S18** en échec » ; la suivante au **7ᵉ** —
> « ❌ refusée — **1 bloquant**, 2 majeurs, 3 mineurs, S17 et S18 en échec » ; et la
> dernière au **8ᵉ** sur `ab53aec` — « ❌ refusée — **0 bloquant**, 4 majeurs, 3 mineurs,
> S13 et S17 en échec » (`docs/PLAN_EXECUTION.md` §7, rapports
> `docs/securite/RAPPORT_S2_QUINQUIES.md`, `RAPPORT_S2_SEXIES.md`,
> `RAPPORT_S2_SEPTIES.md` et `RAPPORT_S2_OCTIES.md`).
>
> **Le 8ᵉ est le premier refus sans bloquant**, et son auteur écrit que le lot est plus
> solide qu'à aucun passage : *17 fermetures rejouées par mutation, 17 morsures, zéro
> exception*, y compris les trois que le 7ᵉ avait trouvées vertes.
>
> **Aucun de ces trois défauts n'était dans un fichier de la liste ci-dessous.** Le 5ᵉ
> tenait à un désaccord *entre* le vhost et le serveur, dont aucun n'avait tort seul — le
> premier coupe la reprise à 60 s pendant que le second valide sa transaction. Le 6ᵉ et
> le 7ᵉ tenaient chacun à **un correctif que la porte précédente avait accepté** : l'un a
> échangé un doublon silencieux contre une **destruction silencieuse**, l'autre a rendu
> **l'application injoignable à son URL d'entrée**. Le cœur du lot n'est en cause dans
> aucun des trois : 111 sondes hostiles sans effet, cloisonnement 107/107 qui s'effondre
> proprement au sabotage, et **25 écrans derrière un Apache réel sans une seule violation
> de CSP** — mesuré pour la première fois au 7ᵉ. **Ne lisez donc aucune entrée ci-dessous
> comme un acquis.**
>
> L'état constat par constat — *corrigé en attente du rejeu*, *reporté par écrit*,
> *documenté sans être fermé* — vit dans le **registre des constats ouverts** du même
> §7. Il n'est ni recopié ni résumé ici, pas même par un décompte : il vit, et deux
> listes des mêmes constats divergent en silence. Sa colonne d'état se lit en sachant
> qu'une coche verte y est une **hypothèse** : le 6ᵉ passage a trouvé un constat annoncé
> « fermé et vérifié » qui ne l'était pas.

**L'API**

- **Une couche d'accès générique, un moteur et un registre** (`src/entites/`) pour les
  **21 collections** du modèle navigateur. Le registre ne décrit que ce que PostgreSQL ne
  sait pas — nom frontend, préfixe d'identifiant, alias de colonne, liaisons n-n, scission
  des mesures ; colonnes, types, `not null`, colonnes **engendrées** et cloisonnement sont
  **découverts dans le catalogue**. C'est l'application au code de la leçon la plus chère
  de la vague 1 : « une liste écrite à la main est une omission qui attend ». Un garde-fou
  recoupe registre et schéma et **fait échouer le démarrage** quand ils divergent sur un
  nom ou une forme.
- **Verrouillage optimiste — le risque projet P1 est traité, pas repoussé.**
  `update … where id = $1 and version = $2` ; zéro ligne = refus. C'est la parade au modèle
  navigateur, qui réécrivait l'instantané complet à chaque enregistrement : transposé au
  serveur, le dernier qui enregistre aurait silencieusement écrasé le travail des autres.
  Le `DELETE` est soumis au même verrou (`?version` **exigé**) : supprimer relève du même
  risque.
- **`UPDATE 0` est diagnostiqué en trois causes, pas interprété en une.** C'était le piège
  n°1 légué par la vague 1 : `GRC03` se définit exactement sur ce zéro, qui vaut aussi
  « ligne absente » et « écriture refusée par la RLS ». `diagnostiquerEcriture()` tranche
  **dans la même transaction** que l'écriture qui a échoué et rend cinq verdicts :
  `conflit_version` → 409 + `GRC03` + la version réellement en base ; `invisible` → 404 ;
  `autre_filiale`, `portee_groupe` et `refus_politique` → 403, avec une phrase qui dit
  laquelle. Sans cela, l'API aurait envoyé recharger sa page à quelqu'un qui n'avait pas
  le droit d'écrire.
- **Les deux autres pièges de la vague 1 sont fermés à la conception** : les colonnes
  `version` / `cree_le` / `cree_par` sont **exclues par construction** en écriture, et un
  champ client qui les viserait est **refusé** et non ignoré (ignorer aurait été le pire
  des deux mondes) ; toute insertion **nomme ses colonnes**, filtrées sur
  `engendree = false`, à cause de `documents.portee_groupe` qui entre dans une clé
  étrangère.
- **Neuf routes**, plus le point de santé : `/api/session`, `/api/modele`, `/api/donnees`
  (le jeu de données entier d'une filiale, dans la forme exacte de l'objet `data` du
  navigateur), `/api/rafraichir`, `POST`/`PUT`/`DELETE` `/api/entites/…`, `/api/reprise` et
  `/api/operations/propager-mesure`. Le détail est dans `backend/README.md` §4.
- **`POST /api/reprise` : un export `grc-backup` entier, en UNE transaction**, avec un mode
  `apercu` qui applique puis **annule** — ce qui est montré est le vrai résultat, `check`,
  clés étrangères et RLS compris, et rien ne reste derrière. Le serveur lit l'enveloppe et
  monte la charge de v1 à v12 lui-même. Cette route remplace la rafale de `DELETE` un par
  un qui, avant elle, détruisait une filiale hors transaction.
- **L'identifiant d'une création ordinaire est engendré par le serveur** : en proposer un
  est refusé, parce que ce choix donnait un **oracle d'existence inter-filiales** en une
  requête — « cet identifiant existe-t-il dans une filiale que je ne vois pas ? ». La
  reprise, elle, **conserve** les identifiants du fichier : c'est ce qui rend le round-trip
  exact, et c'est le seul chemin autorisé à les imposer.
- **Deux dérivations d'identifiant, qui ne tirent rien, et dont la marque remplace
  l'horodatage.** `<PRÉFIXE>-r-…` dit « **le serveur a dû ré-émettre** » : l'identifiant
  du fichier était déjà pris dans le domaine global par une ligne d'une filiale que
  l'appelant ne voit pas, et le serveur en dérive un autre de
  `(filiale, table, identifiant du fichier)` **en réécrivant toutes les références** de la
  charge qui le visaient — références découvertes dans le graphe des clés étrangères, pas
  énumérées. `<PRÉFIXE>-d-…` dit « **le fichier n'apportait pas d'identifiant** » (cas des
  exports anciens), et le dérive de `(collection, rang, contenu)`. Dans les deux cas la
  reprise devient **idempotente** : trois reprises du même fichier convergent sur **une**
  ligne au lieu d'en cloner trois. L'absence d'horodatage est délibérée — un identifiant
  dérivé n'a pas d'instant de création, et y en laisser un crédible mentirait au lecteur
  du journal (`backend/db/CONVENTIONS.md` §2).
- **Une requête = une transaction**, périmètre RLS posé à l'ouverture et mort au `commit` ;
  les lectures s'ouvrent en `read only` — la base refuse alors toute écriture, ce qui vaut
  mieux qu'une convention de nommage.
- **Le périmètre vient du serveur, et c'est tenu par la forme** : `resoudre()` ne prend
  **aucun argument**. Il n'existe donc structurellement aucun chemin par lequel un corps,
  une entête, un paramètre d'URL ou un cookie atteindrait `grc.filiale_id` ou
  `grc.filiales`.
- **Session provisoire fail-closed** (`src/api/session.ts`), en attendant le lot L3 : hors
  `NODE_ENV=developpement`, elle refuse de résoudre et l'API répond `503`. **La recette est
  fermée au même titre que la production** — elle porte une copie réaliste de la
  production, donc de la vraie donnée de vingt filiales sur une VM joignable par le VPN ;
  une barrière qui protège la copie mais pas l'original ne protège rien. Deux réglages
  provisoires l'accompagnent, `API_FILIALE_PROVISOIRE` et
  `API_ADMINISTRATION_GROUPE_PROVISOIRE`, sans effet hors développement.
- **Aucune route ne pose le drapeau d'administration Groupe : elles le vérifient.** Le
  droit se décide dans le résolveur de périmètre, et nulle part ailleurs — ce qui rend la
  règle impossible à enfreindre par oubli. Un test la contrôle **mécaniquement**, par
  recherche dans les sources et dans le catalogue de la base.
- **Aucun message d'erreur brut ne sort** : un chemin unique traduit les erreurs, le détail
  part au journal technique, et la réponse ne porte ni pile d'appel ni nom d'objet de base.

**La bascule côté navigateur**

- **La façade synchrone de `DataStore` est préservée, et c'est mesurable** : l'objet
  exposé compte **131 membres** — exactement les mêmes qu'avant la vague, `diff` des deux
  listes triées **vide**, aucun ajouté,
  aucun retiré. Les **118 méthodes distinctes** appelées depuis les modules, les services
  et `app.js` (**323 sites d'appel**) le sont à l'identique. C'est la parade au risque P3 :
  aucun des 26 modules métier n'est réécrit.
- **Tout l'asynchrone est absorbé dans un seul fichier**, `js/core/sync.js` — exactement
  comme `flushNow()` absorbait IndexedDB auparavant. Au démarrage il lit `/api/session`,
  `/api/modele` et `/api/donnees` ; à chaque `save()` il compare l'état en mémoire à un
  **instantané de référence** et n'envoie que la différence, **enregistrement par
  enregistrement** ; un sondage périodique rapatrie le travail des autres utilisateurs.
- **Le numéro de version ne vit pas dans l'enregistrement** mais dans une table à part,
  interne à `sync.js` : les champs `_version` / `_versionMiseEnOeuvre` sont retirés dès
  réception. Motif : `data` garde exactement la forme que les modules et l'export
  `grc-backup` connaissent, et **un module qui reconstruit un objet ne peut donc pas
  perdre la version au passage** — ce serait une porte ouverte au risque P1.
- **Un refus d'écriture produit toujours quelque chose de visible.** Un refus avalé en
  silence laisserait l'utilisateur croire sa saisie enregistrée : le même défaut, déplacé
  d'un cran. Conflit de version et ressource inconnue conservent la saisie, la marquent et
  proposent **Recharger** ; un refus de droit ne propose **aucun** rechargement — il n'y a
  rien à recharger ; une panne réseau ne marque rien et réessaie toute seule.
- **Nouveaux fichiers du noyau client** : `js/core/api.js` (le seul endroit du frontend qui
  parle au réseau ; aucune méthode n'accepte de filiale ni de périmètre — tenu par la
  forme), `js/core/session.js` (le périmètre tel que le serveur le résout, objet gelé, sans
  mutateur), `js/core/sync.js` et `js/core/reprise.js`.
- **`js/core/persistence.js` ne persiste plus rien** : `idbAvailable()` rend `false`
  définitivement, ce qui fait emprunter partout le chemin « pas de stockage local ». Le
  fichier ne sait plus que **lire** la base héritée d'un poste, sans jamais la modifier.
- **Le coffre du navigateur est retiré** (`js/core/vault.js`) : les données ne sont plus
  stockées sur le poste, il n'y a plus rien à chiffrer localement, et un coffre qui ne
  protège rien est une fausse assurance. Le chiffrement au repos est celui du disque de la
  VM. Le fichier est **neutralisé et non supprimé** : il est la porte de démarrage appelée
  par `js/app.js` et `js/modules/settings.js`, deux fichiers d'un autre périmètre.
- **`js/core/vault.js` est devenu la porte de démarrage** : session, modèle et jeu de
  données sont chargés **avant** que l'application ne s'affiche, et si la liaison échoue,
  l'application **ne démarre pas** — écran de refus, bouton « Réessayer ». Démarrer sur un
  jeu vide afficherait « aucun risque, aucune action, aucun incident », c'est-à-dire le
  contraire de la réalité dans un outil qui sert de preuve en audit.
- **L'export `grc-backup` devient un format d'échange**, et non plus une sauvegarde : la
  sauvegarde est celle du serveur. Le bandeau « exportez régulièrement pour ne rien
  perdre » est retiré — il serait faux sur les deux points, et il encouragerait la
  multiplication de fichiers complets de gouvernance cyber sur les postes, alors que le
  droit d'export est une permission distincte et journalisée dans le modèle cible.
- **Les restes de la version 100 % navigateur sont purgés au démarrage** :
  `cyber-context` (le « périmètre » choisi dans le navigateur), `cyber-vault`,
  `cyber-current`, `cyber-gouvernance-data`. Le périmètre vient désormais du serveur.

**Ce que la porte S2 a fait corriger — quatre passages, et ce qu'ils ont trouvé**

- **La base héritée d'un poste n'est plus détruite.** La version précédente purgeait
  `cyber-grc-db` au chargement du module, sans condition — donc **y compris quand le
  serveur était injoignable et que l'application refusait de démarrer**. Deux ans de
  travail détruits par quelqu'un qui n'avait encore rien pu faire. Règle désormais tenue :
  *rien n'est effacé de ce poste sans un geste explicite de l'utilisateur, et jamais avant
  que ses données aient été mises à l'abri*. La base est détectée, un bandeau propose
  **d'exporter** puis **de reprendre**, et l'effacement n'apparaît qu'ensuite.
- **L'application fonctionne enfin sous sa propre politique de sécurité de contenu.**
  **64 gestionnaires en ligne dans 23 modules** étaient bloqués par la CSP du vhost livré :
  l'application ne fonctionnait pas dans sa configuration de déploiement, et aucun test ne
  l'avait vu. Assouplir la politique aurait annulé la défense principale — la conversion en
  `addEventListener` était la seule issue. Aucune donnée ne voyage plus dans un attribut de
  gestionnaire. **Deux injections HTML antérieures** ont été trouvées en chemin et
  corrigées : le nom d'un risque dans le panneau de détail de la matrice, le nom d'un
  client dans le sélecteur de donneur d'ordre.
- **Un import en lot n'écrit plus une partie de ses lignes en annonçant le succès.** La
  part aléatoire des identifiants valait **mille valeurs**, et un import tire les siens
  dans la même milliseconde. Mesuré par l'auditeur et consigné au
  `backend/db/CONVENTIONS.md` §2 : 250 lignes annoncées, 223 écrites, aucun incident signalé —
  et, sur le questionnaire AirCyber, un **score de conformité faux** dans un outil destiné
  à servir de preuve en audit. Deux barrières indépendantes : le générateur du navigateur
  passe à un compteur de session monotone plus 52 bits d'aléa cryptographique, celui de la
  base à 122 bits, celui du serveur à 128 ; et l'import n'indexe plus ses résultats **par
  identifiant** mais **par rang** — une propriété de forme, qui ne perd rien même si le
  hasard est saboté. Le `backend/db/CONVENTIONS.md` §2 norme désormais un **plancher**
  d'entropie et non plus une forme unique : imposer la même aux quatre générateurs
  obligerait le navigateur à appeler le serveur pour créer une ligne.
- **Le geste de l'utilisateur aboutit après une création.** Le serveur réattribuant
  l'identifiant, une liste déjà rendue gardait une clé périmée : le clic ne menait nulle
  part et « Supprimer la sélection » **confirmait une suppression qui n'avait pas lieu**.
  Le balisage déjà rendu est désormais recalé, sans réafficher — ce qui préserve une
  sélection en cours, un panneau déplié, un formulaire à demi rempli. La convention qui
  rend ce correctif durable est inscrite dans `CLAUDE.md` §3.
- **Un correctif d'urgence atteint le poste le jour où il est posé.** Le vhost met les
  `.js` et `.css` en cache sept jours : sans versionnement, un correctif serait resté
  invisible une semaine sur les postes de vingt filiales. `install.sh` calcule désormais une
  empreinte du frontend et l'injecte dans **toutes** les URL de scripts et de feuilles de
  style, en **échouant** si une seule reste sans jeton ; `index.html`, qui porte ces jetons,
  passe en `no-cache, must-revalidate`.
- **La reprise refuse avant de travailler**, et un fichier invalide reçoit le même refus
  qu'un fichier valide : l'oracle de forme est fermé.
- **Le catalogue des correspondances inter-référentiels devient une table de
  configuration.** Il était réécrit et supprimé par n'importe quelle filiale, pour les
  dix-neuf autres. L'éditer est désormais un acte d'**administration Groupe** ; le lire
  reste ouvert, et la propagation — qui vise des données de filiale — reste offerte.
- **`traitements.notes` retrouve sa colonne.** Le formulaire RGPD la collectait depuis
  l'origine et le schéma ne la portait pas : la note était retirée du corps avant
  enregistrement, et surtout un export `grc-backup` existant la **porte** — la reprise
  l'aurait perdue en silence, sur le registre de l'article 30.
- **L'export Excel ne ment plus** : il lisait encore la clé de stockage supprimée par la
  bascule et retombait donc en silence sur « Global », exportant toutes les exigences et
  nommant le fichier « global » alors qu'un donneur d'ordre était sélectionné à l'écran.

**Le banc d'essai — de 306 à 637 essais, et de quatre à six familles**

- **637 essais `node:test`, 0 échec** (à `ca73ac6`), en **six** familles : **272 sur la
  base** (socle, journal, RLS, privilèges, garde-fous, consignation, vocabulaire, et la
  démonstration de cloisonnement rejouée), **180 sur l'API** (routes réellement montées,
  verrouillage optimiste, diagnostic d'`UPDATE 0`, familles d'entités, intégrité
  d'écriture, identifiants, bornes de corps, route de reprise), **77 sur la reprise**,
  **53 dans un navigateur réel**, **51 sur le déploiement** et **4 sur la forme du
  registre des constats**. Le compte a suivi les fermetures de constats — 505 au 4ᵉ
  passage, puis 534, 564, 615, 637 ; **c'est pourquoi chaque chiffre porte ici sa
  révision**.
- **Le banc tourne sur machine propre.** Une famille entière a dépendu, un temps, d'une
  entrée `/etc/hosts` que rien ne posait : verte chez son auteur, **614 sur 628** sur une
  machine neuve. Plus aucune résolution de nom, et un **piège fait échouer** toute
  tentative — une dépendance d'environnement non déclarée est une dépendance qui manquera
  chez quelqu'un d'autre, et son absence ne doit jamais ressembler à une propriété tenue.
- **La cinquième famille monte un Apache réel** (`test/deploiement/`) sur le vhost du
  dépôt, publie les fichiers par `rsync`, et **interroge l'URL d'entrée**. Elle est née
  d'un bloquant : le motif `<FilesMatch>` était éprouvé en le *simulant en JavaScript sur
  des noms de fichier*, et cette simulation était aveugle à **une** entrée — la chaîne
  vide. Les deux essais sont gardés : la simulation **fige** la leçon, l'Apache réel la
  **trouve**. Le banc dépend donc désormais d'**Apache, `openssl` et `rsync`**, et leur
  absence **fait échouer** l'essai au lieu de le sauter — même arbitrage que pour `psql`.
- **Le banc dépend désormais du client `psql`, et c'est écrit.** La dépendance existait
  déjà sans être dite — la pire des deux situations : `db/dev/preparer_base_dev.sh`
  s'arrête dessus, `install.sh` l'exige sur la VM. Elle devient nécessaire au banc parce
  que `db/verifier_cloisonnement.sql` porte des méta-commandes `psql` (`\pset`, `\echo`,
  `\gset`) que le pilote `pg` ne sait pas exécuter, et le réécrire pour s'en passer
  reviendrait à éprouver *autre chose* que le fichier que l'auditeur lance. **Si `psql`
  manque, l'essai échoue ; il ne se saute pas** — un essai qui se saute rend un banc vert
  sur une machine où la démonstration n'a pas été jouée.
- **Les tests navigateur n'existaient pas** — `grep -rl playwright` ne rendait rien hors
  `node_modules`, alors que `CLAUDE.md` §5 les impose depuis le début du projet. Six
  constats de la porte S2, dont les trois bloquants, ne se voient **que** là. Le banc monte
  un serveur local qui sert `cyber-gouvernance_V4/` **tel quel**, relaie `/api/**` vers
  l'instance Fastify réelle, et sait couper l'API comme le ferait une coupure de VPN ou
  servir la page sous la CSP exacte du vhost de production.
- **`db/verifier_cloisonnement.sql` passe de 93 à 107 contrôles** : ajout du catalogue
  partagé des correspondances (C102 à C105, en refus et en symétrique), du champ retrouvé
  du registre RGPD (C106) et de l'entropie du générateur d'identifiants (C107).
- **Un huitième garde-fou de schéma** — l'entropie des identifiants — se branche sur
  `f_verifier_schema()` **sans qu'aucun fichier de déploiement change** : c'est la
  démonstration que le point d'appel unique de la vague 1 fait ce qu'il annonce.
  *(Ce garde-fou-là mesurait une longueur et non une entropie ; il a été réémis par la
  migration `006` — voir « la fermeture de la vague » plus bas.)*
- **Et son angle mort est fermé** : `f_verifier_schema()` ne refusait que s'il ne
  découvrait **aucun** contrôle — une migration qui renomme ou re-signe une fonction en
  aurait fait disparaître un **en silence**. La fermeture de la vague apporte une
  cinquième migration, `005_controles_schema.sql`, et la table `controles_schema` : le
  **registre des garde-fous réellement branchés**, pour qu'une diminution soit une
  anomalie au même titre que l'absence totale.

**La fermeture de la vague — ce qui a été corrigé APRÈS le passage de la porte**

> ⚠️ Tout ce qui suit est **postérieur au 4ᵉ passage**, et a été soumis aux **5ᵉ, 6ᵉ, 7ᵉ
> et 8ᵉ**, qui ont tous **refusé le lot** — chaque fois pour un défaut qu'aucun de ces
> correctifs ne couvrait, et deux fois pour un défaut **introduit par l'un d'eux**. Le 8ᵉ
> a rejoué **17 de ces fermetures par mutation** : 17 morsures, zéro exception. Le 6ᵉ a rejoué **22 des 28 constats par mutation** (en cassant
> délibérément chaque correctif pour vérifier que le banc rougit) ; c'est ainsi qu'il a
> trouvé qu'**un constat annoncé « fermé et vérifié » ne l'était pas**, et qu'un correctif
> accepté au 5ᵉ produisait le **bloquant** du 6ᵉ. Rien de ce qui suit n'est acquis.

- **Le générateur qui écrit vraiment a reçu l'entropie et son garde-fou.** Le correctif
  du bloquant avait durci le générateur de la *base* ; celui du *serveur*, qui est celui
  qui écrit, était resté à un million de valeurs. `verifierRegistre()` — le point unique
  qui refuse déjà le démarrage quand registre et schéma divergent — mesure désormais la
  forme, le plancher d'entropie et le déterminisme de la ré-émission sur 20 000 tirages :
  une régression **empêche le service de démarrer** au lieu d'écrire un avertissement
  dans un journal que personne ne lit.
- **Le dernier générateur faible de la reprise a été mesuré, requalifié, puis supprimé.**
  Présumé bloquant, il s'est révélé majeur *par la mesure* : sa sortie n'atteignait jamais
  la base sur le chemin qu'on croyait. Le chemin qui écrivait réellement était l'autre —
  sur 250 enregistrements **sans identifiant**, il en engendrait 231 distincts (mesure de
  l'agent, consignée au registre des constats), et la reprise partait en `400` en
  reprochant au fichier un doublon **que le serveur venait de fabriquer**. Un export ancien
  légitime devenait irreprenable une fois sur neuf, avec un message qui accusait
  l'utilisateur. Rien n'était perdu en silence — mais c'était un déni
  de reprise. Les deux sites **dérivent** désormais au lieu de tirer, et il ne reste plus
  aucun générateur aléatoire dans `src/reprise/`.
- **Le registre des garde-fous** (`005_controles_schema.sql`, table `controles_schema`) :
  `f_verifier_schema()` ne refusait que s'il ne découvrait **aucun** contrôle — une
  migration qui renomme ou re-signe une fonction en aurait effacé un sans un mot. Elle
  compare maintenant ce qu'elle découvre à un registre nominatif, et retirer un contrôle
  devient un geste explicite : `select f_retirer_controle_schema('f_verifier_<x>', '<motif>')`,
  dans la migration qui le retire.
- **La démonstration de cloisonnement est rejouée par le banc.** Ses 107 contrôles
  étaient dans la situation exacte que ce chantier a appris à redouter — écrits, corrects,
  et rejoués par personne entre deux recettes. Le banc ne remplace pas le geste de
  recette : il empêche le script de pourrir en silence entre deux passages, et il juge le
  code de sortie, le nombre de contrôles joués **et** le nombre d'échecs *ensemble* — un
  script vidé de ses contrôles sortirait en 0 et annoncerait la démonstration faite.
- **Le sondage ne recalcule plus tout, trois fois par battement, et ne mémorise rien.**
  Il demandait trois différentiels complets par battement, chacun canonisant les 12 000
  enregistrements de la filiale. Un parcours unique à deux réglages les remplace : sans
  contenu — **3 ms au lieu de 41**, mesure consignée dans `js/core/sync.js` — et
  interruptible au premier écart quand la question est booléenne. **La
  mémorisation a été mesurée puis refusée** : `data` appartient au `DataStore`, qui en
  prête une référence vive, et toute invalidation aurait été une liste de sites de
  mutation tenue à la main — une invalidation manquée annoncerait « aucune modification en
  attente » alors qu'il y en a, soit le risque P1 par un autre chemin.
- **Les commentaires que les correctifs avaient rendus faux ont été balayés et corrigés**
  — l'en-tête d'`applyImport`, l'anomalie `identifiant-duplique`, et **trois occurrences**
  dans les en-têtes du noyau client, qui justifiaient une décision par un appelant disparu
  (`js/core/vault.js`, `js/core/session.js`). C'est la neuvième occurrence du motif « le
  remède rend fausse la phrase d'un autre fichier », et la première où le balayage a été
  fait exprès plutôt qu'au hasard d'une relecture.
- **Les essais navigateur du correctif de l'import ont été écrits — et deux des cinq
  comportements exigés sont réellement exercés.** L'entropie de `UI.genId` et
  l'indexation par rang le sont ; **le canari de doublons, le signalement de
  rétrécissement et « le sondage qui pousse » ne le sont pas**, et les trois essais qui
  manquent sont en cours d'écriture au moment où cette ligne est corrigée (révision
  `a883024`).

  > ⚠️ **Cette entrée annonçait les cinq. C'était faux, et la façon dont ça l'était
  > compte plus que le fait.** L'auditeur du passage suivant a **neutralisé les trois
  > comportements un par un** — il les a cassés délibérément — et le banc est resté
  > **vert, 32 sur 32**. Les essais traversaient donc ces chemins sans rien exiger d'eux :
  > ils passaient à côté, dans le sens du silence. Un essai qui ne rougit pas quand on
  > casse ce qu'il prétend couvrir ne couvre rien ; il **atteste** au lieu de contrôler.
  >
  > La règle que j'en tire, et qui vaut pour ce fichier autant que pour celui qui l'écrit :
  > **une affirmation de couverture qui m'est rapportée n'est pas une couverture
  > vérifiée.** J'ai écrit ici ce que le rapport de l'agent affirmait, sans le mettre à
  > l'épreuve — et un journal qui relaie une telle affirmation lui donne l'autorité
  > qu'elle n'a pas : le lecteur suivant ne lira pas le rapport, il lira cette ligne. La
  > seule preuve qu'un essai couvre un comportement est de **casser le comportement et de
  > constater que l'essai rougit**. Tant que ce sabotage n'a pas été fait, la formule
  > juste est « des essais ont été écrits », jamais « c'est couvert ».
  >
  > **Quatrième occurrence du motif** « une protection affirmée qui n'existe pas » — et
  > elle survient dans le journal que je venais d'annoter pour ce motif même, à propos des
  > vingt-trois entrées Playwright du panneau ci-dessous. Écrire la mise en garde ne
  > dispense pas de se l'appliquer.

- **Une référence pendante pouvait survivre EN BASE, et le journal ne le disait nulle
  part.** Défaut trouvé et corrigé **après** le franchissement du 4ᵉ passage, et soumis
  au 5ᵉ (révision `a883024` au moment où cette ligne est écrite). `renommer()` — la fonction qui réécrit
  les références quand le serveur ré-attribue un identifiant — réécrivait **en mémoire
  sans réarmer l'envoi** : rien ne partait, l'écran et la base divergeaient, et l'état
  « modifications non enregistrées » devenait **permanent et inexpliqué**.

  **Le pire cas n'a rien à voir avec celui qui l'a révélé**, et c'est lui qu'un exploitant
  doit savoir reconnaître. La création d'une mesure échoue sur une **panne réseau
  passagère** et repart au cycle suivant ; entre-temps, la modification de l'action qui la
  cite sort dans le cycle courant **avec l'identifiant local** ; le nouvel essai crée bien
  l'enregistrement, le renommage réécrit la référence — mais **en mémoire seulement**. La
  base garde alors un lien vers une ligne qui n'existe pas. C'est exactement la classe de
  défaut que `renommer` existe pour empêcher, et elle survivait **en base**. Déclencheur
  exact, pour qui cherche la trace : le renommage touche un enregistrement que le serveur
  détient **déjà** et que le différentiel du cycle courant ne contenait **pas**. Un
  renommage à l'intérieur d'un même cycle n'est pas concerné — les créations y sont
  écrites avant les modifications.

  Le correctif fait qu'**un cycle se termine au repos, ou il se réarme** : les
  enregistrements que le renommage a touchés sont comparés en fin de cycle, et ceux qui
  ont bougé repartent. La comparaison ne recalcule aucun différentiel — elle ne regarde
  que les quelques enregistrements concernés, pour ne pas réintroduire par la bande la
  passe de canonisation qu'un autre correctif venait de retirer.

  > ⚠️ **Réserve essentielle, et elle se perd si on la résume : ce correctif soigne la
  > divergence, jamais la corruption.** Il garantit que la base finit par porter ce que la
  > mémoire porte — pas que ce que la mémoire porte soit juste. Là où un champ métier
  > valait légitimement la même chaîne qu'un identifiant (le cas des exports très anciens,
  > où un identifiant peut valoir `"7"`), le renommage a écrasé cette valeur, et le
  > correctif **persiste fidèlement la valeur corrompue**. Lire « mémoire et base
  > alignées » comme « la donnée est réparée » serait un contresens exact. La seule
  > défense contre cette corruption-là reste le **bandeau qui nomme la réécriture et son
  > compte** — d'où le fait qu'il ne s'efface jamais tout seul, pas même à un rechargement.

- **Des données réelles ont été retirées du dépôt — et l'installateur ne peut plus les
  publier.** `cyber-gouvernance_V4/data/` a porté quatre classeurs de données réelles
  (registre de risques informatiques, import de risques, questionnaire d'exigences
  client) et un **fichier de verrou Excel nommant une personne**. Aucun code ne les
  référençait ; mais `install.sh` recopiait alors **tout** le répertoire dans la racine
  web d'Apache, et ni `.xlsx` ni `data/` ne figuraient dans les interdictions du vhost :
  sur une installation réelle, ils auraient été **téléchargeables par une URL devinable,
  sans aucune authentification**, dans un produit dont la promesse centrale est le
  cloisonnement par filiale. Sixième passage, constat **Q-31**. Les fichiers sont retirés
  et un `LISEZ-MOI.md` occupe leur place.

  La copie devient une **liste blanche de types publiables**, dérivée de ce que la
  politique de sécurité de contenu autorise à charger depuis `'self'` — et non une
  exclusion par répertoire, parce que ce n'est pas le répertoire qui distingue un fichier
  servable, c'est sa **nature** : un classeur déposé à la racine ou dans `assets/` serait
  passé sous une exclusion par répertoire. Le contrôle est fait **deux fois**, sur le
  dépôt puis sur ce qui a réellement atterri, et **dans les deux sens** : un intrus publié
  arrête l'installation, un fichier légitime manquant aussi.

  > 🔒 **Ce qui reste à faire, et qui n'appartient pas à une session** : ces fichiers
  > **restent dans l'historique git**, donc dans le dépôt distant. Les en purger impose
  > une **réécriture d'historique et une poussée forcée** — décision du **propriétaire du
  > dépôt**. Tant qu'elle n'est pas prise, ces données sont à considérer comme divulguées
  > à quiconque a accès au dépôt.

- **Un garde-fou mesurait une longueur là où la convention norme une entropie**
  (migration `006_entropie_et_commentaires.sql`, constats Q-14 et Q-17).
  `f_verifier_entropie_identifiants()` exigeait **32 caractères** d'aléa quand le §2 des
  conventions norme **52 bits tirés d'un générateur cryptographique**. Or un remplissage à
  gauche (`lpad`, le `padStart` du jumeau TypeScript) produit toujours la bonne longueur,
  **quelle que soit l'entropie portée** : le contrôle était infaillible au mauvais sens du
  mot. Pouvoir de détection mesuré par l'auditeur : **8 sur 200 à 32 bits, 0 sur 200 à
  40 bits**, pour un plancher de 52. Il est réémis sur une mesure **en bits**, et la même
  migration corrige les commentaires du catalogue que les correctifs avaient rendus faux.
  La leçon est au `CONVENTIONS.md` §17.5 : **un garde-fou auquel on prête plus de portée
  qu'il n'en a endort la vigilance au lieu de l'entretenir** — une fausse assurance est
  pire qu'un silence.

- **✅ Une réserve se lève, et un journal doit le dire aussi.** L'hypothèse la plus chargée
  du correctif de la reprise — **qu'Apache annule réellement la requête vers le serveur à
  l'expiration de `ProxyTimeout`**, au lieu de laisser une transaction se valider dans le
  vide — n'était pas mesurée, faute d'Apache sur la machine de développement, et elle
  était consignée comme telle. Le 6ᵉ passage l'a **mesurée avec un mandataire** : la
  transaction est bien annulée.

- 🛑 **Et un correctif de cette liste a produit le bloquant du 6ᵉ passage.** Une création
  dont l'issue est incertaine ne devait plus être rejouée — la rejouer fabrique un doublon
  silencieux —, et l'arbitrage avait explicitement **écarté la voie « recharger avant de
  rejouer »**, qui perd la saisie. Le correctif écarte bien cette voie dans le code, et
  **son bandeau dit à l'utilisateur de recharger**. L'utilisateur fait ce qu'on lui dit :
  **écran 0, base 0**, message vert « Données rechargées ». Le doublon silencieux a été
  échangé contre une **destruction silencieuse**.

  > **La cause est ce qu'on avait loué** : une **seule formulation** servait les deux
  > couches, « pour que le fait ne puisse pas diverger ». L'intention est juste — deux
  > phrases qui disent la même chose finissent par se contredire, ce chantier l'a payé
  > neuf fois. Mais la phrase retenue était vraie pour la **reprise**, où recharger est le
  > bon geste, et destructrice pour une **création bloquée**, où recharger jette la
  > saisie. **Un même mot, vrai à un endroit et faux à l'autre, voyage d'autant mieux
  > qu'on a pris soin de n'en avoir qu'un.** Mutualiser un libellé n'est sûr que si les
  > deux couches partagent la même *situation*, pas seulement le même *code d'erreur* — et
  > la vérification qui manquait est un essai qui **suit le geste que le message
  > recommande**, pour constater qu'il ne détruit rien.

- 🛑 **Puis un second correctif accepté a rendu l'application injoignable — et c'est
  l'installation d'Apache qui l'a montré.** La liste blanche du vhost, remède de
  l'exposition de données ci-dessus, rendait **403 sur `/`** : un motif à négation est
  vrai sur le basename **vide** d'une requête de répertoire, si bien que l'autorisation
  était refusée **avant** que `DirectoryIndex` n'atteigne `index.html`. La vérification
  prescrite, elle, interrogeait `/index.html` — et restait **au vert**.

  Deux autres défauts sont sortis du même geste, et ils n'auraient pu sortir d'aucune
  relecture :

  - **2 166 105 octets de JavaScript servis sans compression** (59 fichiers, mesuré sur
    l'arbre). Apache 2.4.58 sert les `.js` en `text/javascript` ; le vhost écrivait
    `application/javascript` dans deux directives — **aucune ne s'appliquait**. Corrigé :
    2 166 105 → 673 339 octets, et la revalidation **horaire** cède la place aux sept
    jours annoncés. Le vhost porte désormais un **tableau de ce qu'Apache émet réellement**,
    extension par extension, mesuré sur un fichier témoin, à la place de ce qu'on écrivait
    de mémoire — on y lit que `.ico` sort en `image/vnd.microsoft.icon` et non
    `image/x-icon`, ce qui ne casse rien mais aurait été écrit faux par quiconque voulait
    le mettre en cache.
  - **Le logo mis en cache trente jours sans être versionné**, alors que le bloc énonce
    lui-même que le cache long n'est sûr que couplé au jeton de version — et que le jeton
    ne réécrit que les URL `.js` et `.css`. Ligne retirée : les images retombent sur une
    heure, **conséquence de l'invariant et non nombre choisi**.

  > **Deux règles en sortent, et elles valent plus que les trois correctifs.**
  >
  > **Une réserve écrite n'est pas une réserve traitée.** Sept passages ont consigné,
  > honnêtement, que le vhost n'était pas éprouvé faute d'Apache — pendant que l'installer
  > prenait une minute. Une réserve doit porter, comme un constat, un **propriétaire et
  > une échéance**, sans quoi elle devient un alibi qui se transmet de passage en passage.
  >
  > **Un contrôle doit interroger le chemin que l'utilisateur emprunte, pas celui qui est
  > commode à tester.** Un contrôle qui évite le chemin réel ne mesure pas le produit, il
  > se mesure lui-même.

- **✅ La réserve d'environnement se réduit pour de bon.** Apache 2.4.58, `mod_deflate`,
  `mod_expires`, `mod_proxy`, `openssl` et `rsync` sont installés et **éprouvés** : le
  banc monte un Apache réel sur le vhost du dépôt et interroge l'URL d'entrée, et **25
  écrans ont été parcourus derrière cet Apache sans une seule violation de CSP** — mesuré
  pour la première fois. Restent hors de portée : le **TLS d'une vraie PKI**,
  l'installation Debian 13 complète, l'unité systemd, **ClamAV**, l'**Active Directory**
  et le **relais SMTP**.

- **La borne de corps du frontal n'existait pas — et le contrôle qui l'affirmait comparait
  deux déclarations.** `LimitRequestBody` **ne s'applique pas à un corps relayé** : la
  directive est appliquée par le filtre d'entrée HTTP, et `mod_proxy_http` prend la main
  avant lui, y compris posée dans un `<Location /api/>`. Mesuré : 28 311 552 octets
  traversent le frontal alors que la borne annonce 27 262 976 ; le **même** envoi sur
  `/index.html`, dans le **même** serveur, rend `413`. Et `install.sh` **imprimait « ok »
  en comparant deux nombres dont l'un n'agissait pas**. Remède à deux étages : un
  **pré-filtre** `mod_rewrite` sur la longueur annoncée, avant `mod_proxy` (28 311 552 o
  → **413 en 6 ms**, la doublure ne reçoit rien), et la borne **applicative** de Fastify,
  qui voit le corps réel. Le contrôle d'installation **envoie** désormais un corps hors
  borne et constate le refus.

  > ⚠️ **Écrit avec ce qu'il ne couvre pas, et il faut le lire ainsi** : un corps sans
  > `Content-Length`, en **`Transfer-Encoding: chunked`**, n'est **pas** borné par le
  > pré-filtre — mesuré, 28 Mio passent entiers. Le pré-filtre arrête l'envoi
  > surdimensionné *ordinaire*, **pas un client hostile qui choisit son encodage** : ce
  > n'est donc **pas** la barrière du contrôle S13, la barrière qui tient est
  > **applicative**. Le trou est un constat **reporté par écrit au lot L3**, où il se
  > ferme avec la limitation de rythme. Le dire autrement rendrait ce paragraphe aussi
  > faux que celui qu'il remplace.

- **Le registre des constats avait perdu la ligne d'un bloquant, en silence.** Treize
  barres sur une ligne au lieu de sept, deux constats collés : le tableau rendait **42
  lignes au lieu de 43**, et l'absent était **le seul bloquant d'un passage**. La cause
  était une substitution automatique, faite en fermant le constat qui disait précisément
  *qu'une case d'état vide passe inaperçue*. Réparé — et surtout **gardé** : quatre essais
  de forme (`test/documentation/`) tiennent désormais sept barres par ligne, une
  numérotation continue et sans doublon, et des cases « Propriétaire » et « État » jamais
  vides. Ils ne jugent **aucun contenu**. C'est le `CONVENTIONS.md` §24 appliqué à la
  conduite du chantier : une liste écrite à la main n'est le bon outil **que si un
  contrôle la confronte au réel** — ce tableau était la liste, il n'avait pas son contrôle.

- **Un commit peut ne pas se tenir seul, et rien ne le vérifiait.** Une quinzaine
  d'instantanés ont été figés « vérifiés et verts » en mesurant **l'arbre de travail**,
  pas le commit. L'un d'eux commitait un essai appelant une fonction restée non commitée :
  **à cette révision, il ne s'importait pas**. Le banc ne pouvait pas le voir — il
  s'exécute sur l'arbre, où les deux fichiers coexistent. La règle qui en découle vaut
  pour quiconque reprend : **« vert » qualifie une révision, jamais un répertoire de
  travail** — c'est la même exigence que le point de mesure de ce journal, et elle se
  tient en mesurant sur un export propre plutôt que dans l'arbre.

- **Trois durcissements de moindre portée, mais mesurés** : la référence d'un incident est
  désormais **engendrée par le serveur** et non proposée par le client ; `X-Request-Id`
  est **neutralisé** à l'entrée du frontal, au même titre que les cinq en-têtes de
  confiance qui l'étaient déjà ; et un contrôle refuse qu'un actif reçoive un **cache long
  sans URL versionnée** — l'invariant du bloc de cache devient exécutable au lieu d'être
  seulement énoncé.

**Ce qui n'est PAS livré, et doit être dit**

- **Aucune authentification, aucun droit** : toute session qui passe la porte peut écrire
  dans sa filiale. C'est le lot L3, et la barrière provisoire est le refus fail-closed hors
  développement.
- **Aucune écriture au journal d'audit** par l'API : c'est le lot L5. Le journal technique
  trace les écritures, il n'a pas valeur de preuve.
- **Aucune limitation de rythme**, **aucun sélecteur de filiale**, **aucune pièce jointe** :
  lots L3, L4 et L6.
- **Quatre constats sont reportés par décision écrite, et non par oubli** : le coût
  d'analyse de corps avant toute authentification et un commentaire faux dans une
  migration **déjà appliquée** (tous deux **lot L3**) ; un garde-fou qui mesure une
  **longueur** là où le `CONVENTIONS.md` §2 norme désormais une **entropie** — rien ne
  casse, mais aligner un jour le générateur SQL le ferait crier à tort (**lot L5**) ; et
  l'absence de plafond de durée ou de volume sur une reprise (**lot L7**). Cette liste
  nomme les **reports**, pas l'ensemble des constats ouverts : d'autres sont en cours de
  correction, et l'écriture des essais de fermeture en fait encore apparaître. Le compte
  se lit dans le registre, jamais ici.
- **Un cinquième est documenté sans être fermé, et c'est délibéré.** Le repli
  d'`applyImport` — emprunté seulement contre un serveur qui ne porte pas `/api/reprise`,
  donc lors d'un retour arrière — réécrit toute chaîne égale à l'identifiant renommé. Le
  fermer supposerait de savoir **quels champs sont des références** : `/api/modele` rend le
  *type* d'une colonne, jamais sa nature de référence, et les références imbriquées vivent
  dans du JSONB dont il ne dit rien. Écrire cette liste à la main fermerait le cas du jour
  et rouvrirait celui que ce chantier a déjà payé deux fois — le champ neuf que personne
  n'y ajoute. **Une fermeture partielle serait pire que le défaut** : le bandeau compte
  désormais les réécritures faites hors de l'enregistrement renommé, et le dit.
- **La famille de constats qui a le plus coûté est nommée une fois pour toutes** : le
  produit fabrique des identifiants à **cinq endroits, dans trois langages** — trois
  générateurs aléatoires et deux dérivations qui ne tirent rien —, et le durcissement de
  l'un a laissé les autres derrière, deux fois. C'est ce qui a fait réécrire le
  `backend/db/CONVENTIONS.md` §2 : il norme une **propriété** — un plancher de 52 bits
  tirés d'un générateur cryptographique — au lieu de l'encodage d'une seule
  implémentation, et recense les cinq sites. Propriétaires, échéances et **état** :
  registre des constats ouverts, `docs/PLAN_EXECUTION.md` §7.
- **Rien n'a pu être éprouvé en conditions réelles** pour l'installation Debian 13, le TLS
  et le mandataire inverse d'Apache, ClamAV, l'Active Directory ni le relais SMTP.
  *(Cette phrase a cessé d'être vraie au 7ᵉ passage : Apache et rsync sont installés et
  éprouvés — voir « la fermeture de la vague » ci-dessus. Elle est conservée telle quelle
  parce qu'elle décrit l'état à la date de cette entrée.)* Nuance :
  la **CSP et les en-têtes** du vhost, eux, l'ont été — extraits du fichier livré et
  appliqués à un Chromium. Les vérifications ont été menées sur **PostgreSQL 16.13** alors
  que la cible est **PostgreSQL 17**.

### Serveur — vague 1 : le schéma relationnel (lot L1) et son outillage
> Travail de la vague 1 terminé et **rejoué en exécution** au 31/08/2026 : migrations
> appliquées sur base neuve, tests lancés, démonstration de cloisonnement jouée.
> **La porte de sécurité S1 est franchie**, au 6ᵉ passage : « ✅ CONFIRMÉE FRANCHIE —
> 0 bloquant, 0 majeur, 6 mineurs » (`docs/PLAN_EXECUTION.md` §7, rapport
> `docs/securite/RAPPORT_S1_SEXIES.md`). Six passages, chacun mené par un auditeur qui
> n'avait écrit aucune des lignes examinées, et chacun a trouvé ce que le précédent
> avait manqué : **un auditeur unique n'aurait trouvé qu'un tiers des défauts**.
>
> Les chiffres de cette section sont ceux de la clôture de la vague 1, et **plusieurs ont
> bougé depuis** : nombre de tables et de politiques, garde-fous du schéma, contrôles de
> cloisonnement, nombre d'essais. L'état courant se lit dans la section de la vague 2
> ci-dessus et dans `backend/README.md` §8 — **jamais ici**. Cette section n'est pas mise
> à jour, elle est datée : c'est ce qui la rend utile pour comprendre *pourquoi* une
> décision a été prise, et inutilisable pour savoir *où en est* le produit.

- **Schéma métier — `002_metier_noyau.sql`** : 9 entités (clients, personnes, exigences,
  **`mesure_catalogue`**, **`mesure_mise_en_oeuvre`**, évaluations, risques, actifs,
  processus) et 5 liaisons n-n (`risque_exigences`, `actif_risques`, `processus_actifs`,
  `actif_dependances`, `evaluation_mesures`). La **scission des mesures** — la *définition*
  du contrôle d'un côté, son *évaluation dans une filiale* de l'autre — est ce qui rend les
  filiales comparables et donne un sens à la vision Groupe (`CONVENTIONS.md` §16.2).
- **Schéma des opérations — `003_metier_operations.sql`** : 13 entités (actions, incidents,
  cellule de crise, scénarios et tests PCA/PRA, MCO, prestataires, audits, revues, documents,
  traitements RGPD, correspondances, historique) et 4 liaisons, dont **`mapping_exigences`**
  (le `mappings.refs` du modèle navigateur est un objet de tableaux d'identifiants : il
  devient une table fille, pas du JSONB).
- **Suppressions portées par la base — et amendées pour le multi-filiales.** Les cascades du
  `DATA_MODEL.md` §3 ne sont plus écrites dans le code mais dans le schéma
  (`CONVENTIONS.md` §8) : une action tombe avec son exigence, son risque, son évaluation ou
  son incident ; un test PRA tombe avec son scénario ; les dépendances d'actifs sont purgées
  des deux côtés. Le chantier de rattrapage des tests orphelins n'a plus lieu d'être.
  **Mais les règles écrites pour un produit mono-filiale ont dû être amendées** : relevé dans
  `pg_constraint`, le schéma compte **43 clés étrangères en `restrict`, 27 en `cascade` et une
  seule en `set null`** (`incidents.risque_id`). En particulier **`actions.mesure_id` est en
  `restrict`, et non en `set null`** : une suppression déclenchée au niveau Groupe aurait
  réécrit les lignes de vingt filiales — incrémentant leur `version` et y inscrivant le nom de
  quelqu'un qui n'y a jamais travaillé, dans des lignes qu'il ne peut même pas lire
  (`CONVENTIONS.md` §17.6 et §18.2).
- **Un contrôle du socle déjà évalué ne disparaît plus : il s'archive.** `mesure_catalogue`
  porte un état de cycle de vie (`active` / `archivee`) et sa date. Une mesure archivée reste
  lisible et reste rattachée à tout ce qui la référence — la preuve historique survit — mais
  n'est plus proposée pour de nouvelles évaluations. C'est la seule issue qui ne détruise rien
  chez les filiales tout en laissant le Groupe faire évoluer son socle.
- **Cloisonnement — `004_rls.sql`** : **188 politiques**, Row Level Security **activée et
  forcée sur les 47 tables** (le propriétaire y est soumis comme les autres), déclencheurs
  de cohérence catalogue ↔ filiale, et garde-fous de couverture.
- **Les contrôles que PostgreSQL applique hors des politiques portent `filiale_id`.** La RLS ne
  voit ni les clés étrangères, ni les unicités : une clé simple est satisfaite par une ligne
  **invisible** de la filiale voisine, et une unicité sans `filiale_id` laisse une filiale
  occuper l'identifiant d'une autre. D'où **11 clés étrangères composites** `(référence,
  filiale_id)` et **9 unicités `uq_<parent>_id_filiale`** (`CONVENTIONS.md` §17.1 et §19.1).
- **La traçabilité est imposée à la création**, sur les **42 tables** portant `cree_par` :
  chacune reçoit un déclencheur `before insert` nommé `trg_<table>_creation` qui fixe
  `cree_le` et `cree_par`, et **ce que l'appelant envoie dans ces colonnes est ignoré**.
  Non pas une fonction, mais **trois, choisies selon la forme de la table** : 31 tables
  prennent `f_init_tracabilite`, qui fixe **en plus** `version` et remet `modifie_le` /
  `modifie_par` à vide ; les neuf tables de liaison et `sessions` prennent
  `f_init_creation`, qui s'en tient aux deux colonnes de création **parce que ces tables
  n'ont pas de `version`** ; `profil_domaines` prend `f_init_horodatage`. Sans ce
  dispositif, une ligne créée au nom d'un directeur général qu'on n'est pas — à la date
  qu'on choisit — devenait une pièce d'audit inattaquable, le gel opéré ensuite figeant la
  forgerie pour toujours (`CONVENTIONS.md` §18.1).

  > ⚠️ **Cette entrée a été corrigée après coup, sans que ses chiffres bougent.** Elle
  > annonçait « un déclencheur `before insert` fixe `version`, `cree_le` et `cree_par` », ce
  > qui était **faux pour onze des quarante-deux tables le jour même où la phrase a été
  > écrite** — les trois fonctions existaient déjà, posées quelques heures plus tôt. Le
  > défaut n'était pas le compte, qui est exact : c'était l'affirmation d'un **mécanisme
  > unique**. Un lecteur qui va vérifier un mécanisme unique le trouve, en conclut que
  > c'est couvert, et ne regarde jamais les onze tables qui font autrement. C'est aussi
  > pour cela que la couverture ne s'affirme plus : elle se **vérifie**, par
  > `f_verifier_tracabilite()`, qui exige le déclencheur, **la bonne fonction pour la
  > forme**, l'armement `always`, et refuse une clause `when`.
- **Les garde-fous du schéma sont branchés, et ils se découvrent.** `db/migrate.mjs` et
  `deploy/install.sh` appellent **`f_verifier_schema()`**, et elle seule : un **point d'appel
  unique** qui trouve ses contrôles dans le catalogue au lieu de les réciter. Un garde-fou neuf
  respectant la convention d'écriture (`f_verifier_<x>()`, sans argument, rendant
  `(objet, anomalie, detail)`) arrive donc sur le déploiement **sans qu'aucun fichier de
  déploiement change**. Sept sont branchés à la clôture de cette vague — le compte courant se
  lit dans `backend/README.md` §5, et il a augmenté depuis **sans qu'un seul fichier de
  déploiement change**, ce qui est la démonstration attendue. Nouveau **code de sortie 7** de
  `migrate.mjs` : « migrations passées, schéma non conforme » (`CONVENTIONS.md` §19.4, §19.5).
- **`db/verifier_cloisonnement.sql`** : la démonstration jouable devant un auditeur —
  **93 contrôles**, deux filiales montées puis annulées par un `rollback` (le script n'écrit
  rien de durable). Joué avec `grc_app` : **93 réussis, 0 échec**. Il **n'est appelé par aucun
  chemin d'installation, et c'est délibéré** : c'est un geste de **recette**, avant mise en
  service puis annuellement, au même titre que le test de restauration des sauvegardes — il
  sème des données de démonstration et éprouve un *comportement*, là où les garde-fous du
  schéma lisent des *déclarations* (`CONVENTIONS.md` §18.5).
- **`db/migrate.mjs`** : l'exécuteur de migrations qu'`install.sh` appelait depuis le lot L0
  **sans qu'il existe**. Ordre déterministe (un nom hors convention échoue au lieu d'être
  ignoré), connexion imposée au compte propriétaire, empreinte SHA-256 mémorisée à
  l'application — une migration retouchée après coup arrête le programme au lieu de produire
  deux bases divergentes. `--verifier`, `--jusqu-a`, codes de sortie documentés.
- **`db/dev/preparer_base_dev.sh`** : base de développement et de recette, idempotente,
  refusant de tourner sous `NODE_ENV=production`.
- **Banc d'essai — 306 tests `node:test`, 0 échec** : **229 sur la base** (socle, journal en
  ajout seul et chaînage, verrouillage optimiste, RLS, privilèges, garde-fous du schéma) et
  **77 sur la reprise**. Chaque fichier de test monte une base neuve **en appelant le vrai
  `db/migrate.mjs`** : l'outil de migration est éprouvé en même temps que le schéma.
- **Reprise des exports `grc-backup` (`src/reprise/**`)** : portage serveur des migrations
  **v1 → v12** et lecture d'enveloppe, en vue d'absorber l'export d'une société rachetée quelle
  que soit son ancienneté. Module **pur** (ni base, ni disque, ni horloge), qui ne lève jamais :
  il rend un statut et un rapport. Round-trip exact des identifiants, scission des mesures à la
  reprise, refus explicite d'une enveloppe chiffrée, entrées hostiles bornées en profondeur et
  en nombre de nœuds.
- **Déploiement — correction majeure** : une installation antérieure laissait la base au compte
  du service. Cela annulait la **quatrième couche** de l'inaltérabilité du journal (seul le
  propriétaire peut `alter table … disable trigger`) : une API compromise aurait pu désarmer les
  déclencheurs et réécrire le journal. `install.sh` vérifie désormais la propriété et **échoue**
  si elle n'est pas la bonne, avec `--reprendre-propriete` pour rattraper l'existant. Ajout du
  durcissement Apache de portée serveur (`deploy/apache/durcissement-global.conf`).
- **Ce qui n'est PAS livré à la clôture de cette vague, et doit être dit** : aucune API,
  aucune authentification, aucun droit appliqué — le serveur n'expose alors que son point de
  santé, et la bascule de la persistance de la SPA n'est pas commencée. *(L'API et la bascule
  sont livrées par la vague 2, ci-dessus ; l'authentification reste le lot L3.)* **Rien n'a
  pu être éprouvé** en conditions réelles pour l'installation Debian 13, Apache, ClamAV,
  l'Active Directory ni le
  relais SMTP : ces environnements n'existent pas sur la machine de développement. Les
  vérifications ci-dessus ont été menées sur **PostgreSQL 16.13** alors que la cible est
  **PostgreSQL 17**.
- **Dette explicitement reportée, datée, et non refermée par cette vague** — le détail et les
  échéances sont dans `backend/README.md` §8 :
  - les tables du substrat d'authentification (`sessions`, `session_filiales`,
    `session_domaines`) restent **écrivables sans condition** par le rôle applicatif — c'est
    circulaire et assumé, et c'est une **condition d'entrée du lot L3** (`CONVENTIONS.md` §17.4) ;
  - **la lecture du journal d'audit n'est pas cloisonnée** : dérogation qu'impose le chaînage
    par empreinte, sans effet tant que le journal est vide, mais dont le resserrement est un
    **livrable ferme du lot L5** ;
  - `UPDATE 0` ne distingue pas « ligne absente », « version périmée » et « écriture refusée
    par la RLS », alors que `GRC03` se définit sur ce zéro : **à traiter dans la conception du
    lot L2**, sous peine d'annoncer « modifié entre-temps, rechargez » à qui n'avait pas le
    droit d'écrire ;
  - la **colonne engendrée** `portee_groupe` de `documents` impose que toute insertion nomme
    ses colonnes : contrainte à respecter par **L2** et **L7** (`CONVENTIONS.md` §18.6) ;
  - un compte ou une filiale cité au journal devient **structurellement indestructible** : la
    purge de sortie de filiale reste à écrire au **lot L13**.

### Outillage — skill Claude Code `ui-ux-pro-max`
- Installation de la skill **`ui-ux-pro-max` v2.13.0** (MIT) dans `.claude/skills/ui-ux-pro-max/` :
  base de connaissances UI/UX **locale et interrogeable** (119 règles UX/accessibilité, 79 styles,
  192 palettes, 74 appariements typographiques, 105 icônes, 25 types de graphiques, 22 stacks).
- **Aucune dépendance et aucun accès réseau** : moteur de recherche BM25 en Python pur (stdlib),
  données en CSV embarquées → compatible avec la contrainte « full frontend, rien ne sort de la machine ».
  Le code de la skill est un outil d'aide à la décision pour l'agent ; il ne modifie pas l'application.
- Adaptation à une installation « skill projet » : les chemins d'appel de `scripts/search.py`
  documentés dans `SKILL.md` (variable `${CLAUDE_PLUGIN_ROOT}`, propre au mode plugin) sont remplacés
  par le chemin relatif à la racine du dépôt. Fixtures de test amont non embarquées.
- Vérifié : recherche par domaine (`ux`), par stack (`html-tailwind`), mode `--design-system`
  et `validate_data.py` (12 fichiers de domaine + 22 fichiers de stack OK).
- Documentation : mode d'emploi et garde-fous (charte Dedienne prioritaire) dans `CLAUDE.md` §5.

---

> ## ⚠️ Tout ce qui suit décrit le produit **100 % navigateur**, avant la bascule serveur
>
> Ces entrées sont **datées et exactes pour leur date** : elles disent ce qu'un chantier a
> livré, le jour où il l'a livré, et c'est à ce titre qu'on les garde — c'est là qu'on
> retrouve *pourquoi* un module est fait comme il est. Elles ne décrivent **pas** l'état
> actuel du produit.
>
> Ce qui a changé depuis, et qu'il ne faut pas aller chercher plus bas : les données
> vivent sur le **serveur** (PostgreSQL) et non plus dans IndexedDB ; le **miroir
> `localStorage`**, les **points de restauration locaux**, le **coffre de chiffrement** et
> la **gestion du quota** ont été retirés ; l'export `grc-backup` est devenu un **format
> d'échange**, plus une sauvegarde. Voir les sections « vague 1 » et « vague 2 » ci-dessus,
> `backend/README.md` §8, et `docs/DATA_MODEL.md` §1.
>
> ⚠️ **Et une mise en garde qui vaut pour la quasi-totalité des entrées ci-dessous : les
> « tests headless (Playwright) » qu'elles annoncent n'ont jamais été versionnés.**
> Vingt-trois entrées les mentionnent ; la porte de sécurité S2 a constaté qu'il n'en
> existait **aucun dans le dépôt** — `grep -rl playwright` ne rendait rien hors
> `node_modules` —, alors que `CLAUDE.md` §5 les impose depuis le début du projet. Ils
> avaient bien été écrits et joués, dans un répertoire de travail, puis jetés. Une
> assertion de test qui n'est pas versionnée ne protège de rien : personne ne peut la
> rejouer, et elle ne s'oppose à aucune régression. C'est la raison pour laquelle les
> essais navigateur **vivent désormais dans le dépôt** (`backend/test/navigateur/`, joués
> par `npm test`) — et six constats de S2, dont ses trois bloquants, ne se voyaient que là.
>
> **Trois entrées ci-dessous portent une note d'errata**, signalée par un ⚠️ à l'endroit
> exact — la centralisation des identifiants, l'échappement XSS, l'édition des
> correspondances —, et une quatrième dans la section « vague 1 » plus haut. Ce sont
> celles dont la *phrase sur le mécanisme* s'est révélée fausse : soit après coup, soit
> dès le jour où elle a été écrite. Le chiffre et le fait livré n'y sont pas touchés ;
> seule l'affirmation l'est. **Un journal se corrige de cette façon, pas en se
> réécrivant** — effacer la phrase fausse effacerait aussi la trace de ce qu'elle a coûté.

### Référentiels — plusieurs mesures de sécurité par exigence (schéma v12)
- **Une exigence peut désormais être couverte par PLUSIEURS mesures** (ex. une question AirCyber = MFA
  **+** IAM **+** journalisation). Le lien unique `evaluation.mesure_id` devient un tableau
  **`evaluation.mesure_ids[]`**. **Migration transparente** (l'ancienne valeur → tableau à 1 élément),
  round-trip vérifié → **rien de cassé**.
- **UI référentiel** : le `<select>` mesure unique devient une **liste de chips** (mesures liées, retirables)
  + « ＋ Ajouter une mesure… » + « ＋ Nouvelle ». Le plan d'action de **chaque** mesure liée s'affiche.
- **Propagation « au plus défavorable »** (`propagateMesure` → `aggregateFromMesures`) : une exigence
  couverte par plusieurs mesures prend le **statut le plus faible** (conforme **seulement si toutes**
  ses mesures le sont) et la **maturité la plus basse**. « Non applicable » est neutre (retenu seulement
  si toutes le sont) ; « non évalué » est ignoré.
- **Intégrité** : `addMesureToEvaluation`/`removeMesureFromEvaluation` (ajout sans écraser, dédoublonné) ;
  `getEvaluationsByMesure` teste l'appartenance au tableau ; `deleteMesure` retire l'id de tous les
  `mesure_ids[]`. Couverture croisée, SoA et module Correspondances adaptés (relier un groupe **ajoute**
  la mesure sans remplacer les mesures déjà liées).
- Tests Playwright (**16 assertions, 0 erreur**) : migration v11→v12 + round-trip, helpers n-n, dédoublonnage,
  **5 cas de propagation au plus défavorable** (A+B, A+C, A+N/A, N/A seul, A seul), `deleteMesure`, UI
  ajout/retrait de chips, couverture. Non-régression : Mesure↔action (20) + Personnel (17+16) + statut
  création (12) + MCO (44) + Échéancier (34) + extensions (28).

### Personnel — Phase 2 : champs multi-personnes + lien Cellule de crise
- **Champ multi-personnes réutilisable** (`UI.multiPersonHtml` / `wireMultiPerson` / `getMultiPerson`) :
  sélecteur en **chips**, adossé à l'annuaire (autocomplétion) et acceptant la saisie libre. Appliqué
  aux **Participants d'une revue de direction** (auparavant une zone de texte). **Stockage inchangé**
  (une personne par ligne) → rétrocompatible : les anciens participants se reconstituent en chips à
  l'ouverture, doublons ignorés (insensible à la casse).
- **Lien annuaire ↔ Cellule de crise** : le champ **Nom** d'un membre de la cellule est branché sur
  l'annuaire (autocomplétion) et **pré-remplit téléphone/email** depuis la fiche annuaire quand on
  choisit une personne connue (sans écraser une valeur déjà saisie).
- **Fiche personne enrichie** : la section « Affectations » liste désormais aussi l'**appartenance à la
  Cellule de crise** (avec le rôle) et la **participation aux revues de direction**.
- Tests Playwright (**16 assertions, 0 erreur**) : widget multi-personnes (ajout/retrait/dédoublonnage/
  enregistrement/réouverture), autocomplétion + auto-remplissage crise (sans surcharge), affectations
  crise + revue. Non-régression : Personnel (17) + statut création (12) + Mesure↔action (20) + MCO (44)
  + Échéancier (34) + extensions (28).

### Personnel — annuaire des personnes/rôles réutilisé partout (schéma v11, Phase 1)
- **Nouveau module `/personnel`** (« Personnel », entrée de menu après « Donneurs d'ordre ») : annuaire
  CRUD des personnes/rôles (**nom, fonction, service, email, téléphone, notes**). Nouvelle entité
  `personnes` (**schéma v11**, `normalize` crée le tableau vide, rétrocompatible).
- **Autocomplétion partout** : un `<datalist>` partagé (`#personnes-list`, peuplé à chaque navigation)
  branche les personnes de l'annuaire sur **tous les champs « Responsable »/« Propriétaire »/«  Auditeur »**
  du logiciel — Actions, Mesures, Exigences, Actifs, BIA, MCO, RGPD, Risques, Documents (propriétaire),
  Audits (auditeur/audité). **On peut toujours saisir un nom hors annuaire** : les entités continuent de
  stocker le nom en **texte** → **aucune rupture** avec les données existantes.
- **Fiche personne = « où c'est affecté »** : la fiche agrège, par correspondance de nom, **tout ce à quoi
  la personne est rattachée** (actions, mesures, exigences, actifs, processus, MCO, documents, audits,
  traitements RGPD), avec liens cliquables → on la retrouve partout.
- **Suppression non destructive** : retirer une personne de l'annuaire **ne modifie pas** les responsables
  déjà saisis dans les fiches (ce sont des chaînes) ; seule la suggestion disparaît.
- 100 % frontend, tokens, `escapeHtml`, `Help.tip`, helpers `UI.*`. Tests Playwright (**17 assertions,
  0 erreur**) : entité + `getPersonneNames` trié, migration v10→v11 + round-trip v11, module liste/création,
  datalist peuplé après navigation, champs Responsable/Propriétaire reliés (mesure, MCO, document),
  affectations (action + mesure), suppression non destructive. Non-régression : statut création (12),
  Mesure↔action (20), MCO (44), Échéancier (34), extensions (28).
- **Phase 2 possible** (non incluse) : champs multi-personnes (Participants de revue), lien vers la
  Cellule de crise, éventuel passage optionnel à des identifiants.

### Plan d'actions — statut sélectionnable dès la création (cohérent sur tous les formulaires)
- Le **statut** de l'action (À faire / En cours / Terminée) était déjà visible et modifiable partout
  (badge dans les blocs, sélecteur sur la fiche action) **mais figé à « à faire » à la création**.
  Il est désormais **choisissable dès la création** — utile pour consigner une action déjà lancée
  ou déjà réalisée.
- Ajouté de façon **homogène sur les 5 formulaires de création d'action**, pour éviter toute
  incohérence : bloc **Plan d'action** de la fiche Mesure, bloc **Actions correctives** d'une exigence
  de référentiel, fiche **Exigence**, fiche **Risque**, fiche **Incident**. Même jeu de valeurs
  (`à faire` / `en cours` / `terminée`), **défaut « À faire »** conservé.
- Aucun changement de schéma. Tests Playwright (**12 assertions, 0 erreur**) : présence du sélecteur
  et statut correctement enregistré sur les 5 formulaires + défaut « à faire » préservé.
  Non-régression Mesure↔action (20) + MCO (44) + Échéancier (34) + extensions (28).

### Référentiels ↔ Plan d'actions — chaînon manquant : plan d'action sur le pivot « Mesure »
- **Nouveau lien `action.mesure_id`** (champ optionnel, rétrocompatible, aucun changement de schéma) :
  une action du plan d'actions peut désormais être **rattachée directement à une mesure de sécurité**
  (le pivot). Une action sur la mesure vaut pour **toutes les exigences** que la mesure couvre — même
  esprit « zéro double saisie » que la propagation.
- **Bloc « Plan d'action » sur la fiche Mesure** (`/mesures/:id`) : liste des actions de remédiation
  + formulaire *« Planifier une action »* (intitulé, priorité, responsable, échéance). L'action rejoint
  le plan d'actions global, tracée jusqu'à la mesure.
- **Chaîne rendue visible côté exigence** : dans le **Détail** d'une exigence reliée à une mesure, le
  plan d'action **de la mesure** s'affiche (lecture seule + lien vers la fiche mesure), à côté du bloc
  « Actions correctives » par-exigence déjà existant (conservé pour les exigences sans mesure).
- **Traçabilité dans le plan d'actions** : la colonne « Traçabilité » et la fiche action affichent
  désormais *« Mesure : … »* avec lien, comme pour exigence / risque / incident.
- **Intégrité** : `DataStore.getActionsByMesure(id)` ; à la **suppression d'une mesure**, les actions
  liées sont **déliées** (`mesure_id → null`) et **conservées** dans le plan (non destructif), exactement
  comme le sont déjà les évaluations.
- Tests Playwright (**20 assertions, 0 erreur**) : `getActionsByMesure`, bloc Plan d'action (affichage +
  création UI avec champs), traçabilité liste/fiche action, chaîne exigence→mesure→action dans le Détail
  du référentiel (bloc par-exigence conservé), délien à la suppression. Non-régression MCO (44) +
  Échéancier (34) + extensions (28).

### Échéancier — extensions : calendrier, exports Excel/.ICS, panneau tableau de bord
- **Vue calendrier mensuel** : bascule **Liste / Calendrier** dans l'Échéancier. Grille du mois
  (semaine débutant le lundi) où chaque échéance datée apparaît sous forme de **pastille colorée par
  urgence** sur son jour, cliquable vers sa fiche ; navigation mois précédent / suivant / « Aujourd'hui »,
  cellule du jour mise en évidence, mention des échéances sans date (visibles en liste).
- **Export Excel (.xlsx)** : bouton « Excel » — classeur d'une feuille « Échéancier » (Type, Intitulé,
  Détail, Échéance, Jours restants, Urgence, Statut) via SheetJS déjà embarqué.
- **Export Agenda (.ICS)** : bouton « Agenda (.ics) » — génère un fichier iCalendar (un événement
  « journée » par échéance datée, `SUMMARY` typé) importable dans Outlook / Google Agenda.
- **Panneau « Prochaines échéances » sur le tableau de bord** : dans la section *Suivi & échéances*,
  une carte condensée liste les 7 échéances datées les plus urgentes (tous modules), avec badge
  « N en retard » et bouton « Voir tout l'échéancier ». Réutilise le même agrégateur `window.Echeances`.
- Tests Playwright (**28 assertions, 0 erreur**) : panneau du dashboard (items, badge, navigation),
  calendrier (grille, jour courant, pastilles, navigation de mois), exports (`buildRows` = 10 lignes,
  `buildICS` = 1 VEVENT par échéance datée, génération Excel via SheetJS). Non-régression Échéancier
  (34) et MCO (44).

### Échéancier — vue consolidée de toutes les échéances du logiciel
- **Nouveau module `/echeances`** (« Échéancier », entrée de menu dans la section *Pilotage*, après
  « Synthèse Direction ») : **vue transversale** qui recense en un seul endroit toutes les obligations
  datées du dispositif, jusqu'ici éparpillées dans 6 modules.
- **Sources agrégées** : échéances du **plan d'actions** (actions non terminées), **actions MCO**
  (date programmée), **revues documentaires** (prochaine revue, ou statut « à réviser »/« obsolète »),
  **déclarations d'incidents** (délai réglementaire NIS2/RGPD = détection + 72 h), **audits** planifiés
  ou en cours, et **revues de direction** à venir.
- **Regroupement par urgence** : *En retard · Aujourd'hui · Cette semaine · Ce mois-ci · Plus tard ·
  Sans date*, avec pastilles de couleur sémantique (rouge = en retard, orange = proche) et **compteurs**
  en tête (en retard / sous 7 jours / ce mois-ci / total).
- **Chaque ligne renvoie vers sa fiche d'origine** (traçabilité) ; **filtres** par type d'échéance,
  case « urgents seulement (≤ 7 j) » et **recherche** ; **impression** (feuille datée dédiée).
- **Vue rapide *partout*** : un **badge compteur** d'échéances en retard s'affiche sur l'entrée
  « Échéancier » de la barre latérale, **visible depuis n'importe quelle page** (rafraîchi à chaque
  navigation).
- **Aucun changement de schéma** : nouveau **service en lecture seule** `js/services/echeances.js`
  (`window.Echeances`) qui ne fait que **lire** le DataStore et **dériver** les échéances des dates
  existantes — les règles « en retard / proche » reproduisent celles déjà en place (MCO, revues
  documentaires, délais d'incidents). 100 % frontend, tokens, `escapeHtml`, `Help.tip`, responsive.
- Tests Playwright (**34 assertions, 0 erreur**) : agrégation des 6 sources (exclusions comprises :
  action terminée, MCO réalisée, audit réalisé, revue passée), calcul du délai incident +72 h,
  compteurs et regroupement par urgence, badge de la barre latérale, filtres type/urgents/recherche,
  navigation d'une ligne vers sa fiche.

### Actions Préalables (MCO) — modèle de suivi d'action planifiée (schéma v10)
- **Refonte des champs** du module `/mco` : passage de l'ancien modèle « vérification récurrente »
  (`etat` OK/KO, `date`, `notes`) à un **modèle de suivi d'action planifiée**, inspiré d'un tableau
  de suivi d'actions et optimisé. Nouveaux champs de saisie :
  **Définition de l'action** (libellé), **Description détaillée**, **Responsable**, **Priorité**
  (Basse→Critique), **Fréquence** (Ponctuelle / Hebdo → Annuelle), **Statut**
  (À planifier / En cours / Réalisée / Annulée), **Date programmée**, **Date de réalisation**,
  **Date de clôture**, **Avancement %** (curseur) et **Commentaire / suivi**.
- **Indicateur « En retard » dérivé** (non stocké) : date programmée dépassée alors que l'action
  n'est ni réalisée ni annulée → badge rouge dans la liste, bandeau d'alerte, badge dans l'entête
  de la fiche. Source unique `PraMcoModule.isEnRetard(m)`, **réutilisée par le tableau de bord**
  (la tuile « Actions MCO » affiche désormais *« N en retard »* / *« Planning tenu »* au lieu de
  l'ancien décompte OK/KO).
- **Automatismes de cohérence** : passer au statut « Réalisée » force l'avancement à 100 % et
  complète les dates de réalisation/clôture (à la date du jour si vides) ; le curseur d'avancement
  se synchronise en direct avec son étiquette.
- **Migration transparente v9 → v10** (dans `normalize`, idempotente) : `etat:"OK"` → `Réalisée`
  + 100 % ; `etat:"KO"` → `En cours` ; `date` → `dateReelle` ; `notes` → `commentaire` ; anciennes
  clés purgées. **Aucune perte de donnée** (vérifié par import d'un ancien fichier de sauvegarde).
- Conventions respectées : tokens Dedienne, `escapeHtml` sur toute donnée, `Help.tip` (concept MCO,
  date programmée vs réelle, statut, avancement, fréquence), helpers partagés `UI.*`. Correctif CSS :
  les pastilles `.status` ne passent plus à la ligne (`white-space: nowrap`).
- Tests Playwright (**44 assertions, 0 erreur**) : migration depuis un backup v9, round-trip v10
  idempotent, création/édition/suppression via l'UI, auto-complétion « Réalisée », logique et rendu
  « en retard », mise à jour de la tuile du tableau de bord.

### Cartographie du SI & dépendances entre actifs (schéma v9)
- **Nouveau module `/cartographie`** (entrée menu « Cartographie », après « Actifs critiques ») :
  graphe SVG « fait maison » (même recette que la matrice EBIOS : formes + texte, **export PNG/SVG**
  via canvas, sans dépendance) représentant les actifs et leurs **dépendances typées**.
- **Lien actif → actif** (seul ajout au modèle : champ `actif.dependances[] = { to, type }`,
  rétrocompatible, **schéma v9** — `normalize` garantit le tableau, aucune transformation de données).
  **4 types de liens** : `dépend de`, `hébergé sur`, `alimenté par` (flux de données), `sauvegardé par`.
  Édités depuis la **fiche de chaque actif** (formulaire type + cible, liste retirable, colonne
  « en dépendent »), enregistrés avec « Mettre à jour ».
- **Layout en couches déterministe** (rang = profondeur de dépendance ; processus métier BIA en haut,
  socle/infrastructure en bas ; robuste aux cycles) — pas de moteur de physique, rendu reproductible
  et exportable proprement.
- **Niveau 3 — analyse d'impact** : clic sur un nœud → **rayon d'impact** par propagation transitive
  (actifs + processus en aval, dont critiques, RTO), et **détection des SPOF** (points de défaillance
  unique : ≥ 2 processus critiques en dépendent → badge + panneau). Le lien **sauvegardé par NE propage
  PAS** une panne de disponibilité (dépendances typées).
- **Filtres** : recherche, type d'actif, criticité, affichage des processus, masquage des actifs isolés.
- **Cascade** : `deleteActif` purge désormais aussi les `dependances` des autres actifs pointant vers
  l'actif supprimé (plus d'arêtes orphelines).
- Conventions respectées : tokens Dedienne, `escapeHtml` sur toute donnée, `Help.tip` (SPOF, propagation,
  types de liens), périmètre global. Tests Playwright : rendu (11 nœuds / 12 arêtes), SPOF exact
  `[ERP, BDD, AD]`, impact AD (4 actifs / 3 processus / 2 critiques), filtres, export SVG, **round-trip v9**,
  **cascade**, édition depuis la fiche (ajout/retrait/persistance) — **0 erreur**.

### Audits — modèles NIS2, DORA et AirCyber (modèles d'audit sur tous les référentiels)
- **NIS2** (`audit_nis2.js`) : **11 points de contrôle** couvrant les 10 mesures de l'article 21
  (a→j) + un point sur la responsabilité de l'organe de direction (art. 20). Rappelle les délais
  de notification NIS2 (24 h / 72 h / 1 mois).
- **DORA** (`audit_dora.js`) : **15 points de contrôle**, un par mesure des 5 piliers (gestion du
  risque TIC, incidents, tests de résilience, risque lié aux tiers, partage d'information).
- **AirCyber** (`audit_aircyber.js`) : **234 points de contrôle**. AirCyber étant déjà un
  questionnaire d'audit détaillé, le modèle est **dérivé automatiquement** de ses 234 questions
  (nouveau mécanisme `AuditModeles.registerDerived`) : chaque question devient un point de contrôle
  avec une consigne d'audit et une invite de preuve — pas de double saisie.
- **Tous les référentiels de l'app disposent désormais d'un modèle d'audit** : ANSSI, ISO 27001
  (management + Annexe A + composite complet), NIS2, DORA, AirCyber — soit **7 modèles** au menu
  de génération. Tests Playwright (11 assertions, 0 erreur ; grilles 11/15/234, rendu UI).

### Audits — modèle ISO/IEC 27001:2022 (système de management + Annexe A) + composites
- **Nouveau référentiel « ISO/IEC 27001:2022 — Système de management » (chap. 4-10)** :
  `js/data/ref_iso27001_smsi.js`, **30 exigences** du SMSI réparties en 7 chapitres (contexte,
  leadership, planification, support, fonctionnement, évaluation, amélioration). Comble un manque :
  l'app ne représentait qu'**l'Annexe A** ; or un audit clause 9.2 vérifie d'abord ces exigences de
  management. Référentiel « normal » : browsable, auto-évaluable, radar, SoA, couverture, mapping.
  Gardé **séparé** de l'Annexe A (les chapitres 4-10 sont obligatoires — pas d'applicabilité à déclarer).
- **Modèles d'audit ISO livrés** : `audit_iso27001_smsi.js` (**143 points de contrôle** pour le SMSI —
  chaque clause est éclatée en **sous-exigences fines** `4.1a`… `6.1.2j`… au niveau de chaque « shall »
  et sous-alinéa de la norme) et `audit_iso27002.js` (**93 points**, un par mesure de l'Annexe A).
- **Granularité portée par l'audit** : `buildGrid` accepte un **sous-code / intitulé par point**
  (`{ code, intitule, ctrl, preuve }`) ; le référentiel `iso27001-smsi` reste, lui, au niveau des 30
  clauses (auto-évaluation lisible), tandis que l'audit descend au « shall ». Rétrocompatible.
- **Modèles d'audit COMPOSITES** : nouveau mécanisme `AuditModeles.registerComposite(id, {nom, sources})`
  — un modèle « virtuel » qui concatène plusieurs modèles sources. Premier composite livré :
  **« ISO/IEC 27001:2022 — Audit complet (SMSI + Annexe A) » = 236 points de contrôle** en une seule
  grille (143 sous-exigences de management + 93 mesures de l'Annexe A) — soit **les 236 exigences**
  de la norme, à la maille des guides de référence. `buildGrid` / `countPoints` / `available` /
  `nameOf` résolvent les composites.
- **Fidélité** : reformulations maison, texte ISO **non reproduit** (norme protégée). Les 143
  sous-exigences de management décomposent chaque « shall » et sous-alinéa des chapitres 4 à 10 ;
  avec les 93 mesures de l'Annexe A, la couverture atteint **236 exigences**, sans rien omettre.
- Tests Playwright : SMSI 17 assertions + ISO complet 13 assertions, **0 erreur** (référentiel chargé,
  grilles 31/93/124, composite, rendu UI, persistance, intégration section Référentiels).

### Audits — modèles d'audit générés depuis les référentiels (ANSSI)
- **Nouveau : grille d'audit sur référentiel** dans le module `/audits`. À la création/édition d'un
  audit interne, un sélecteur permet de choisir un référentiel puis de **générer une grille de points
  de contrôle détaillés** couvrant l'intégralité de ses exigences : pour chaque point, *ce que
  l'auditeur doit vérifier* + *les preuves à demander*. L'auditeur qualifie chaque point (Conforme,
  Point fort, Piste d'amélioration, NC mineure, NC majeure, N/A) et saisit la preuve observée.
- **Premier modèle livré : Hygiène informatique ANSSI (42 mesures → 46 points de contrôle)**,
  reformulations maison fidèles à l'intention du guide public (aucun texte de norme recopié).
- **Catalogue statique extensible** : nouveau registre `js/data/audit_modeles.js` (`AuditModeles`,
  `register` / `buildGrid` / `available`) + un fichier de contenu par référentiel (`audit_anssi.js`).
  La grille est **croisée à la volée** avec le registre `Referentiels` (domaine + intitulé + aide) —
  zéro double saisie des titres. Suite prévue : ISO 27001, NIS2, DORA, AirCyber.
- **Couverture & conformité en direct** : KPI dans la fiche (X/N points évalués, conformes, NC, N/A,
  **taux de conformité** = conformes ÷ applicables, N/A exclues) + barre de progression ; colonne
  **Modèle (couverture)** dans la liste des audits.
- **Rapport PDF enrichi** : le rapport imprimable inclut un tableau de synthèse de conformité puis la
  grille **groupée par domaine** (badges colorés + preuves observées). Les **constats libres**
  historiques restent disponibles (section dédiée, hors grille).
- **Cockpit tenu à jour** : le tableau de bord et la Synthèse comptent désormais les non-conformités
  issues de la grille (mineure/majeure) en plus des constats libres.
- **Rétrocompatible, sans évolution de schéma** : deux champs optionnels sur l'entité `audits`
  (`ref_id`, `items[]`), portés par la sauvegarde unifiée (IndexedDB, chiffrement, export/import,
  points de restauration). Les audits existants restent des « audits libres ». Échappement XSS
  conservé. Tests Playwright (19 assertions, 0 erreur : génération 46 points, saisie, persistance
  après rechargement, rapport PDF).

### Correction — le référentiel « ISO 27002 » devient « ISO/IEC 27001:2022 »
- **Notion corrigée** : le référentiel des 93 mesures était présenté comme *ISO/IEC 27002:2022*.
  Or ces mesures sont celles de l'**Annexe A d'ISO/IEC 27001:2022**, la norme **certifiable** du
  SMSI, et c'est bien contre l'ISO 27001 qu'on établit la **déclaration d'applicabilité (SoA)**
  générée par l'application. Le détail de mise en œuvre de ces mesures, lui, relève de l'ISO 27002.
- **Corrigé partout où c'est visible** : nom, version (« Annexe A · 93 mesures »), description et
  aide du référentiel (`ref_iso27002.js`) ; étiquette de colonne et infobulles du module
  **Correspondances** (`mapping.js`), tooltip **Référentiels** (`referentiels.js`), note de la
  **Synthèse** (`synthese.js`), commentaires du catalogue de correspondances (`mappings.js`) et
  documentation (`CLAUDE.md`, `docs/PLAN.md`, `docs/DATA_MODEL.md`).
- **Sans impact sur les données** : l'**identifiant technique reste `iso-27002-2022`** (et le nom
  de fichier `ref_iso27002.js` est inchangé). Cet id est la **clé** des évaluations
  (`evaluations[].ref_id`) et des correspondances (`data.mappings[].refs`) déjà enregistrées dans
  le navigateur ; le chargement depuis IndexedDB n'appliquant aucune migration de contenu, le
  renommer aurait rendu ces données orphelines. Aucune évolution de schéma.
- **Non touché** : le texte d'une question du questionnaire **AirCyber** cite « ISO 27001/27002 »
  comme exemples de cadres — contenu réel du référentiel, conservé tel quel.

### Synthèse Direction — refonte en tableau d'arbitrage (KPI / KRI + rapport)
- **Refonte complète du module `/synthese`** : d'une note à 3 chiffres vers un véritable
  **support de décision pour la direction** (COMEX / conseil), pensé pour *arbitrer* et pas
  seulement observer. Aucune évolution de schéma (lecture seule du DataStore).
- **Indice de posture cyber (0-100)** : note composite avec **jauge** et bande de lecture
  (Critique → Optimale) = moyenne pondérée des composantes disponibles (**conformité 30 %,
  maturité 20 %, maîtrise du risque 25 %, avancement 10 %, couverture 15 %**), renormalisée sur
  les composantes présentes, **moins des pénalités** (risques très critiques, déclarations
  réglementaires en attente). Décomposition affichée + note de méthode via `Help.tip`.
- **Bandeau d'orientation exécutive** : titre + message de synthèse priorisé (déclaration
  réglementaire › risque très critique › retards › risques critiques › conformité). En base
  vierge, message **honnête** « Démarche GRC à initialiser » (plus de « posture maîtrisée » trompeuse).
- **6 KPI** (performance) avec **variation de tendance** colorée : conformité, maturité CMMI,
  avancement du plan d'actions, couverture du dispositif (12 capacités GRC), audits réalisés /
  NC ouvertes, documentation à jour.
- **8 KRI** (risque) avec **seuils d'alerte** (pastille verte/orange/rouge + statut « Sous
  contrôle / À surveiller / Seuil d'alerte ») : exposition résiduelle, risques très critiques,
  risques critiques, actions en retard (avec retard max), incidents ouverts/graves, **déclarations
  NIS2/RGPD en attente**, tiers à risque élevé (criticité × accès), non-conformités.
- **Sections d'aide à la décision** : courbes d'**évolution** (historique quotidien partagé avec
  le tableau de bord), **conformité réglementaire par référentiel** (ANSSI/ISO/NIS2/DORA/AirCyber
  avec posture d'obligation), **Top 5 risques résiduels** + état de traitement, **comparatif par
  donneur d'ordre**, **arbitrages & décisions attendus** générés depuis les données (budget,
  acceptation de risque, tiers, continuité, maturité…), **points de vigilance & échéances**.
- **Impression & téléchargement du rapport** : impression PDF native (mise en page dédiée) **et**
  **téléchargement d'un rapport HTML autonome** (hors-ligne, sans dépendance, marque Dedienne,
  bulles d'aide masquées) — le module **embarque sa propre feuille de style** (portée `.syndir`)
  pour un rendu identique à l'écran, à l'impression et dans le fichier exporté.
- **Graphiques 100 % maison** (jauge, anneau, sparklines, barres) en SVG/HTML sans librairie.
- **Tests headless (Playwright)** : jeu de données riche (jauge, 6 KPI, 8 KRI, 5 référentiels,
  Top 5 risques, 8 décisions, vigilance) + **téléchargement du rapport** (fichier valide, autonome,
  sans boutons de navigation, rendu dans un onglet neuf sans erreur) + **état vide** (bandeau
  honnête, aucune division par zéro) + **rendu impression** ; **0 erreur console**.

### Référentiels — AirCyber : radar par niveau de label + score Oui/Non (sans CMMI)
- **Radar granulaire par niveau de label** : sur la fiche AirCyber, des boutons
  **Global / Bronze / Argent / Or** au-dessus du radar restreignent le profil par domaine CL
  aux seules questions du niveau choisi (« suis-je prêt pour le label Bronze ? »). Le tracé
  prend la **teinte du niveau** (bronze, argent, or ; bleu structure pour Global), le bouton
  actif aussi, et une note sous le graphique indique le nombre de questions représentées
  (66 Bronze, 57 Argent, 33 Or, 156 au global). La vue de niveau est **conservée** lors des
  mises à jour temps réel ; la fiche s'ouvre toujours sur Global.
- **Fin des scores CMMI pour AirCyber** (`scoring: "conformite"` dans le catalogue) : le
  questionnaire se répond désormais uniquement par **Oui / Non / N-A** (colonnes « Question »
  / « Réponse », colonne et sélecteur **Maturité supprimés** pour ce seul référentiel).
  **Score de conformité = réponses « Oui » ÷ questions applicables** : les **N/A sont exclues
  du calcul**, une question non répondue compte comme « Non » (même règle que le panneau
  « préparation au label »). KPIs adaptés (Score de conformité, Réponses « Oui », Questions
  évaluées), scores par chapitre en **%** au lieu de x/5, axes du radar = taux de « Oui ».
- **Cohérence transverse** : la **SoA** AirCyber n'affiche plus la colonne « Mat. » ; sur le
  **tableau de bord**, AirCyber est **exclu de la moyenne de maturité CMMI** (KPI, tendance,
  synthèse de posture) et sa barre « Maturité par référentiel » affiche son **score %** avec la
  légende « score Oui/Non (sans échelle CMMI) ». L'**import CSV** ne pose plus de maturité
  heuristique (statuts seuls). La saisie ne touche plus au champ `maturite` stocké (préservé
  mais ignoré) ; un statut hérité « partiellement conforme » (propagation pivot/correspondances)
  reste affiché sans être proposé, et compte comme « pas Oui » dans le score. Le panneau
  « préparation au label » se **rafraîchit désormais en direct** à chaque réponse.
- **Les autres référentiels ne changent pas** : ANSSI, ISO 27002, NIS2 et DORA conservent les
  5 statuts, l'échelle de maturité CMMI 0-5, leurs KPIs et leur radar.
- **Tests headless (Playwright)** : 64 assertions — colonnes/réponses/KPIs du questionnaire,
  géométrie exacte du radar par niveau (Bronze CL1 4/4 → sommet au bord), teintes par niveau,
  score et préparation au label recalculés en direct (vue de niveau conservée), maturité héritée
  préservée, statut hérité affiché, import CSV sans maturité, non-régression ANSSI (statuts,
  CMMI, radar 10 axes), SoA 6/7 colonnes, tableau de bord ; **0 erreur console**.

### Référentiels — AirCyber : profil de maturité par domaine de classification (CL)
- Le **radar « Profil de maturité par domaine »** du référentiel AirCyber est désormais construit
  sur les **domaines de classification CL existants** (CL0 Governance, CL1 Security event
  management, CL2 Malwares, CL3 Protect end user devices, CL4 Secure network architecture,
  CL5 Identity & access management, CL6 Data protection and classification), **avec le nom du
  domaine** sur chaque axe — au lieu des chapitres thématiques du questionnaire.
- Chaque axe **agrège toutes les questions portant ce code CL** (quel que soit leur chapitre),
  avec les **mêmes règles de calcul** que les scores existants (« non applicable » exclu,
  « non évalué » compte 0). Les questions **sans domaine CL connu** (78/234) ne sont pas
  représentées dans le radar — une **note explicative** l'indique sous le graphique — mais elles
  restent comptées dans la synthèse, les scores par chapitre et la conformité.
- **Rien d'autre ne change** : les autres référentiels (ANSSI, ISO 27002, NIS2, DORA) conservent
  leur radar par domaines thématiques ; chapitres, filtres, panneau « préparation au label »,
  import CSV et mise à jour temps réel inchangés. Techniquement : axes calculés par
  `computeClAxes()` (activé par la présence de `clLabels`), étiquettes **multi-lignes** dans le
  SVG (viewBox élargie pour AirCyber uniquement).
- **Tests headless (Playwright)** : 22 assertions — 7 axes CL nommés (liste + fiche), géométrie
  exacte (domaine CL2 évalué 5/5 → sommet au bord du radar), exclusion des questions sans CL,
  rafraîchissement temps réel, non-régression ANSSI (axes et viewBox inchangés) ;
  **0 erreur console**.

### Chantier 2 — Pédagogie : tooltips ⓘ sur les concepts techniques
- **25 notes pédagogiques `Help.tip(ⓘ)`** ajoutées sur les modules techniques qui n'en avaient
  aucune, pour rendre le jargon GRC accessible aux non-experts (fil rouge du produit) :
  - **Risques (EBIOS)** : Fréquence (F), Gravité (G), Niveau de maîtrise (M) — sur les formulaires
    de création ET de détail — plus un rappel de la méthode FxGxM sur l'en-tête de liste.
  - **BIA** : Criticité métier, RTO (Recovery Time Objective), RPO (Recovery Point Objective).
  - **Actifs** : Criticité CIA/DICP (Confidentialité, Intégrité, Disponibilité).
  - **Matrice EBIOS** : lecture de la cartographie Fréquence × Gravité.
  - **Scénarios PCA/PRA** : distinction Continuité (PCA) vs Reprise (PRA).
  - **Audits** : typologie des constats (Point fort, Point d'amélioration, Non-conformité
    Mineure / Majeure).
  - **MCO** : Maintien en Condition Opérationnelle du PRA.
  - **Tests PRA** : nature de l'exercice (sur table, simulation, bascule réelle).
  - **Exigences** : signification du statut de conformité (lien avec le taux et la SoA).
- Aucune donnée ni schéma modifié : uniquement des icônes d'aide accessibles (clavier + lecteur
  d'écran) déjà stylées par le design system ; la bulle s'ouvre au clic/survol sans navigation.
- **Tests headless (Playwright)** : présence des ⓘ sur 11 vues (listes + fiches + formulaires),
  contenu pédagogique des bulles, ouverture au clic sans navigation parasite ; non-régression des
  suites de factorisation (50 assertions) ; **0 erreur console**.

### Chantier 9 — Durcissement : centralisation de la génération d'identifiants
- **`UI.genId(prefix)`** (ajouté à `js/core/ui.js`) : centralise la convention d'identifiant
  anti-collision `"<PRÉFIXE>-<timestamp>-<aléa>"` qui était **recopiée sur 23 sites / 17 modules**
  (Actifs, Audits ×2, BIA, Donneurs d'ordre, Crise, Documents, Exigences ×2, Incidents ×2,
  Correspondances ×2, Mesures, MCO, Prestataires, Scénarios, Tests PRA, Référentiels ×2, RGPD, Risques ×2).
  Un seul endroit à faire évoluer (p. ex. future migration vers `crypto.randomUUID`).

  > ⚠️ **Cette entrée annonçait « solde la dette *collisions* ». Elle ne la soldait pas.**
  > La centralisation était juste, et elle est restée ; ce qui était faux, c'est la
  > conclusion. La convention centralisée tirait
  > `Math.floor(Math.random() * 1000)` — **mille valeurs** —, et `Date.now()` ne bouge pas
  > d'une itération à l'autre dans une boucle d'import : l'identifiant s'y réduit à ce
  > tirage. Le défaut a survécu **deux vagues** sous cette phrase, et il est ressorti en
  > **constat bloquant** d'un passage de porte — un import qui écrivait 223 lignes sur 250
  > *en annonçant le succès*, donc un score de conformité faux dans un outil qui sert de
  > preuve en audit. La leçon a été inscrite au `backend/db/CONVENTIONS.md` §2 :
  > **centraliser un générateur n'est pas le corriger**, et ce qui est normatif est une
  > **propriété** — au moins 52 bits d'aléa cryptographique — et non le fait qu'il n'existe
  > qu'à un endroit.
- **Comportement identique** : `UI.genId("INC")` produit exactement `"INC-<timestamp>-<aléa>"` comme avant.
  Les horodatages `updatedAt: Date.now()` (10 sites) **ne sont pas touchés** (ce ne sont pas des id).
- **Collecte de formulaire** : après analyse, la lecture des champs (`getElementById(...).value`) reste
  **volontairement en ligne** — hétérogène (trim, cases à cocher, coercition numérique) et locale à
  chaque formulaire, sa factorisation ajouterait de l'indirection sans gain réel (principe « sans
  sur-ingénierie »).
- **Tests headless (Playwright)** : `UI.genId` (format, préfixe par défaut, unicité) + **création
  réelle d'un incident via le formulaire** (id généré au bon format) ; non-régression des suites
  bulk/badges (20), smoke (8) et suppression fiche (16) ; **0 erreur console**.

### Chantier 9 — Durcissement : factorisation des confirmations de suppression
- **`UI.wireDelete({button, confirm, remove, toast, redirect})`** (ajouté à `js/core/ui.js`) :
  factorise le motif **« supprimer un élément depuis sa fiche »** — confirmation → suppression →
  toast optionnel → navigation vers la liste — qui était recopié dans **16 modules / 17 boutons**
  (Exigences, Risques, Actifs, Incidents, Documents, Actions, BIA, RGPD, Crise, Donneurs d'ordre,
  Mesures, Prestataires, Tests PRA, MCO, Scénarios PCA/PRA, Audits ×2).
- **Souplesse** : id de bouton paramétrable (`deleteBtn` par défaut, aussi `delBtn` /
  `delScenarioBtn`), message **statique ou dynamique** (fonction évaluée au clic — préserve les
  avertissements de cascade, ex. « N test(s) rattaché(s) seront supprimés » des scénarios, ou le
  nom de la mesure), toast optionnel, redirection vers la liste.
- **Aucun changement fonctionnel** : messages de confirmation, toasts et routes de redirection
  rigoureusement identiques ; le refus de la confirmation n'entraîne aucune suppression.
- **Tests headless (Playwright)** : suppression de bout en bout sur 6 modules représentatifs
  (sans/avec toast, message dynamique, cascade, `delBtn`/`delScenarioBtn`), vérification du
  message de confirmation et de la redirection, + chemin « annuler » ; non-régression des tests
  bulk-delete/badges (20) et smoke (8) ; **0 erreur console**.

### Chantier 9 — Durcissement : factorisation des helpers d'interface dupliqués
- **Nouveau module partagé `js/core/ui.js`** (`window.UI`) : source unique pour les fragments
  d'UI recopiés d'un module à l'autre. Un seul endroit à maintenir, un comportement homogène.
- **Suppression groupée factorisée** : la logique de sélection multiple (case « tout cocher »,
  cases de ligne, bouton « Supprimer sélection » + compteur, confirmation, suppression, toast,
  re-rendu) était **recopiée à l'identique dans 8 modules** (Exigences, Risques, Actions, Crise,
  BIA, Tests PRA, MCO, Prestataires). Elle passe par un unique `UI.wireBulkDelete({ remove, confirm,
  toast, onDone })` — chaque module ne conserve que ses libellés propres. ~250 lignes dupliquées retirées.
- **Badges de statut factorisés** : la forme récurrente `<span class="status …">libellé échappé</span>`
  et les tables de correspondance valeur→classe deviennent `UI.badge(label, cls)` /
  `UI.mappedBadge(value, map, fallback)` (appliqués à Incidents : gravité/statut/déclarations, et
  Documents : statut). Échappement XSS conservé (repli défensif si `escapeHtml` indisponible).
- **Aucun changement fonctionnel ni de schéma** : comportement, messages de confirmation et couleurs
  de badges rigoureusement identiques. *(Restent à factoriser ultérieurement : collecte de formulaire
  — hétérogène — et confirmations.)*
- **Tests headless (Playwright)** : 20 assertions sur `/risques` (sélection, compteur, tout-cocher,
  suppression groupée avec confirmation, cohérence DataStore), badges Incidents/Documents en situation
  réelle et anti-XSS, + smoke test des 8 modules (rendu, wiring actif) ; **0 erreur console**.

### Chantier 9 — Durcissement : gestion de la saturation du stockage (quota)
- **Fin des échecs silencieux** : quand une écriture durable échoue faute de place
  (`QuotaExceededError` sur IndexedDB, le miroir localStorage ou un point de restauration), l'appli
  le **détecte** et **prévient l'utilisateur** au lieu de perdre les données sans un mot.
- **Bandeau d'alerte dédié** (« Stockage saturé ») : conteneur propre, indépendant du rappel de
  sauvegarde, avec accès direct aux Paramètres (export + suppression d'anciens points de restauration
  pour libérer de l'espace) et fermeture manuelle.
- **Import Excel** : en fin d'import, un **enregistrement est forcé** et un message d'alerte s'affiche
  si le stockage est plein (les lignes importées restent en mémoire pour la session, mais l'utilisateur
  sait qu'elles ne sont pas encore persistées).
- **DataStore** : `isQuotaError`, observateur `onQuotaExceeded(cb)`, et `flush()` async renvoyant
  `{ ok, quota }`. Détection branchée sur `flushNow`, le miroir localStorage et l'auto-sauvegarde.
- **Tests headless (Playwright)** : simulation d'un quota (monkey-patch d'IndexedDB) → `flush()` signale
  `quota:true`, bandeau affiché (sans doublon, cohabite avec le rappel), import Excel alerté, fermeture
  et rétablissement ; **0 erreur console inattendue**.

### Chantier 7 — Tableau de bord : suivi, échéances & comparatif par donneur d'ordre
- **Incidents récents** : nouvelle liste (5 derniers incidents par date de détection, du plus récent
  au plus ancien) avec gravité, type, statut et **badge « À déclarer »** quand une déclaration
  réglementaire (NIS2/RGPD) est en attente. Chaque ligne ouvre la fiche incident.
- **Documents à réviser** : remontée des alertes de la gestion documentaire (chantier 5) — documents
  dont la **revue est échue ou proche** (≤ 30 j) ou au statut « à réviser » / « obsolète », triés par
  urgence, avec badges (retard / J-n) et **compteur d'alerte** dans le titre. Lignes cliquables.
- **Conformité par donneur d'ordre** : vue **comparative** (barres triées) du taux de conformité de
  chaque donneur d'ordre et des exigences internes — pertinent pour un sous-traitant multi-clients.
- Regroupées dans une nouvelle section **« Suivi & échéances »** ; aucun changement de schéma.
- **Tests headless (Playwright)** : ordre des incidents, badge « À déclarer », filtrage/compteur des
  documents, taux par client (Alpha 50 %, Beta/interne 100 %), navigation vers les fiches ;
  **0 erreur console**. → **Chantier 7 complet**.

### Chantier 7 — Tableau de bord : historisation & courbes de tendance
- **Nouvelle section « Évolution dans le temps »** sur le tableau de bord : les indicateurs clés
  sont **historisés** et affichés en **courbes de tendance** (sparklines SVG maison, aucune
  dépendance).
- **Capture automatique** d'un **instantané global une fois par jour** (à l'ouverture du tableau
  de bord), dédupliqué par date (un point par jour, le point du jour reste vivant). Les indicateurs
  sont **toujours calculés sur le périmètre global** (indépendants du sélecteur de donneur d'ordre)
  pour une série stable ; conservation bornée à 180 jours.
- **6 tendances suivies** : conformité, maturité des référentiels, exposition résiduelle, risques
  critiques, actions en retard, avancement des actions. Chaque tuile affiche la **valeur courante**,
  la **mini-courbe** et la **variation** (dernier vs premier point) **colorée selon le sens
  « meilleur »** (hausse verte pour la conformité, baisse verte pour l'exposition, etc.).
- **Effacer l'historique** (bouton dédié, avec confirmation) — n'affecte pas les données GRC ;
  un nouveau point est recapturé le jour même.
- **Modèle de données (schéma v8)** : nouveau tableau **`history`** (`{ id, ts, date, metrics }`).
  API DataStore `getHistory` / `recordDailySnapshot` (upsert du jour, sans réécriture si inchangé) /
  `clearHistory`. Migration transparente (les backups v7 restent importables).
- **Tests headless (Playwright)** : auto-capture au 1er rendu, injection d'un historique multi-jours
  → 6 courbes tracées, variation colorée cohérente (hausse conformité verte, baisse exposition verte),
  effacement (données GRC préservées), **export/import round-trip v8** ; **0 erreur console**.

### Chantier 3 — Correspondances inter-référentiels (mapping pré-rempli & éditable)
- **Nouvelle vue `/mapping`** (« Correspondances ») : un **catalogue pré-rempli** d'équivalences
  entre les exigences des référentiels, regroupées par **thème de sécurité** (28 groupes couvrant
  ANSSI ↔ ISO 27002 ↔ NIS2 ↔ DORA : gouvernance, MFA, sauvegardes, incidents, chaîne d'appro…).
  Objectif : **accélérer** la couverture croisée et la génération de SoA, dans l'esprit « zéro
  double saisie ».
- **Propagation en un geste** (le cœur de la fonctionnalité) :
  - **Relier tout un groupe à une mesure de sécurité** (existante ou créée à la volée) : toutes les
    exigences équivalentes pointent vers la même mesure ; évaluez la mesure une fois puis propagez.
    Relier **préserve** l'état « non évalué » (aucun statut fabriqué).
  - **Appliquer un même statut + maturité** à toutes les exigences d'un groupe.
- **Statut en direct** : chaque code de clause est un badge **coloré selon son évaluation**
  (conforme / partiel / non conforme / non applicable / non évalué), avec **anneau** si l'exigence
  est déjà reliée à une mesure ; clic → ouvre le référentiel. **Conformité du groupe** affichée.
- **Entièrement éditable** : créer une correspondance **personnalisée**, **modifier** un groupe du
  catalogue (surcouche « Modifiée »), **masquer** un groupe, et **réinitialiser** le catalogue par
  défaut. **Cartographie** en tête : part des exigences de chaque référentiel reliée à au moins une
  correspondance.

  > ⚠️ **« Entièrement éditable » ne vaut plus depuis la bascule serveur, et la
  > restriction est voulue.** Ce qui était juste sur un poste isolé devenait faux en
  > contexte de groupe : une correspondance est une **référence commune aux vingt
  > filiales**, et n'importe laquelle pouvait la réécrire ou la supprimer pour les
  > dix-neuf autres. L'éditer est désormais un acte d'**administration Groupe** ; la
  > **lire** reste ouvert à tous, et la **propagation** décrite plus haut reste offerte
  > puisqu'elle ne touche que des données de filiale.
- **Modèle de données (schéma v7)** : nouveau tableau **`mappings`** = surcouche utilisateur
  (ajouts, overrides par id, masquages `_deleted`) fusionnée avec le **catalogue statique**
  (`js/data/mappings.js`). API DataStore `getMappings` / `getMappingById` / `upsertMapping` /
  `deleteMapping` / `resetMappings`. Migration transparente (les anciens backups v6 restent
  importables). Liens croisés ajoutés depuis Référentiels et Couverture croisée.
- **Tests headless (Playwright)** : rendu des 28 groupes, propagation statut (conformité → 100 %),
  reliaison à une mesure (préservation « non évalué »), création/modification/masquage/réinitialisation,
  **export/import round-trip v7** + compat v6 ; **0 erreur console**, aucune régression sur
  `/couverture` et `/referentiels`.

### Chantier 9 — Intégrité des données : cascade & tests PRA orphelins
- **Suppression en cascade** : supprimer un **scénario PCA/PRA** supprime désormais aussi les
  **tests d'exercice** qui lui étaient rattachés (`tests_pra.scenario_id`) — plus de tests
  pointant vers un scénario inexistant. La **confirmation de suppression** indique le nombre de
  tests impactés avant validation.
- **Détection & nettoyage des orphelins hérités** : les tests dont le scénario a été supprimé
  avant ce correctif sont **repérés** (badge « Orphelin » sur la ligne + **bandeau d'alerte**
  avec compteur) et **nettoyables en un clic** (« Supprimer les tests orphelins »).
- **DataStore** : `deleteScenarioPra` cascade vers `tests_pra` ; nouveaux helpers
  `getTestsByScenario`, `getOrphanTests`, `deleteOrphanTests`.
- Tests headless : cascade vérifiée (les tests du scénario supprimé disparaissent, l'orphelin
  d'origine subsiste puis est nettoyé), message de confirmation, bandeau ; 0 erreur console.

### Chantier 9 — Durcissement XSS : fin de l'échappement des modules
- **Échappement généralisé** (`escapeHtml`) de toutes les données utilisateur injectées en DOM
  dans les 7 modules restants : **Actifs, Donneurs d'ordre, BIA, Scénarios PCA/PRA, Tests PRA,
  MCO, Contrôles & Audits** (listes, fiches, formulaires, options, matrice RACI et **vues
  d'impression**). La dette XSS transverse est **soldée sur les modules de saisie**.

  > ⚠️ **« Soldée » a été démenti deux fois, et il faut le dire ici.** Le travail décrit
  > est réel et il tient ; c'est le mot qui promettait trop. La porte de sécurité S2 a
  > trouvé **deux injections résiduelles** — le nom d'un risque dans le panneau de détail
  > de la matrice, le nom d'un client dans le sélecteur de donneur d'ordre —, dans des
  > modules qui disposaient de l'échappement et s'en servaient trente lignes plus loin. Et
  > elle a trouvé que la seconde couche, la politique de sécurité de contenu du vhost,
  > **bloquait soixante-quatre gestionnaires en ligne** : l'application ne fonctionnait pas
  > dans sa configuration de déploiement. Un échappement n'est jamais « soldé » — c'est une
  > discipline qui se tient à chaque rendu, y compris dans un panneau de détail ou un
  > `<option>`.
- **Correctifs de sécurité notables** :
  - **Audits — injection HTML** : les rapports/PV imprimés faisaient `…replace(/\n/g, '<br>')`
    **sans échappement préalable** (rendu HTML de texte libre : synthèse, audité, participants,
    entrées/sorties, constats). Désormais **échappement d'abord, puis** conversion des sauts de
    ligne — un contenu comme `<script>…` s'affiche en texte, plus en HTML actif.
  - **Scénarios & Audits — échappement incomplet** : plusieurs champs n'échappaient que le
    guillemet (`replace(/"/g, '&quot;')`), laissant passer `<`, `>`, `&`. Remplacé par
    `escapeHtml` complet.
  - Champs auparavant oubliés désormais couverts : **bilan** d'un test PRA, **titres d'étapes**
    de la matrice RACI, champ **actifs** d'une étape, **noms des risques** liés à un actif.
- **Tests dédiés (Playwright)** : injection de charges utiles (`"><img onerror…>` et
  `<script>` multi-lignes) dans **chaque entité**, puis parcours listes + fiches + **vues
  d'impression** + **matrice RACI** — vérification qu'aucune balise n'est créée ni exécutée
  (payloads rendus en texte échappé), **0 erreur console**, aucune régression.

### Chantier 8 — Tiers : risque fournisseur & chaîne d'approvisionnement (NIS2/DORA)
- **Évaluation du risque fournisseur** sur le module Prestataires & Tiers : deux critères
  **Criticité** (impact si défaillance : faible → vitale) et **Accès au SI / aux données**
  (aucun → étendu) produisent un **niveau de risque inhérent** (Faible / Modéré / Élevé /
  Critique) affiché en badge sémantique, recalculé en direct dans le formulaire.
- **Exigences de sécurité de la chaîne d'approvisionnement** : checklist de 6 points de
  vigilance contractuels et opérationnels (clause de sécurité, notification des incidents,
  droit d'audit & preuves de conformité, localisation des données & sous-traitance, plan de
  réversibilité, continuité & résilience testée), chacun rattaché à sa **référence NIS2 /
  DORA**. Taux de **couverture** (X/6) affiché par tiers.
- **Liste enrichie** : nouvelle colonne « Risque fournisseur » (niveau + couverture) et
  **bandeau de synthèse** (nombre de tiers, évalués, à risque élevé/critique, couverture
  moyenne de la chaîne d'appro) pour une lecture direction immédiate.
- Champs `criticite` / `acces` / `supplyChain` **optionnels et rétrocompatibles** (aucun bump
  de schéma). **Durcissement XSS** du module au passage (société, type, contacts, notes).

### Chantier 8 — PCA/PRA : fiches réflexes de crise imprimables
- **Nouvelle vue `/crise-fiches`** accessible depuis l'annuaire de la Cellule de Crise
  (bouton **« Fiches réflexes »**) : des **cartes d'action par rôle** décrivant les gestes
  prioritaires à effectuer dans les premières minutes (Directeur de crise, Responsable
  IT/SSI, Communication, Juridique/RH, Expert technique, Logistique). Contenu **générique et
  pédagogique** (le public inclut des non-experts).
- **Titulaires rattachés automatiquement** depuis l'annuaire (par rôle) ; les rôles non
  pourvus affichent « Titulaire à désigner ». Ajout d'un bloc **« Réflexes communs à tous »**
  et d'un tableau **« Contacts d'urgence »** (CERT-FR/ANSSI, CNIL, cybermalveillance.gouv.fr,
  forces de l'ordre + champs à compléter : assurance cyber, infogérant, prestataire réponse).
- **Optimisé impression** (le SI peut être indisponible en pleine crise) : en-tête de
  document (`.print-head`), sidebar masquée, cartes sans coupure de page, bandeau de rappel
  « à conserver hors ligne ». Item de menu « Cellule de Crise » maintenu actif ; fil d'Ariane
  et route dédiés.
- **Durcissement XSS du module Crise** (dette Chantier 9) : échappement de toutes les données
  saisies (rôle, nom, téléphone, e-mail, suppléant, notes) dans l'annuaire, la fiche contact
  et les fiches réflexes.

### Chantier 8 — Matrice EBIOS : export image & cohérence brut/résiduel
- **Export image de la matrice de criticité** : deux boutons **« Exporter en PNG »** et
  **« Exporter en SVG »** sur la fiche `/matrice`. Génération d'un **SVG autonome** (titre,
  marque Dedienne, axes Fréquence × Gravité, grille 4×4 colorée avec bulles de compte,
  légende) rendu **sans aucune dépendance** ; le PNG est produit en interne en dessinant ce
  SVG sur un `<canvas>` (×2 pour la netteté) — aucun service tiers, aucune ressource externe
  (canvas non « tainted »). Utile pour insérer la cartographie dans un rapport ou un COMEX.
- **Alerte de cohérence brut / résiduel** : bandeau d'avertissement listant les risques dont
  le **score résiduel dépasse le score brut** (niveau de maîtrise M > 1, incohérent — une
  mesure de maîtrise ne peut pas augmenter le risque). Cause typique : import Excel avec un M
  mal saisi (« 50 » au lieu de « 0.5 »). Chaque risque signalé est **cliquable** (lien vers
  sa fiche) pour correction immédiate.
- **Refactorisation sans régression** : le regroupement des risques dans la grille est
  factorisé (`buildMatrixData`) et partagé entre l'affichage et l'export ; l'interaction
  existante (clic sur cellule, panneau de détail) est inchangée.

### Import des actifs & correctifs d'export PDF
- **Import des actifs abouti** : nouveau bouton **« Télécharger le modèle »** générant un
  fichier Excel prêt à remplir (`modele_import_actifs.xlsx`), avec les colonnes exactes
  attendues (`Nom, Type, Criticité, Responsable, Description`) et des lignes d'exemple
  couvrant chaque type/criticité. Le générateur est co-localisé avec le parseur
  (`ImportExcelService`) pour garder le format synchronisé. Message d'aide et garde-fous
  (`ImportExcelService` chargé) alignés sur les modules Exigences/Risques.
- **Export PDF — Cellule de crise** : le **titre du document réapparaît à l'impression**
  (en-tête dédié `.print-head` : titre + marque Dedienne + date) et la **colonne des cases
  à cocher est masquée** au print (la case du corps de tableau n'était pas `no-print`, ce
  qui décalait les colonnes et laissait « Suppléant » sans en-tête).
- **Export PDF — Prestataires & Tiers** : ajout du **bouton « Imprimer l'annuaire »**
  (absent auparavant), en-tête d'impression dédié, **cases à cocher masquées** au print
  (en-tête + corps) et **bandeau pédagogique retiré** de l'impression (`no-print`).
- **Nouveau motif réutilisable `.print-head`** (dans `css/style.css`) : en-tête masqué à
  l'écran, révélé uniquement à l'impression — généralise le procédé déjà utilisé pour la SoA.

### Itération 14 — AirCyber : niveaux de label, priorité & domaines CL0–CL6
- **Métadonnées par question** (issues du fichier de suivi BoostAerospace, 156/234
  questions) : **niveau de label Bronze / Argent / Or**, **priorité** (haute / moyenne /
  basse) et **domaine de classification CL0–CL6** (Governance, Security event management,
  Malwares, Protect end user devices, Secure network architecture, Identity & access
  management, Data protection). Affichés en **badges** sur chaque question.
- **Filtres** sur la fiche AirCyber : par **niveau** (Tous / Bronze / Argent / Or) et par
  **domaine CL**, avec compteur de questions affichées.
- **Panneau « Préparation au label »** : taux de conformité par niveau (Bronze / Argent /
  Or) — répond à « suis-je prêt pour ce label ? ». Alimenté par l'auto-évaluation / l'import.
- Générique et sans régression : les référentiels sans niveaux (ANSSI, ISO…) n'affichent
  ni badges, ni filtres, ni panneau. Schéma référentiel étendu (champs optionnels
  `niveau` / `priorite` / `cl` par exigence + `clLabels`).

### Itération 13 — Import des réponses AirCyber (CSV)
- **Import des réponses** depuis l'export CSV du questionnaire AirCyber, sur la fiche
  du référentiel (bouton « Importer mes réponses (CSV) »). Mappe automatiquement
  Oui → conforme, Non → non conforme, N/A → non applicable, Partiellement → partiel,
  avec une maturité de départ (CMMI) ; les questions d'inventaire d'outils et les codes
  hors référentiel sont ignorés. Parsing via SheetJS (déjà embarqué), aucune donnée
  ne quitte le navigateur. Validé sur un export réel : 231/234 réponses appliquées.

### Itération 12 — Durcissement (XSS & identifiants)
- **Échappement HTML partagé** exposé (`window.escapeHtml` via `help.js`) et appliqué
  aux modules à fort trafic **Exigences** et **Risques** : toute donnée utilisateur
  injectée en `innerHTML` (intitulés, noms, descriptions, commentaires, valeurs de
  formulaire) est désormais échappée. Vérifié par un test XSS dédié (charges neutralisées).
- **Identifiants anti-collision** : suffixe aléatoire ajouté à tous les identifiants
  générés (`"<PREFIXE>-" + Date.now() + "-" + aléatoire`) dans l'ensemble des modules,
  supprimant le risque de collision lors de créations dans la même milliseconde.

### Itération 11 — Registre des traitements RGPD (article 30)
- **Nouveau module Registre RGPD** (`/rgpd`) : registre des activités de traitement
  (finalité, **base légale**, personnes concernées, catégories de données, **données
  sensibles** art. 9, destinataires, transfert hors UE, durée de conservation).
- **Mesures de sécurité réutilisent le pivot** : chaque traitement relie les
  « mesures de sécurité » qui le protègent (zéro double saisie).
- **Registre imprimable** (art. 30) + repères pédagogiques (bases légales, données sensibles).
- **Modèle v6** (`SCHEMA_VERSION` 5 → 6) : tableau `traitements` ; `deleteMesure` délie les traitements.

### Itération 10 — Tableau de bord enrichi (cockpit GRC 360°)
- **Refonte du tableau de bord** (`js/modules/dashboard.js`) en véritable cockpit de
  pilotage agrégeant l'ensemble des domaines GRC, avec des **graphiques maison en
  SVG/HTML** (aucune librairie, 100 % frontend) : anneaux (donut), barres horizontales
  et **cartographie des risques** (matrice Fréquence × Gravité colorée).
- **Bandeau de posture direction** : synthèse automatique colorée (maîtrisée /
  vigilance / arbitrage immédiat) déduite des risques très critiques, **déclarations
  réglementaires en attente** (NIS2/RGPD), retards d'actions et taux de conformité.
- **Bandeau d'indicateurs clés (KPI)** : conformité, maturité moyenne des référentiels,
  exposition résiduelle, actions en retard et actifs cartographiés — lecture en un coup d'œil.
- **Conformité** : anneau de répartition des statuts (conforme / partiel / non conforme /
  non applicable / non évalué) + taux sur exigences applicables.
- **Maturité par référentiel** : maturité globale (échelle CMMI 0-5) et barre par
  référentiel, couvrant automatiquement **les 5 référentiels du catalogue** (ANSSI, ISO
  27002, NIS2, DORA, AirCyber) — chaque cadre ajouté apparaît sans modifier le dashboard.
- **Risques** : anneau du profil résiduel (très critiques / critiques / non critiques),
  score d'exposition, **cartographie F×G** cliquable vers la matrice, et Top 5 résiduel.
- **Plan d'actions** : avancement, ventilation par statut, **actions en retard** et
  **échéances ≤ 30 j** ; nouvelle **liste de veille** (retards + échéances proches triés
  par urgence, badges « Retard Xj » / « J-x », pastille de priorité).
- **Actifs par criticité** (barres) et **Couverture du dispositif GRC** : 11 tuiles
  cliquables (BIA, mesures, exigences évaluées, PCA/PRA, tests — avec dernier résultat,
  MCO, cellule de crise, audits + non-conformités ouvertes, prestataires, risques et
  **incidents** — ouverts + déclarations réglementaires en attente).
- **État vide pédagogique** : bandeau d'amorçage quand aucune donnée n'est saisie ;
  tous les graphiques dégradent proprement (messages d'aide). Sécurité XSS : toutes les
  données utilisateur injectées sont échappées (`escapeHtml`). Nouveaux styles cockpit
  dans `css/style.css` (tokens uniquement, couleurs sémantiques respectées).

### Itération 9 — Gestion documentaire des politiques
- **Nouveau module Documents** (`/documents`) : registre des politiques et documents
  (PSSI, charte, procédures…) avec **version, propriétaire, statut, date de prochaine
  revue, emplacement** (l'application **ne stocke pas** les fichiers) et lien aux référentiels.
- **Alertes de revue** : badge « en retard / dans N j » dans la liste, bannière sur la fiche,
  KPI « revue à prévoir ».
- **Canevas de plans** (PSSI, charte, PCA/PRA) pré-remplissant le sommaire.
- **Modèle v5** (`SCHEMA_VERSION` 4 → 5) : tableau `documents`.

### Itération 8 — Registre des incidents de sécurité
- **Nouveau module Incidents** (`/incidents`) : journal des incidents avec type, gravité,
  statut, dates de détection/résolution, description, actions immédiates, cause racine,
  actifs touchés, lien vers un **risque EBIOS**, et déclarations **ANSSI/CNIL**.
- **Rappel des délais réglementaires** : bannière d'alerte (NIS2 24 h/72 h, RGPD 72 h)
  lorsqu'une déclaration est en attente, avec le temps écoulé depuis la détection.
- **Actions correctives** tracées jusqu'à l'incident (visibles dans le plan d'actions).
- **Modèle v4** (`SCHEMA_VERSION` 3 → 4, migration transparente) : tableau `incidents`,
  champ `action.incident_id`, cascades de nettoyage (risque / actif supprimés).

### Itération 7 — Couverture croisée & Déclaration d'applicabilité (SoA)
- **Vue Couverture croisée** (`/couverture`) : part de chaque référentiel adossée à une
  mesure de sécurité + **matrice mesures × référentiels** mettant en évidence les mesures
  « transverses » (couvrant plusieurs cadres) — la concrétisation du « zéro double saisie ».
- **Génération de la déclaration d'applicabilité (SoA)** (`/soa/:id`) : tableau **imprimable
  (PDF)** de toutes les mesures d'un référentiel — applicabilité, mise en œuvre, maturité,
  mesure de sécurité liée, justification —, livrable clé d'un audit ISO 27001. Accessible
  depuis la liste des référentiels et le détail de chaque référentiel.

### Itération 6 — Référentiels 4c : ISO 27002, NIS2, DORA, AirCyber
- **Quatre nouveaux référentiels** ajoutés au catalogue, au même modèle d'auto-évaluation
  (radar de maturité, statuts, maturité 0-5, actions correctives, pivot) :
  - **ISO/IEC 27002:2022** — 93 mesures en 4 thèmes (organisationnel, humain, physique, technologique).
  - **NIS2 (art. 21)** — 10 mesures de gestion des risques, regroupées en 4 thèmes.
  - **DORA** — 5 piliers de résilience opérationnelle numérique (15 mesures de synthèse).
  - **AirCyber (BoostAerospace)** — questionnaire de maturité de la filière aéronautique,
    **234 questions** en 10 domaines, importé depuis l'export officiel du questionnaire
    (les questions d'inventaire d'outils « quel outil utilisez-vous » sont écartées car
    non auto-évaluables). *Généré fidèlement depuis le CSV fourni.*
- Reformulations originales courtes + aide pédagogique pour ISO/NIS2/DORA ; **aucun texte
  de norme copié** (identifiants de clauses « 5.1 » + intitulés paraphrasés uniquement).
- Le catalogue compte désormais **5 référentiels (394 mesures)** ; carte d'accroche orientée
  vers le pivot « Mesure de sécurité » (couverture croisée à venir).

### Itération 5 — Pivot « Mesure de sécurité » (zéro double saisie)
- **Nouveau module Mesures de sécurité** (`js/modules/mesures.js`, routes `/mesures`
  et `/mesures/:id`) : catalogue des contrôles de sécurité (MFA, sauvegardes,
  cloisonnement…), entité **pivot** reliée n-n aux exigences des référentiels.
- **Liaison depuis une exigence** : dans le détail d'une mesure de référentiel, un
  sélecteur « Couverte par la mesure de sécurité » permet de relier (ou créer à la
  volée) une mesure. La couverture est visible sur la fiche de la mesure.
- **Propagation** : un clic recopie le statut et la maturité de la mesure sur toutes
  les exigences qu'elle couvre — évaluer une fois, appliquer partout (fondation du
  mapping croisé multi-référentiels à venir).
- Suppression d'une mesure : les exigences liées sont **déliées** (leurs évaluations
  sont conservées). Correctif : réaffichage des preuves à la réouverture d'une mesure.

### Itération 4 — Référentiels : ossature + Hygiène ANSSI + auto-évaluation
- **Nouveau module Référentiels** (`js/modules/referentiels.js`, routes `/referentiels`
  et `/referentiels/:id`) : auto-évaluation de la conformité par rapport à un
  référentiel de sécurité, avec **profil de maturité en radar** (SVG maison, sans
  dépendance) et score par domaine mis à jour **en temps réel**.
- **Référentiel Hygiène informatique ANSSI** (`js/data/ref_anssi.js`) : les
  **42 mesures** réparties en **10 familles**, en reformulations originales courtes
  + **aide pédagogique** par mesure (aucun texte de norme copié). Registre extensible
  `Referentiels` (`js/data/referentiels.js`) prêt pour ISO 27002 / NIS2 / DORA / AirCyber.
- **Auto-évaluation par mesure** : statut (conforme / partiel / non conforme / non
  applicable / non évalué), **maturité 0-5** (échelle type CMMI), commentaire, preuves,
  et **actions correctives** tracées jusqu'à la mesure (visibles dans le plan d'actions).
- **Modèle de données v3** (`SCHEMA_VERSION` 2 → 3, migration transparente) : nouveaux
  tableaux `evaluations` (auto-évaluations, clé `ref_id` + `code`) et `mesures` (socle
  de l'entité pivot « Mesure de sécurité »). API DataStore synchrone étendue
  (`upsertEvaluation`, `getEvaluationsByRef`, `getActionsByEvaluation`…).
- **Traçabilité** : une action créée depuis une mesure affiche son origine
  (« ANSSI n°… ») dans le plan d'actions et pointe vers le référentiel.

### Itération 3 — Fondations du design system
- **Design tokens unifiés** (`css/tokens.css`) : source unique de vérité (marque
  orange dominante + bleu structurel, couleurs sémantiques strictes réservées aux
  statuts, espacements, rayons, ombres, typographie).
- **Composant tooltip pédagogique** (`js/core/help.js`, `Help.tip(...)`) : icône ⓘ
  accessible (clavier + lecteur d'écran), bulle au survol/tap, sans déclencher la
  navigation des cartes cliquables. Appliqué en démonstration au tableau de bord.
- **Fil d'Ariane** dynamique (section / page) sur toutes les routes.
- **Responsive** : barre latérale off-canvas + bouton menu sur mobile/tablette.
- **Accessibilité** : focus clavier visible, `prefers-reduced-motion`, chiffres
  tabulaires ; badges sémantiques (`.badge--ok/warn/crit/na`) et états vides normalisés.

### Itération 2 — Protection par mot de passe (opt-in) & chiffrement au repos
- **Coffre optionnel** (`js/core/vault.js`) : protection par mot de passe
  activable dans les Paramètres, désactivée par défaut (accessible aux non-experts).
- **Chiffrement au repos** AES-256-GCM des données IndexedDB *et* des points de
  restauration lorsque la protection est active. Aucune donnée en clair (miroir
  localStorage désactivé en mode chiffré).
- **Chiffrement à enveloppe** : clé de données (DEK) emballée par une clé dérivée
  du mot de passe (PBKDF2 600k) → changement de mot de passe sans re-chiffrement massif.
- **Écran de déverrouillage** à la charte Dedienne + **auto-verrouillage** après
  15 min d'inactivité + verrouillage manuel.
- Activation / changement / désactivation du mot de passe dans les Paramètres,
  avec purge des traces en clair et re-création des points de restauration.

### Itération 1 — Stratégie de sauvegarde (fichier)
- **Enveloppe de sauvegarde standard** `grc-backup` versionnée
  (`{ format, version, encrypted, createdAt, app, payload|kdf+cipher }`).
- **Export chiffré** optionnel et recommandé : AES-256-GCM, clé dérivée par
  **PBKDF2 (600 000 itérations)**, sel + IV aléatoires par fichier (portable).
  Export en clair toujours possible (avec avertissement pédagogique).
- **Import robuste** : détection auto du chiffrement (demande le mot de passe),
  validation stricte du contenu, aperçu chiffré, choix **Remplacer / Fusionner**,
  point de restauration créé avant toute modification, compat. anciens formats.
- **Migrations de schéma** ascendantes (registre `migratePayload`).
- **Rappel d'export** non intrusif (bandeau, seuil paramétrable, défaut 7 j) +
  date du dernier export affichée. Statut du **stockage persistant** dans les paramètres.
- Encarts pédagogiques (pourquoi chiffrer) intégrés au design.

### Phase 0 — Audit
- Ajout de `docs/DATA_MODEL.md` (schéma de données de référence).
- Ajout de `docs/AUDIT.md` (état des lieux, dette technique, plan priorisé).

### Persistance & sauvegarde
- **Refonte du stockage** : migration de `localStorage` (clé unique) vers
  **IndexedDB** (`js/core/persistence.js`), avec source de vérité en mémoire
  (API `DataStore` synchrone inchangée pour les modules).
- Migration automatique et transparente des données `localStorage` existantes,
  audits/revues inclus dans la sauvegarde unifiée.
- **Points de restauration versionnés** (automatiques toutes les 10 min +
  manuels, dédupliqués, historique glissant de 20) avec restauration en 1 clic.
- Sauvegarde de sécurité automatique avant tout import / restauration.
- `navigator.storage.persist()` demandé (réduit le risque de purge).
- Page **Paramètres** enrichie : état du stockage, quota, historique, export/import.
- Miroir localStorage de secours + flush avant fermeture d'onglet.

### Design & identité
- Application de la **charte Dedienne Aerospace** : couleurs échantillonnées sur
  le logo officiel (bleu `#2059A6`, orange `#E9631B`), variables CSS centralisées.
- Intégration du **logo officiel** (`logo-dedienne.png`) dans la barre latérale,
  favicon dédié.
- **Icônes SVG professionnelles** (style trait) sur toutes les entrées de menu.
- **Suppression de tous les emojis** (244 occurrences) au profit d'un rendu pro.
- Retrait des mentions de marques tierces (ancien branding, noms de concurrents).

### Mise en route
- Décompression de l'archive initiale dans l'espace de travail.
