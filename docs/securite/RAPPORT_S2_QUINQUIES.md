# Porte de sécurité S2 (5ᵉ passage) — lot L2 « API et bascule de la persistance »

> Auditeur : **SECU-S2-QUINQUIES**, agent indépendant. Je n'ai écrit aucune des lignes
> examinées, ni aucun des quatre rapports précédents. Travail en **lecture seule** sur le
> dépôt : le seul fichier que je crée est celui-ci, et `git status --porcelain` est resté
> vide du début à la fin (vérifié avant, pendant et après ; sortie collée au §2).
>
> Dépôt : `/home/user/cyber-grc`, branche `claude/backend-plan-serveur-hj46fs`, révision
> examinée **`f68f799`** (« Q-15 : le périmètre était plus large que le cas qui l'a
> révélé »).
>
> Référence : `docs/PLAN_EXECUTION.md` §4 (les dix-huit contrôles), §5 et §7 (journal des
> portes, registre des seize constats) ; `docs/securite/RAPPORT_S2_QUATER.md` ;
> `backend/db/CONVENTIONS.md` §2 et §16 à §24 ; `backend/README.md` §8 ;
> `docs/PLAN_SERVEUR.md` §1.3, §1.4, §1.6, §1.9, §2.4, §2.6, §5, §7, §8.
>
> Date : 01/09/2026.

---

## 1. Le verdict

> ### ❌ **PORTE REFUSÉE** — 0 bloquant, **3 majeurs**, **3 mineurs**. **Un contrôle de la grille est en échec : S17.**

Je refuse parce qu'un contrôle est en échec, et la règle du chantier ne me laisse pas le
choix : *un contrôle en échec ne se franchit pas*. Elle a été appliquée deux fois par
l'orchestrateur contre l'avis de l'auditeur, et je ne vais pas être le troisième à la
tester.

**Ce que je refuse n'est pas le cœur du lot.** Le serveur est solide, et je n'ai pas
réussi à le casser : quarante-six sondes hostiles écrites par moi n'ont fait bouger ni le
périmètre, ni une frontière de filiale, ni une requête SQL ; le cloisonnement rend
107 contrôles au vert sous le compte applicatif ; les bornes du moteur mordent toutes ;
les quinze fermetures revendiquées depuis le quatrième passage se rejouent, sauf une qui
se rejoue aux trois cinquièmes. Ce que je refuse tient en une phrase :

> **La reprise d'un export `grc-backup` est coupée à 60 secondes par la configuration de
> déploiement livrée — par Apache *et* par le navigateur — pendant que le serveur, lui,
> continue et VALIDE.** L'utilisateur est informé que sa restauration a échoué alors
> qu'elle a réussi. Mesuré : client interrompu à 4 s, **12 000 lignes en base 20 s plus
> tard**. Et le commentaire du vhost qui justifie `ProxyTimeout 60` — « au-delà, la
> requête est perdue de toute façon » — est **faux sur cette route**, ce que la même
> mesure établit.

C'est exactement la classe de défaut pour laquelle le contrôle **S17** a été créé : il ne
se voit ni dans le code du serveur, ni dans celui du navigateur, ni dans le vhost — il
vit **entre les trois**, et aucun des trois n'a tort tout seul.

| # | Constat neuf | Gravité |
|---|---|---|
| **Q-19** | **Le déploiement livré ne peut pas porter une reprise de plus de ~60 s, et ment sur son issue.** Apache coupe à `ProxyTimeout 60`, le navigateur à `DELAI_CHARGEMENT_MS = 60000`, le serveur ne s'arrête pas et **valide sa transaction**. Seuil mesuré ≈ **36 000 enregistrements**, contre un plafond **annoncé par le produit** de 20 000 **par collection** sur 21 collections | 🟠 majeur |
| **Q-20** | **Q-9 requalifié par la mesure, comme Q-13 l'avait été.** Le report à L7 a été accordé sur « 20 s pour 12 000 enregistrements ». J'ai mesuré **98,9 s pour 60 000** (~11,5 min extrapolées aux plafonds annoncés), et surtout : **dix reprises simultanées font répondre HTTP 500 à tout autre utilisateur**, après 5 s d'attente. Le report reste possible, la gravité écrite ne l'est plus | 🟠 majeur |
| **Q-21** | **Trois des cinq comportements que Q-3 exigeait ne sont exercés que dans le sens du silence.** Canari de doublons, signalement de rétrécissement et « le sondage qui pousse » : **neutralisés un par un, le banc reste vert (32/32)**. Le `CHANGELOG` affirme les cinq « désormais exercés » | 🟠 majeur |
| **Q-17** | **Le garde-fou d'entropie mesure une longueur là où la convention norme une entropie** — jumeau exact de Q-14, cette fois sur le générateur qui écrit. Pouvoir de détection mesuré : **8/200 à 32 bits, 0/200 à 40 bits**, quand le plancher normé est de 52 | 🔵 mineur |
| **Q-18** | **Un troisième commentaire faux dans `001_socle.sql`, vivant dans le catalogue** (`comment on domain id_metier`), et porteur **mot pour mot** de la justification que le chantier a déclarée « fausse, et vérifiée fausse ». Le §22 E5 ne le couvre pas ; le balayage de Q-6 ne pouvait pas le voir | 🔵 mineur |
| **Q-22** | **Trois renvois de la documentation vers le registre ont divergé** : Q-6 (b) est annoncé *reporté à L3* alors que la migration `005` l'a **fermé** ; et le `CONVENTIONS.md` §2 attribue au « constat Q-3 du registre » un manque réel — l'absence de garde-fou d'exécution côté navigateur — que Q-3 ne dit pas et qui sortira donc du registre **sans propriétaire** | 🔵 mineur |

**Ce que le lot a réellement gagné depuis le quatrième passage, et qu'il faut dire.**
Quatorze des quinze fermetures tiennent au sabotage, ce qui est un résultat : Q-1, Q-2,
Q-5, Q-7, Q-12, Q-13 et Q-15 se rejouent sans réserve, et les deux barrières du bloquant
T-1 mordent toutes les deux (générateur ramené à mille valeurs → rouge ; ré-indexation
par identifiant → rouge). Le trou que l'agent du banc avait lui-même signalé —
`collectionsAuVolumeIncertain()` vidée sans que rien ne rougisse — est **fermé** et mord.
Le registre des garde-fous de la migration `005` attrape les deux scénarios de Q-5, la
disparition **et** la re-signature, en code de sortie 7. Et le contrôle de complétude des
routes nomme une route neuve ajoutée sans barrière : c'est exactement l'outil dont la
vague 3 aura besoin.

**Ce qu'il reste à faire est court**, et c'est ce qui rend le refus supportable : aligner
trois délais et une borne (Q-19, Q-20), écrire trois essais qui manquent (Q-21), et
corriger trois phrases (Q-17, Q-18, Q-22).

---

## 2. Comment cette porte a été jouée

Rien de ce qui suit ne repose sur la lecture seule du code, ni sur la démonstration de
quelqu'un d'autre. Chaque affirmation porte la commande qui la produit.

| Élément | Ce que j'ai monté |
|---|---|
| Base | **`grc_audit_s2v`**, neuve (`db/dev/preparer_base_dev.sh --base grc_audit_s2v --recreer`), plus **`grc_audit_s2v_sab`** et **`grc_audit_s2v_sab2`** pour les sabotages de schéma, plus une centaine de bases jetables ouvertes par `ouvrirBaseEssai` |
| Copie de travail | **Une copie complète du produit hors du dépôt** (`…/scratchpad/s2v/copie`), où vivent **toutes** les mutations. Le dépôt n'a jamais été modifié |
| Serveur | `construireServeur()` réel, monté une trentaine de fois, en `developpement` et en `production`, par `inject()` **et** par un vrai port (`ecouter()`) pour les essais d'interruption |
| Navigateur | Playwright / Chromium, les 32 essais de `test/navigateur/`, rejoués **neuf fois** sous mutation |
| Sondes écrites par moi | **46 sondes hostiles** (entêtes, cookie, URL, corps, noms d'entité, noms de champ, pollution de prototype, bornes), plus quatre sondes de mesure (Q-9, Q-10, coupure client, pouvoir de détection du garde-fou d'entropie) |
| Mutations | **14 mutations de code** (marquées `S2V-…` dans la copie) plus **2 sabotages de schéma** sur base vivante, chacune appliquée seule, compilée, jouée, puis annulée |

### Ce que j'ai vérifié de mon propre outillage avant d'accuser le code

C'est le point sur lequel le passage précédent avait mis la barre, et il avait raison :
j'ai rejeté **quatre** de mes propres sondes avant qu'elles ne me fassent écrire une
sottise.

1. **Ma copie de travail rend exactement la même chose que le dépôt.** Sans quoi tout
   écart mesuré aurait pu être le mien :

   ```
   dépôt   : npm test → tests 541 · pass 541 · fail 0   (68,4 s)
   copie   : npm test → tests 541 · pass 541 · fail 0
   ```

2. **Ma première mutation du générateur de ré-émission ne compilait pas** (`error TS6133:
   'createHash' is declared but its value is never read`). Le banc rendait alors
   « 8 échecs » qui n'étaient qu'un `tsc` en panne. Je l'ai réécrite pour qu'elle garde
   l'import, revérifié `npm run verifier-types` → 0 erreur, et seulement ensuite lu le
   résultat.
3. **Ma première sonde hostile se trompait d'enveloppe.** Elle envoyait
   `{ nom: … }` là où la route attend `{ champs: { … } }` : les 400 qu'elle récoltait
   venaient du schéma Fastify, et **le moteur n'était jamais atteint**. Une sonde qui
   n'atteint pas ce qu'elle prétend éprouver est le décor que ce rapport reproche aux
   autres. Réécrite au contrat réel (`SCHEMA_CREATION`, `SCHEMA_MODIFICATION`), avec un
   **témoin de création légitime en tête** qui échoue bruyamment si la sonde ne parle plus
   au serveur.
4. **Ma sonde de profondeur JSON débordait avant le serveur** (`RangeError: Maximum call
   stack size exceeded` dans `JSON.stringify` de l'injecteur). Corps reconstruit à la
   main, et la borne du moteur a alors répondu.
5. **Ma première sonde Q-9/Q-10 rendait `400` partout** — mon enveloppe ne respectait pas
   `SCHEMA_REPRISE` (`fichier: { nom, contenu }`, le contenu étant du **texte**). Les
   « 4 ms » qu'elle mesurait étaient le temps d'un refus de schéma, pas celui d'une
   reprise. Corrigée, la même sonde mesure 19,6 s.

### Contrôles d'environnement, joués avant tout le reste

```
$ git status --porcelain                    (vide, avant / pendant / après)
$ git log -1 --format="%H %s"
f68f799ff774311cf4eca2464d77be05b92c8229 Q-15 : le périmètre était plus large que le cas qui l'a révélé

$ npm run verifier-types                    → aucune erreur
$ npm audit --omit=dev                      → found 0 vulnerabilities
$ npm audit                                 → found 0 vulnerabilities
$ npm test                                  → ℹ tests 541 · pass 541 · fail 0 · duration_ms 68424

$ node db/migrate.mjs --verifier            → « garde-fous du schéma : aucune anomalie », code 0
$ psql -U grc_app -f db/verifier_cloisonnement.sql
  +-----------+---------+---------+
  | contrôles | réussis | échoués |
  +-----------+---------+---------+
  |       107 |     107 |       0 |
```

Machine : Node 22.22.2, **PostgreSQL 16.13** (la cible est 17), Ubuntu, `psql` 16.13,
Playwright global, Chromium. **Apache est absent** — voir §7.

---

## 3. Le sort des seize constats du registre

Colonnes : ce que le registre annonce, ce que j'ai fait pour le vérifier, ce que je
conclus. **Je n'ai fermé aucun constat sur la foi d'un texte.**

| # | Annoncé | Ce que j'ai joué | Verdict |
|---|---|---|---|
| **Q-1** | ✅ corrigé, attend le rejeu | Générateur ramené à **32 bits** (`randomBytes(4)` complété) dans ma copie ; `verifierRegistre()` refuse le démarrage (« 20000 tirages n'ont rendu que 19999 suffixes distincts ») et 32 essais sont annulés. Point d'appel tracé : `verifierGenerateurIdentifiants` → `verifierRegistre` → `assurerDepot` → crochet `onReady` | ✅ **fermé et rejoué** — mais le garde-fou lui-même est faible : constat **Q-17** |
| **Q-2** | ✅ corrigé, attend le rejeu | `identifiantDerive()` re-salée d'un aléa dans ma copie (mutation compilée, `verifier-types` vert) → le serveur refuse de démarrer, « Ré-émission d'identifiant : elle n'est pas déterministe (constat Q-2) », 8 échecs. Essai dédié rouge | ✅ **fermé et rejoué** |
| **Q-3** | ✅ corrigé, attend le rejeu | Les cinq comportements neufs, mutés un par un. **Deux mordent** (entropie de `UI.genId` ramenée à mille valeurs → rouge ; `ordonnerCreations` ré-indexée par identifiant → rouge). **Trois ne mordent pas** : canari de doublons, signalement de rétrécissement, sondage qui pousse — banc vert 32/32 dans les trois cas | ⚠️ **fermé en apparence** — constat **Q-21** |
| **Q-4** | ✅ corrigé, attend le rejeu | Lu `README` §8 et `CHANGELOG` en entier. Le bloc « ce qui est prouvé, et ce qui ne l'est pas » est **exemplaire** : il nomme sa révision de mesure, distingue *mesuré* / *corrigé* / *rejoué*, et refuse explicitement de recopier le registre — y compris par un décompte | ✅ **fermé** ; réserve mineure au §5 (chiffres arrêtés à `fef2db3`, Q-15 absent du journal) |
| **Q-5** | ✅ corrigé (`005`) | Deux sabotages sur bases dédiées. (a) `drop function f_verifier_couverture_rls()` + RLS retirée de `risques` → `controle_disparu`, **code 7**. (b) La fonction **re-signée** (argument par défaut ajouté) + RLS retirée → `controle_resigne`, **code 7**. `f_consigner_controles_schema()` lu ligne à ligne : elle **n'enlève jamais** une entrée, donc le filet de `migrate.mjs` ne peut pas absoudre la migration qui retranche | ✅ **fermé et rejoué**, sur ses deux scénarios |
| **Q-6 (a)(c)** | ✅ corrigés | En-tête d'`applyImport` et anomalie `identifiant-duplique` relus : ils décrivent le comportement réel | ✅ **fermés** |
| **Q-6 (b)** | ◐ reporté L3, §22 E5 | **La migration `005` §9 l'a fermé**, par `comment on index` et `comment on column`, exactement comme le §23 le prescrit. Vérifié dans le catalogue : `col_description('imports','cle_idempotence')` rend le texte corrigé, qui cite « constat Q-6 b » | ✅ **fermé — et le report annoncé est périmé** : constat **Q-22** |
| **Q-7** | ✅ corrigé | `src/api/index.ts:798` appelle `engendrerIdentifiant('IMP')`. Balayage complet : aucun `Math.random` dans `backend/src/**` | ✅ **fermé** |
| **Q-8** | ✅ corrigé | `parcourirEcarts` est bien le parcours unique, à deux réglages ; `unVolumeABouge` ne canonise rien. **Aucun essai de performance au banc** : la mesure « 3 ms au lieu de 41 » ne vit que dans un commentaire, et rien ne la rejoue | ✅ **fermé** sur le fond ; la mesure reste invérifiable par le banc (observation §6) |
| **Q-9** | ouvert, reporté **L7** | Mesuré : 12 000 → **19,6 s** ; 60 000 → **98,9 s** ; dix reprises simultanées → **HTTP 500 pour tout autre appel**, après 5 s | ❌ **report à revoir** : la gravité écrite est fausse — constat **Q-20** |
| **Q-10** | ouvert, reporté **L3** | Mesuré en `production` (barrière fermée) : corps de 16,5 Mio → **503 en 108 ms** ; corps minuscule → **503 en 1 ms**. Facteur 100, payé avant toute décision | ✅ **report défendable** — la mesure confirme le registre, et le remède (`onRequest` + limitation de rythme) est bien de L3, condition E4 |
| **Q-11** | ◐ documenté, non fermé | L'argument tient : le repli n'est atteignable que sur 404/405 (`repriseIndisponible`), donc contre un serveur antérieur. Le bandeau est éprouvé **dans les deux sens** (identifiant court → il nomme la réécriture et son compte ; identifiant canonique → il se tait), ce qui est la bonne façon | ✅ **refus argumenté, et l'argument tient** |
| **Q-12** | ✅ corrigé | `grep -rn "Vault\." js/ index.html` hors `vault.js` ne rend que `js/app.js:7 Vault.boot(...)`. L'en-tête dit exactement cela | ✅ **fermé et rejoué** |
| **Q-13** | ✅ corrigé | Aucun `Math.random`, `randomBytes` ni `getRandomValues` dans `backend/src/reprise/**`. `identifiantDeFichier()` dérive de `(collection, rang, contenu)`, marque `-d-` | ✅ **fermé** |
| **Q-14** | ouvert, reporté **L5** | Report défendable en soi (le garde-fou SQL est trop **strict**, il ne laisse rien passer). Mais son jumeau côté TypeScript est trop **laxiste**, et personne ne le porte : constat **Q-17** | ✅ **report défendable**, à traiter avec Q-17 |
| **Q-15** | ✅ corrigé | `reprendreRenommages()` retiré du `finally` de `cycle()` → l'essai dédié devient **rouge** (« La page ne revient jamais au repos après une réécriture de références »). L'essai porte bien la **propriété**, pas le remède, et il a son contrôle symétrique | ✅ **fermé et rejoué** — réserve de couverture au §6 |
| **Q-16** | ouvert | Vérifié : l'annotation du `CHANGELOG` est là, elle est juste, et elle est écrite comme un journal doit l'être — par annotation, pas par réécriture. Le **produit** reste sans filet : les 26 modules ne sont visités que par un balayage de 28 routes de liste et 14 de fiche, sans aucun geste métier | ✅ **ouvert, correctement décrit** |

---

## 4. La grille §4, contrôle par contrôle

| # | Verdict | Ce que j'ai exécuté, et ce que cela a rendu |
|---|---|---|
| **S1** | ✅ | `db/verifier_cloisonnement.sql` sous **`grc_app`** : 107 contrôles, 107 réussis, 0 échec, code 0. **Sabotage** : `force row level security` retiré de `risque_exigences` dans `004_rls.sql` → la base ne se monte plus du tout, `test/base/{demonstration,rls,socle}` s'effondrent (238 essais, 0 passé). **Sabotage du script lui-même** : un contrôle cesse d'être consigné → `AssertionError : 106 contrôle(s) joué(s) pour un plancher de 107`. Le plancher est un vrai plancher. |
| **S2** | ✅ | **46 sondes écrites par moi** : douze formes d'entête (`x-filiale`, `grc-filiale`, `x-perimetre`, `x-administration-groupe`, `x-utilisateur`…), cinq paramètres d'URL, un cookie composite, et `filiale_id` dans le corps. **Aucune ne fait bouger le périmètre** ; le corps est refusé en 400 nommé. `PUT` et `DELETE` sur `RISK-B` depuis la filiale A → 404, et **la ligne B est relue intacte** par une connexion tierce. La propriété est tenue par la forme : `resoudre()` ne prend aucun argument, `appliquerPerimetre` passe les quatre réglages en paramètres liés, et le domaine `id_metier` refuse la virgule qui scinderait `grc.filiales`. |
| **S3** | ⬜ sans objet | Journal d'audit : **lot L5**. La table existe, l'API ne l'écrit jamais. La réserve C22 (lecture du journal non cloisonnée) est écrite dans la démonstration elle-même et reste un livrable ferme de L5 (§22 E6). |
| **S4** | ✅ | `version` est **structurelle** (`SCHEMA_MODIFICATION`), jamais dans `champs` : la sonde `{champs:{version:99}}` reçoit « Le champ « version » n'appartient pas à l'entité « risques » ». Idem `cree_le`, `cree_par`, `modifie_par`, `filiale_id`, `id` — **refusés, pas ignorés**. Deux navigateurs sur la même fiche : le second reçoit `GRC03` et garde sa saisie (essai du banc, rejoué). |
| **S5** | ✅ | Balayage mécanique des 22 interpolations de gabarit contenant un mot-clé SQL dans `src/**` : **toutes** sont des jointures de listes construites par `ident()`, dont la liste blanche est `^[a-z_][a-z0-9_]{0,62}$` et qui **lève** sinon. Sondes : huit noms d'entité hostiles, deux noms de champ à guillemet et à apostrophe, `__proto__`, `constructor` — 400 ou 404, aucun message ne porte de SQL, de nom de table, de `SQLSTATE` ni de pile. `({}).pollue === undefined` après les sondes de prototype. |
| **S6** | ⬜ sans objet (L3) — **barrière provisoire vérifiée** | En `production` : `/api/session`, `/api/donnees`, `/api/entites/*`, `/api/reprise` → **503** ; `/api/sante` → 200. **Sabotage** : une route `GET /api/annuaire` ajoutée sans barrière → l'essai de complétude la **nomme** (`+ 'GET /api/annuaire'`, `+ 'HEAD /api/annuaire'`). C'est le garde-fou dont la vague 3 aura besoin, et il fonctionne. |
| **S7** | ⬜ sans objet | Droit d'export distinct : **lot L3** (§3.3). Aucun droit n'existe encore. |
| **S8** | ✅ | Balayage du dépôt : aucun secret, aucune clé, aucun `.env` versionné. Le seul mot de passe en clair est `dev`, dans `db/dev/preparer_base_dev.sh`, gardé par un refus sous `NODE_ENV=production` ; le `SESSION_SECRET` du banc est explicitement « sans valeur aucune ». Aucune réponse d'API ne porte de secret. |
| **S9** | ⬜ sans objet | Pièces jointes : **lot L6**. |
| **S10** | ✅ | `nosniff` **et** `no-store` sur `/api/sante`, `/api/donnees` et sur une route inconnue — succès comme échec. CSP du vhost : `script-src 'self'` sans `unsafe-inline` ni `unsafe-eval`. **Zéro gestionnaire en ligne** dans les 26 modules (les sept occurrences de `onclick="` sont des commentaires qui expliquent leur propre conversion). L'essai de CSP est doublé d'un contrôle de matière contre le fichier du vhost, et d'un contrôle de morsure du détecteur lui-même. |
| **S11** | ⬜ sans objet | Limitation de rythme : **lot L3**, avec la condition E4. |
| **S12** | ✅ | « Cachée » et « absente » rendent une réponse **identique au caractère près**, référence d'incident exclue. Six sondes d'erreur : aucune pile, aucun nom de table, aucun `SQLSTATE`. Une réponse non JSON venue du frontal est traduite sans rien apprendre de plus. *Nuance* : le 500 que produit l'épuisement du pool (Q-20) est générique — donc conforme à S12 — mais **trompeur** pour l'exploitant, qui lira « incident » là où il faudrait « serveur saturé ». |
| **S13** | ⚠️ **passé avec une réserve aggravée** | Les quatre exigences littérales sont tenues, et je les ai toutes éprouvées : corps > 26 Mio → **413** ; `nom` de 200 001 caractères → 400 nommé (199 000 passe : la borne est exacte) ; 91 champs → 400 ; profondeur 5 000 → 400 ; horodatage illisible → 400 ; 40 000 enregistrements dans une collection → **413** ; pool borné à 10. **Mais aucun délai de garde ne borne la durée totale d'une requête** : `statement_timeout` borne l'instruction, `idle_in_transaction_session_timeout` borne l'inactivité, et Fastify n'a ni `requestTimeout` ni `connectionTimeout`. Une reprise légitime tient donc une connexion 98,9 s, et dix la mettent à genoux (**Q-20**). Je ne marque pas S13 en échec parce que ses quatre items sont là ; je note que leur **suffisance** ne l'est pas, et que la réserve n'est plus « elle tient à la machine de développement ». |
| **S14** | ✅ | Reprise en une transaction : un fichier dont un enregistrement est refusé ne modifie rien ; l'aperçu applique puis annule et ne laisse **aucune** ligne dans `imports` ; « Remplacer » ne touche pas la filiale voisine ; la propagation est tout ou rien. Rejoué par le banc et par ma sonde d'interruption, qui montre l'autre face : la transaction **va au bout** même quand le client est parti (voir Q-19). |
| **S15** | ✅ | `npm audit --omit=dev` → 0 vulnérabilité ; `npm audit` complet → 0. Deux dépendances d'exécution seulement (`fastify`, `pg`), épinglées par `package-lock.json`. |
| **S16** | ✅ | Trois garde-fous éprouvés **par leur débranchement**, pas par leur lecture. (a) `f_verifier_schema()` : disparition → code 7 ; re-signature → code 7. (b) `verifierGenerateurIdentifiants` : entropie affaiblie → le service **ne démarre pas**. (c) Complétude des routes : route neuve → l'essai la nomme. Le registre `controles_schema` est **ajout seul**, et la consignation de `migrate.mjs` ne s'exécute que si des migrations ont été appliquées — le chemin « rien à appliquer » **compare sans consigner**, ce qui est la bonne moitié du mécanisme. |
| **S17** | ❌ **EN ÉCHEC** | La preuve exigée est « le chemin complet, dans la configuration de déploiement réelle — vhost compris ». Il ne l'a pas été pour la reprise. Confronté aux valeurs du fichier livré, le chemin **casse** : `ProxyTimeout 60` et `DELAI_CHARGEMENT_MS = 60000` coupent, le serveur valide quand même. Mesuré sur un vrai port : client interrompu à 4 s → `AbortError` ; **12 000 lignes en base 20 s plus tard**. Constat **Q-19**. Le reste de S17 est, lui, réellement tenu : 28 écrans et 14 fiches sous la CSP exacte du vhost, zéro violation, zéro erreur de console. |
| **S18** | ✅ | Le geste complet — bouton « Nouveau », formulaire, enregistrement, case à cocher, « Supprimer sélection », confirmation — aboutit et la base le confirme. **Sabotage** : `recalerBalisage()` entièrement neutralisé → l'essai S18 devient rouge. *Nuance mesurée* : en ne retirant que la réécriture d'attributs et en laissant le filet, le banc **reste vert** — la propriété est tenue, le mécanisme choisi ne l'est pas (observation §6). |

**Décompte** : 12 passés, 5 sans objet, **1 en échec (S17)**.

---

## 5. Les constats neufs

La série continue après Q-16.

### Q-19 — 🟠 majeur — Le déploiement livré coupe la reprise à 60 s, et le serveur valide quand même

**Le mécanisme, en trois lignes qui ne se contredisent chacune nulle part :**

* `backend/deploy/apache/cyber-grc.conf:99` — `ProxyTimeout 60`, justifié par le
  commentaire des lignes 96-98 : *« Aligné sur le délai de requête du pool applicatif
  (BASE_DELAI_REQUETE = 15 s) plus la marge des opérations composites : **au-delà, la
  requête est perdue de toute façon**, et la connexion Apache immobilisée pour rien. »*
* `cyber-gouvernance_V4/js/core/api.js:29` — `DELAI_CHARGEMENT_MS = 60000`, employé par
  `reprendre()` (ligne 197) via un `AbortController`.
* `backend/src/serveur.ts:48` — l'instance Fastify n'a **ni `requestTimeout` ni
  `connectionTimeout`** ; le gestionnaire de `/api/reprise` court jusqu'au bout.

**La mesure qui les met en contradiction** (`scratchpad/s2v/sonde-coupure.mjs`, serveur
réel sur un vrai port, `fetch` avec `AbortController`) :

```
avant : 0 ligne(s)
le client abandonne apres 4003 ms -> AbortError : This operation was aborted
  a t+9000 ms  : 0 ligne(s) en base
  a t+14000 ms : 0 ligne(s) en base
  a t+19000 ms : 0 ligne(s) en base
  a t+24000 ms : 12000 ligne(s) en base      ← la transaction a été VALIDÉE
  a t+29000 ms : 12000 ligne(s) en base
```

**Le seuil, mesuré puis interpolé** (`sonde-q9q10.mjs`, `sonde-q9bis.mjs`) :

```
12 000 enregistrements -> 200 en  19 569 ms
60 000 enregistrements -> 200 en  98 862 ms   (3 collections à leur plafond)
```

soit ≈ 1,65 ms par enregistrement, donc **60 s ≈ 36 000 enregistrements**. Le produit,
lui, **annonce** un plafond de 20 000 par collection sur 21 collections
(`BORNES.lignesParCollection`, rendu au navigateur par `/api/modele`) : **420 000
enregistrements, soit environ 11,5 minutes** — onze fois au-delà de ce que la
configuration de déploiement peut porter. Deux collections pleines suffisent déjà à
franchir les 60 s.

**Ce que voit l'utilisateur.** Le navigateur affiche « Le serveur n'a pas répondu dans le
délai imparti. » (`api.js`, branche `AbortError`) — et le sondage ramènera silencieusement
les données 20 s plus tard, par l'écart de volume. Autrement dit : **on lui dit que sa
restauration a échoué, puis ses données apparaissent.** Dans un outil qui héberge le PCA
du groupe et sert de preuve en audit, c'est le pire moment pour être ambigu.

**À la décharge du code** — et il faut le dire pour ne pas gonfler le constat — rien n'est
détruit : la reprise est transactionnelle et converge (Q-2), donc un nouvel essai ne clone
pas. Et `refusDeReprise()` est **correctement** écrit : il n'ajoute sa phrase rassurante
(« Aucune donnée n'a été modifiée ») que sur un 4xx, jamais sur une coupure. Le défaut est
d'information et de configuration, pas d'intégrité.

**Comment le fermer, et pourquoi c'est court.** Trois nombres et une phrase :
(1) porter `ProxyTimeout` et `DELAI_CHARGEMENT_MS` à une valeur qui couvre le plafond
annoncé, **ou** (2) borner la reprise à ce que 60 s permettent et le dire dans
`/api/modele` comme les autres bornes, et (3) réécrire le commentaire du vhost, qui
affirme aujourd'hui le contraire de ce qui se passe. La solution (2) ferme aussi Q-20.

**Reproduction** : `node scratchpad/s2v/sonde-coupure.mjs` depuis `backend/`.

---

### Q-20 — 🟠 majeur — Q-9 requalifié : 98,9 s pour une reprise, et un HTTP 500 pour tous les autres

Le registre classe Q-9 en 🔵 **mineur** et le reporte au lot L7, sur la mesure « une
reprise de 12 000 enregistrements tient une connexion du pool 20 s ». Mon mandat me
demande de refuser tout report qui, à la mesure, se révélerait plus grave qu'annoncé.
Il l'est, sur deux axes.

**Axe 1 — la durée est cinq fois celle qui a servi à accorder le report.**

```
2 000  -> 200 en   3 303 ms
6 000  -> 200 en   8 702 ms
12 000 -> 200 en  19 569 ms      ← la mesure du registre
60 000 -> 200 en  98 862 ms      ← trois collections à leur plafond annoncé
extrapolation aux 21 collections pleines (420 000) : ~692 s
```

**Axe 2 — la conséquence n'est pas « le pool est occupé », c'est « le service répond
500 ».** Dix reprises simultanées de 8 000 enregistrements, et un utilisateur ordinaire
qui lit pendant ce temps (`sonde-q9ter.mjs`) :

```
pool max = 10, delai de connexion = 5000 ms
AU REPOS            : GET /api/donnees -> 200 en 45 ms
PENDANT DIX REPRISES: GET /api/donnees -> 500 en 5002 ms | 500 en 5001 ms | 500 en 5002 ms
                                          | 500 en 5001 ms | 500 en 5000 ms
reprises : 200,200,200,200,200,200,200,200,200,200
```

Cinq lectures sur cinq en **erreur interne**, après cinq secondes d'attente chacune. Rien
ne distingue, pour l'exploitant, cette saturation d'un défaut du produit.

**Ce que je conteste, et ce que je ne conteste pas.** Je ne conteste pas que le remède de
fond — l'idempotence portée par la requête, la reprise fractionnée — appartienne au lot
**L7** : c'est écrit, daté, et cohérent. Je conteste (a) la **gravité** inscrite au
registre, qui repose sur un chiffre cinq fois trop bas, et (b) l'idée qu'il n'y ait rien à
faire d'ici là. Une borne sur le nombre total d'enregistrements d'une reprise — la même
borne que Q-19 réclame — coûte quelques lignes et referme les deux.

**Reproduction** : `node scratchpad/s2v/sonde-q9bis.mjs` et `sonde-q9ter.mjs`.

---

### Q-21 — 🟠 majeur — Trois des cinq comportements de Q-3 ne sont exercés que dans le sens du silence

Le rapport quater faisait de Q-3 un majeur en nommant **cinq** comportements neufs sans
essai : « entropie de `UI.genId`, indexation par rang, canari de doublons, signalement de
rétrécissement, sondage qui pousse ». Le `CHANGELOG` déclare aujourd'hui les cinq
« désormais exercés ». J'ai muté les cinq, un par un, dans ma copie.

| Comportement | Mutation | Banc navigateur |
|---|---|---|
| Entropie de `UI.genId` | retour à `Math.random()*1000`, sans compteur | ❌ **rouge** (BARRIÈRE 1) |
| Indexation par rang | `ordonnerCreations` ré-indexée par identifiant | ❌ **rouge** (BARRIÈRE 2) |
| **Canari de doublons** | `doublons.add(...)` supprimé (`sync.js:758`) | ✅ **vert 32/32** |
| **Signalement de rétrécissement** | corps de `signalerRetrecissement` vidé | ✅ **vert 32/32** |
| **Sondage qui pousse** | `|| aDesModificationsEnAttente()` retiré de `sonder()` | ✅ **vert 32/32** |

**Pourquoi les trois derniers ne mordent pas, et pourquoi c'est instructif.** Les essais
qui les touchent ne les interrogent **que dans le sens du silence** : « sur un lot sain,
le bandeau ne doit rien dire », « aucun défaut interne ne doit être annoncé ». Un essai
qui n'exige que du silence ne peut pas échouer quand on retire ce qui parle. C'est
exactement la question que le chantier a formulée aujourd'hui : *la question utile n'est
pas « est-ce que ça passe », c'est « qu'est-ce qui passerait aussi »*. Ici, ce qui
passerait aussi, c'est **l'absence du mécanisme**.

Le cas du canari est le plus net : c'est lui qui, dans la démonstration du quatrième
passage, affichait « Identifiants en double détectés » quand le générateur était saboté à
trois valeurs. La chaîne `Identifiants en double` n'apparaît **dans aucun essai du
dépôt** (`grep -rn "Identifiants en double" backend/test/` → rien).

Je le classe majeur, et non mineur, pour une raison de méthode : c'est le **même** constat
que Q-3, redéclaré fermé. Le chantier a déjà payé une fois un « corrigé » qui ne l'était
pas (Q-1), et il vient d'annoter vingt-trois entrées de son journal pour la même raison
(Q-16). Trois assertions à écrire — dans le sens où le mécanisme **parle**.

**Reproduction** : les trois mutations sont d'une ligne chacune ; les journaux de banc
sont dans `scratchpad/s2v/mut-canari.txt`, `mut-retrec.txt`, `mut-sondage.txt`.

---

### Q-17 — 🔵 mineur — Le garde-fou d'entropie mesure une longueur, pas une entropie

C'est **Q-14 mot pour mot**, transposé du garde-fou SQL au garde-fou TypeScript — sauf
que Q-14 est trop strict (il crierait à tort) et que celui-ci est trop laxiste (il se
tairait à tort). Il est, lui, sur le chemin qui écrit.

`backend/src/entites/index.ts:4406` :

```ts
const bits = alea.length * Math.log2(36);
if (!/^[0-9a-z]+$/.test(alea) || bits < BITS_ALEA_MINIMUM) { … }
```

`alea` vient d'`enBase36()`, qui fait `padStart(LONGUEUR_ALEA, '0')` : **sa longueur est
toujours 25**, quelle que soit l'entropie réellement tirée. Le premier contrôle est donc
structurellement incapable d'échouer tant que l'encodage ne change pas. Il ne reste que le
second : 20 000 tirages doivent rendre 20 000 suffixes distincts. Mesuré (200 exécutions
par palier) :

```
16 bits d'aléa : le garde-fou mord  200/200 fois  (collisions attendues : 3.05e+3)
24 bits        :                    200/200       (1.19e+1)
32 bits        :                      8/200       (4.66e-2)
40 bits        :                      0/200       (1.82e-4)
48 bits        :                      0/200       (7.11e-7)
56 bits        :                      0/200       (2.78e-9)
```

Le `CONVENTIONS.md` §2 norme **52 bits au minimum**. Le garde-fou attrape sûrement en
dessous de ~26 bits, attrape une fois sur vingt-cinq à 32 bits, et **ne voit rien au-delà
de 40**. Il existe donc une bande de 27 à 52 bits où le générateur viole la norme écrite
et où tous les contrôles restent verts.

*Honnêteté sur la portée* : ma mutation à 32 bits **a** été attrapée dans la campagne
complète, parce que le garde-fou tourne à chaque montage de serveur et que vingt tirages
indépendants finissent par en toucher un. C'est un rattrapage statistique, pas une
propriété — et il disparaît dès 40 bits.

Remède : mesurer ce que la norme énonce — le nombre d'octets réellement tirés — au lieu du
nombre de signes rendus. À traiter avec Q-14, dont c'est le même défaut de dimension, et
qui appartient au lot L5.

**Reproduction** : `node scratchpad/s2v/pouvoir-detection.mjs 200`.

---

### Q-18 — 🔵 mineur — Un troisième commentaire faux dans `001_socle.sql`, vivant dans le catalogue

`backend/db/migrations/001_socle.sql:103-106` pose, et la base porte aujourd'hui :

```
Clé primaire métier au format "<PRÉFIXE>-<horodatage>-<aléa>" (ex. RISK-1720000000000-482).
Ni UUID ni serial : le format de l'application navigateur est conservé pour garantir
un round-trip exact à l'import d'un export grc-backup.
```

Trois choses y sont fausses, et la troisième est celle qui coûte.

1. Le domaine **n'impose pas** ce format. Vérifié :

   ```
   accepté : 7
   accepté : ACT_2019_007
   accepté : une phrase entière comme identifiant
   ```

2. L'exemple `RISK-1720000000000-482` illustre le générateur à **mille valeurs**, celui
   que le chantier a éliminé partout et qui lui a coûté son seul bloquant.
3. **« le format … est conservé pour garantir un round-trip exact »** est la justification
   que le chantier a déclarée fausse et **vérifiée fausse**. `src/entites/index.ts:4294`
   l'écrit noir sur blanc : *« C'était faux, et vérifié faux : la reprise recopie les
   identifiants du fichier tels quels […] et s'appuyer sur lui pour justifier son format
   aurait rendu intouchable le format d'un générateur qu'il a précisément fallu changer
   (constat Q-1). »* Le `PLAN_EXECUTION` §7 en fait l'un de ses trois exemples de la
   journée. La formulation exacte survit dans la migration, et **dans le catalogue**.

**Pourquoi le balayage de Q-6 ne pouvait pas le voir.** Son script
(`scratchpad/balayage.py`) déclare `PERIMETRE = ["cyber-gouvernance_V4/js/core",
"cyber-gouvernance_V4/js/services"]` et cherche « tout symbole cité entre accents graves
qui n'existe plus hors commentaire ». Deux angles morts : il ne couvre pas
`backend/db/migrations/**`, et il cherche des **renvois morts** alors que la leçon du
§7 dit que *« le cas le plus fréquent n'est pas le renvoi mort, c'est la justification »*.
Le commentaire de `id_metier` ne cite aucun symbole disparu ; il énonce une causalité
fausse. La parade adoptée ne couvre donc pas la classe que le chantier nomme lui-même
comme la plus fréquente.

**Ce qu'il faut en faire**, et pas autre chose : la migration `001` est appliquée et son
empreinte est tenue — le §23 est clair, on ne la réécrit pas. La correction est un
`comment on domain id_metier` dans la migration de L3, **à ajouter à la condition d'entrée
E5**, qui ne nomme aujourd'hui que les deux commentaires de `imports`.

---

### Q-22 — 🔵 mineur — Trois renvois vers le registre ont divergé de ce qu'il dit

Le chantier interdit de recopier le registre, et il a raison. Mais il l'a **cité** à trois
endroits, et les trois citations ont vieilli.

1. **Q-6 (b) est annoncé reporté, il est fermé.** Le registre porte « (b) reporté L3,
   §22 E5 », le `PLAN_EXECUTION` §7 lui consacre un encadré d'arbitrage (« La correction
   prend donc la forme d'instructions `comment on` dans la **prochaine** migration, celle
   du lot L3 »), et le `CONVENTIONS.md` §22 en fait la condition d'entrée **E5**. Or la
   migration `005` §9 l'a fait, exactement comme prescrit, et le catalogue dit vrai depuis.
   « La prochaine migration » s'est trouvée être `005`, pas celle de L3. Conséquence
   concrète : un agent de la vague 3 qui lit E5 le croira satisfait « par héritage » et ne
   cherchera pas le **troisième** commentaire, qui, lui, est toujours faux (Q-18).
2. **Le `CONVENTIONS.md` §2 attribue à Q-3 un manque que Q-3 ne dit pas.** Il écrit :
   *« Ce contrôle ne couvre que le générateur du serveur — […] celui du navigateur n'en a
   pas encore, et c'est le constat Q-3 du registre. »* Q-3 dit *« la moitié navigateur du
   correctif T-1 n'a aucun test »*, et il est déclaré corrigé. Le manque réel — **aucun
   garde-fou d'exécution sur `UI.genId`** — est exact et n'appartient à personne : il
   quittera le registre avec Q-3, sans avoir jamais été porté. C'est la forme même que le
   chantier a payée deux fois : *un constat chiffré et non attribué est un constat perdu*.
3. **Les chiffres du `README` §8 et du `CHANGELOG` s'arrêtent à `fef2db3`** (534 essais)
   quand `HEAD` est `f68f799` (541). Ce n'est **pas** un défaut : les deux documents
   nomment explicitement leur point de mesure, ce qui est la bonne pratique et je tiens à
   le dire. En revanche, **Q-15 — un majeur trouvé et corrigé après — n'apparaît nulle
   part hors du registre** : ni dans le `CHANGELOG`, ni dans le `README`. Un lecteur du
   journal ne saura jamais qu'une référence pendante a pu vivre en base.

---

## 6. Observations qui ne méritent pas de numéro

Elles ne sont pas des constats. Elles disent où le dispositif est mince, et pourquoi j'ai
jugé que ce n'était pas grave.

* **Le mécanisme choisi pour N-3 n'est pas protégé, seule la propriété l'est.** En ne
  retirant que la réécriture d'attributs de `recalerBalisage()` et en laissant le filet
  (`traceResiduelle` → `reafficher`), le banc reste **vert 32/32**. Le commentaire du code
  l'annonce et dit pourquoi le filet ne suffirait pas — *« il ramène l'écran là où pointe
  l'adresse, et vole donc une navigation en cours — mesuré sur le module Incidents »*.
  Cette mesure n'est nulle part au dépôt. C'est Q-16 à échelle réduite ; je le signale
  sans le compter, parce que la propriété, elle, est bien tenue (retrait complet → rouge).
* **L'essai de Q-15 n'exerce pas le déclencheur que le registre décrit comme le pire.**
  Il joue le cas « valeur métier égale à un identifiant court » (celui de Q-11). Le second
  chemin — *« une vraie référence, écrite au serveur à un cycle précédent parce que la
  création qu'elle vise avait échoué sur une coupure passagère »* — n'a pas d'essai. Le
  correctif le couvre par construction (`renommagesAPousser` ne retient que ce que le
  serveur détient déjà, et la comparaison finale décide), et j'ai vérifié que `renommer()`
  n'a qu'un seul appelant (`ecrireCreation`, `sync.js:1215`). C'est une couverture mesurée
  en gestes, pas en états ; elle suffit ici, elle ne suffira pas toujours.
* **Le contrôle de matière de la CSP est un `includes`.** `vhost.includes(CSP_PRODUCTION)`
  attraperait un affaiblissement *à l'intérieur* de la directive, pas une seconde
  directive ni un `Header append` ailleurs dans le fichier. Le risque est théorique
  aujourd'hui ; il mérite d'être connu.
* **Q-8 n'a pas d'essai de performance.** La mesure « 3 ms au lieu de 41 » vit dans un
  commentaire de `sync.js`. Aucun banc ne la rejoue, donc aucune régression de coût ne
  serait vue. La correction structurelle, elle, est réelle et son trou historique
  (`collectionsAuVolumeIncertain` vidée) est désormais fermé et mord.
* **Le repli non cryptographique de `UI.genId`.** `aleaFort()` retombe sur `Math.random()`
  si `crypto.getRandomValues` manque, ce qui contredit la lettre du §2 (« tirés d'un
  générateur cryptographique »). Le repli est inatteignable dans le déploiement (contexte
  sécurisé HTTPS imposé par le vhost) et il est documenté sur place. Sans conséquence.
* **Le message d'un `PUT`/`DELETE` inconnu renvoie l'URL demandée.** C'est du JSON avec
  `nosniff` : aucune conséquence, mais c'est une réflexion, et je l'ai vérifiée avant de
  l'écarter.

---

## 7. Ce que j'ai cherché et n'ai pas trouvé

Pour que le sixième passage, s'il a lieu, aille chercher ailleurs. Chaque ligne est un
échec de ma part, et c'est ce qui la rend utile.

* **Une valeur du navigateur qui atteint un réglage de session** — douze formes d'entête,
  cinq paramètres d'URL, un cookie composite, `filiale_id` dans le corps. Rien. Et je n'ai
  pas trouvé de chemin *structurel* non plus : `resoudre()` est sans argument, et la seule
  autre entrée est l'environnement du processus.
* **Une injection SQL** — par nom d'entité (huit formes hostiles), par nom de champ (avec
  guillemet, avec apostrophe), par identifiant, par pollution de prototype. Les
  22 interpolations de gabarit du moteur passent **toutes** par `ident()`, dont j'ai lu et
  éprouvé la liste blanche.
* **Un champ système imposé par le client** — `version`, `cree_le`, `cree_par`,
  `modifie_par`, `filiale_id`, `id`, `portee_groupe` : tous **refusés et nommés**, jamais
  ignorés.
* **Une écriture qui franchit la frontière de filiale** — création, modification,
  suppression, propagation, reprise. `PUT`/`DELETE` sur une ligne voisine : 404, et la
  ligne relue intacte par une connexion tierce.
* **Un garde-fou décoratif dans le schéma** — j'ai débranché `f_verifier_couverture_rls`
  de deux façons différentes, et les deux font sortir le déploiement en code 7.
* **Une borne du moteur qui ne mordrait pas** — je les ai toutes franchies, une par une.
* **Un secret** dans le dépôt, dans une réponse, dans un message d'erreur.
* **Une fuite d'interne dans un message d'erreur** — six sondes, aucune pile, aucun nom de
  table, aucun `SQLSTATE`.
* **Un gestionnaire en ligne survivant** dans les 26 modules : zéro, et les sept
  occurrences textuelles de `onclick="` sont des commentaires qui racontent leur propre
  conversion.
* **Une régression du banc lui-même** : j'ai cherché des essais qui ne tombent sous aucune
  mutation raisonnable. J'en ai trouvé **trois** (Q-21) sur les quatorze mutations jouées ;
  les onze autres mordent, dont les deux barrières du bloquant T-1, la démonstration de
  cloisonnement (par son **plancher de contrôles**, pas seulement par son code de sortie)
  et le contrôle de complétude des routes.
* **Une modification du dépôt par mes propres essais** : `git status --porcelain` vide, et
  toutes mes mutations ont vécu dans une copie hors du dépôt.

---

## 8. Ce que je n'ai pas pu vérifier

* **Apache** : absent de la machine. Q-19 est établi en confrontant la valeur du fichier
  livré (`ProxyTimeout 60`) à une durée que j'ai **mesurée** sur le serveur réel, et en
  démontrant sur un vrai port que la transaction survit au départ du client. Ce n'est pas
  Apache qui a coupé ; c'est mon client, à la même échéance. `LimitRequestBody`, la
  redirection TLS, les `DirectoryMatch` et le `<FilesMatch>` restent non éprouvés.
* **Debian 13 et PostgreSQL 17** : tout a été joué sur **PostgreSQL 16.13**. Je n'ai relevé
  aucun emploi de fonctionnalité postérieure à 16.
* **L'Active Directory, ClamAV, le relais SMTP** : hors périmètre du lot et absents.
* **L'installation complète** : je n'ai exécuté aucune partie de `deploy/install.sh`.
* **Le comportement au volume réel côté navigateur** : mes mesures de reprise sont
  serveur ; je n'ai pas rejoué le sondage sur une filiale de 12 000 enregistrements comme
  l'avait fait le passage précédent. Q-8 est donc jugé sur la structure, pas sur le
  chronomètre.
* **La latence du VPN** : toutes mes mesures sont locales. Sur le lien réel, Q-19 se
  déclenche **plus tôt**, pas plus tard.
* **La validation du découpage Groupe/Filiale par le RSSI groupe** (risque P5) : toujours
  aucune trace dans le dépôt, et toujours attendue **avant la mise en service pilote**.
  C'est le cinquième passage de porte qui l'écrit.

---

## 9. Ce qu'il faut faire, et quand

| # | Constat | Échéance | Ce que ça coûte |
|---|---|---|---|
| **Q-19** | La reprise est coupée à 60 s et le serveur valide quand même | **à la fermeture de cette porte** | trois nombres à aligner, une borne à poser, une phrase de vhost à réécrire |
| **Q-20** | Q-9 requalifié : 98,9 s, et 500 pour tous à dix reprises | **gravité à corriger maintenant** au registre ; la borne ferme les deux avec Q-19 ; le fond reste **L7** | quelques lignes |
| **Q-21** | Trois comportements de Q-3 exercés seulement dans le silence | **à la fermeture de cette porte** — c'était déjà la condition posée deux passages plus tôt | trois assertions |
| **Q-18** | Commentaire faux, vivant, sur `id_metier` | **vague 3**, à ajouter à la condition d'entrée **E5** | un `comment on` |
| **Q-22** | Trois renvois vers le registre ont divergé | **à la fermeture de cette porte** — c'est le geste de fermeture lui-même | trois corrections de texte |
| **Q-17** | Le garde-fou d'entropie mesure une longueur | **L5**, avec Q-14, dont c'est le même défaut de dimension | une ligne |
| **Q-16** | Les 26 modules sont sans filet | **vague 3**, comme écrit | le vrai travail |
| **Q-9 / Q-10 / Q-14 / Q-6 (b)** | reports | Q-10 et Q-14 **tiennent** ; Q-6 (b) est **fermé**, le report est à retirer ; Q-9 devient Q-20 | — |

---

## 10. Ce qui est solide, et qu'il faut dire

Un rapport qui refuse une porte doit dire ce qu'il a essayé de casser sans y parvenir,
sans quoi son verdict est un caprice.

* **Le cloisonnement tient, et il tient sous sabotage.** 107 contrôles au vert sous le
  compte applicatif ; le retrait d'un seul `force row level security` empêche la base de
  se monter ; et le dispositif de preuve lui-même refuse de rétrécir — un contrôle
  escamoté et le banc dit « 106 pour un plancher de 107 ».
* **Le périmètre ne vient pas du navigateur, et ce n'est pas une discipline.** Quarante-six
  sondes n'ont rien bougé, mais surtout : il n'existe pas de chemin. `resoudre()` n'a pas
  d'argument, et c'est cette signature qui tient la propriété — ce que la vague 3 devra se
  rappeler, puisqu'elle écrit précisément la couche qui fabrique ce périmètre.
* **Les deux barrières du bloquant T-1 mordent, chacune séparément.** Générateur ramené à
  mille valeurs → rouge. Ré-indexation par identifiant → rouge. Une propriété tenue par la
  forme *et* éprouvée par le sabotage, c'est ce que le chantier cherchait depuis six
  passages.
* **Les garde-fous sont branchés, et le débranchement le prouve.** Trois mécanismes
  distincts — schéma, générateur, complétude des routes — refusent respectivement le
  déploiement, le démarrage et le banc. Le troisième nommera les routes que L3 ajoutera.
* **Le registre des garde-fous de la migration `005` est bien conçu** : ajout seul,
  comparaison nominative, retrait explicite par `f_retirer_controle_schema`, et une
  consignation qui **ne s'exécute pas** sur le chemin « rien à appliquer » — le seul
  endroit où elle aurait pu absoudre un sabotage.
* **La documentation est honnête, et elle m'a rendu service.** Le bloc « ce qui est prouvé
  et ce qui ne l'est pas » du `README` §8 distingue *mesuré*, *corrigé* et *rejoué*, nomme
  sa révision, et m'adresse une consigne que j'ai suivie à la lettre : ne rien prendre pour
  acquis, surtout ce qui est présenté comme la fermeture d'un constat. Trois de mes six
  constats sortent de cette consigne.
* **Le produit fonctionne, dans sa configuration de déploiement**, pour tout ce qui n'est
  pas la reprise volumineuse : 28 écrans, 14 fiches, cinq gestes réels, deux imports, un
  rechargement, sous la CSP exacte du vhost — zéro violation, zéro erreur de console.

Le lot est près d'être fini. Il ne l'est pas : il reste une chaîne qui casse entre trois
fichiers dont aucun n'a tort, et trois essais qui affirment protéger ce qu'ils ne
protègent pas. Les deux se corrigent en une journée. Ce qui ne se corrige pas, c'est un
« franchie » posé sur un contrôle en échec.
