# Plan produit — combler l'écart avec l'état de l'art GRC

> **Écrit le 08/09/2026**, après une comparaison mesurée du produit avec les plateformes
> GRC de référence du marché français et international (Tenacy, Egerie, CISO Assistant,
> Make IT Safe, grcboard ; Vanta, Drata, OneTrust, ServiceNow IRM, Archer, MetricStream,
> AuditBoard, Hyperproof, LogicGate, Centraleyes).
>
> **Ce document est le *quoi* de la suite du produit.** Il se lit après
> [`PLAN_SERVEUR.md`](PLAN_SERVEUR.md) — qui reste le cadrage d'architecture — et il
> s'exécute par [`PLAN_EXECUTION.md`](PLAN_EXECUTION.md), dont il prolonge les vagues et
> les portes. **Il ne remplace ni l'un ni l'autre, et il ne rouvre aucun de leurs
> arbitrages.**
>
> **Les verdicts de portes restent au `PLAN_EXECUTION.md` §7, seule source.** Rien ici
> n'est un verdict.

---

## 0. Pourquoi ce document

Le produit a été construit contre un besoin client précis — un groupe industriel de 20+
filiales, déploiement sur site, preuve en audit ISO 27001 — et jamais contre le marché.
C'était le bon ordre. Mais quinze lots plus tard, la question « où sommes-nous par rapport
à ce qui se fait de mieux ? » n'avait **jamais été posée avec des chiffres**.

Elle l'a été le 08/09/2026. La réponse tient en trois lignes :

- sur **86 fonctionnalités** relevées chez les leaders, le produit en couvre **35**, en
  couvre **17 partiellement**, et en **ignore 34** ;
- **les 34 absences ne sont pas réparties : 19 d'entre elles tiennent dans quatre blocs
  entiers** — intégrations/automatisation, tiers, vulnérabilités, intelligence
  artificielle. Retirez ces quatre domaines et la couverture passe de 51 % à **~70 %** ;
- sur **sept points mesurés, le produit est au-dessus du marché**, et deux d'entre eux
  (cloisonnement par RLS forcée, journal chaîné en ajout seul) sont des garanties que la
  majorité des plateformes SaaS ne peuvent pas offrir.

**Conclusion, et c'est la thèse de ce plan : ce n'est pas un produit incomplet, c'est un
produit positionné sur l'autre moitié du marché.** Il n'y a donc pas à le rattraper
partout — il y a à choisir les blocs qui comptent, et à renoncer par écrit aux autres.

---

## 0 bis. L'arbitrage d'ordonnancement — il prime sur tout ce qui suit

> ⚠️ **Aucun lot de ce plan ne se joue avant que la mise en service soit acquise.**

Au 08/09/2026, l'état est celui-ci, et il n'est pas négociable :

- la porte **S8** — *la condition de mise en service* — a été **jouée six fois et refusée
  six fois** ;
- la porte **S7 n'a jamais été jouée**, et elle reste due ;
- **sept livraisons** (D2, D1, D4, D5, la vérification d'intégrité, Q-248, Q-250) n'ont
  été soumises à **aucun auditeur indépendant** depuis le 6ᵉ passage de S8.

Un plan produit qui ajouterait dix lots par-dessus cet état ferait exactement ce que le
chantier a appris à ne plus faire : *un banc vert ne vaut pas un passage de porte*, et
*les constats fermés depuis un passage précédent ont déjà fait échouer le suivant — deux
fois sur Q-208*.

**La vague 10 de ce plan est donc « clore la mise en service », et elle ne contient aucune
fonctionnalité neuve.** Les lots L17 et suivants viennent après. C'est le seul
ordonnancement défendable, et il est écrit ici pour qu'aucune session future n'ait à le
re-décider.

**Exception unique, et elle est bornée :** le lot **L18 (installation)** touche
`deploy/install.sh` et la documentation, **jamais `src/` ni le schéma**. Il n'ouvre aucune
surface d'audit. Il peut donc être joué **en parallèle** de la vague 10, par quelqu'un qui
ne travaille pas sur les constats. C'est écrit au §8.

---

## 1. D'où l'on part — la mesure du 08/09/2026

Relevé dans le code, pas dans la documentation : 33 modules frontend (17 703 lignes),
50 tables, 20 migrations, 31 routes API, 20 domaines de droits, 5 référentiels totalisant
394 exigences.

### 1.1 Les sept points où le produit dépasse le marché

Ils sont listés d'abord, parce que **le plan doit les protéger avant de combler quoi que
ce soit**. Aucun lot de ce document n'a le droit de les affaiblir.

| | Ce qui distingue le produit | Ce qui le tient |
|---|---|---|
| 1 | **Cloisonnement multi-filiales par RLS forcée** | activée **et forcée** sur 50 tables, propriétaire compris ; clés étrangères et unicités **composites `(id, filiale_id)`** ; périmètre résolu par le serveur, revérifié à chaque requête |
| 2 | **Journal d'audit inaltérable** | ajout seul, chaîné par empreinte, 4 couches dont « le rôle applicatif n'est pas propriétaire de la table » |
| 3 | **Cartographie de dépendances, impact et SPOF** | dépendances typées, propagation transitive, le lien « sauvegardé par » ne propage pas de panne |
| 4 | **Profondeur PCA/PRA** | quatre modules dédiés, étapes RACI, exercices — territoire des spécialistes de la résilience |
| 5 | **Séparation catalogue Groupe / mise en œuvre Filiale** | `mesure_catalogue` vs `mesure_mise_en_oeuvre` ; l'écran Socle **refuse de coter**, pour que les 20 filiales restent comparables |
| 6 | **Réversibilité totale** | import 20 entités CSV+XLSX transactionnel et idempotent, export complet, reprise rejouant v1→v12 |
| 7 | **Pédagogie intégrée** | `Help.tip()` systématique — or « interface trop complexe » est le premier motif d'échec des déploiements GRC |

À quoi s'ajoute **AirCyber à 234 questions**, que personne d'autre ne porte : sur la chaîne
aéronautique française, c'est un différenciateur sec.

### 1.2 Les trois écarts qui coûtent

1. **L'automatisation de la preuve.** Zéro connecteur, zéro test automatisé, face à 375
   intégrations et 1 200 tests chez Vanta, un test horaire chez Drata. C'est *la* fracture
   du marché 2026. ⚠️ **Et l'on-premise est ici un avantage, pas un handicap** : le
   produit est déjà *dans* le réseau du client, et il porte déjà un client LDAPS écrit à
   la main. Interroger l'annuaire, un serveur de sauvegarde ou l'antivirus local est plus
   simple chez nous que depuis un SaaS.
2. **EBIOS RM.** La méthode F×G×M est cohérente et défendable en interne ; elle ne l'est
   pas dans un appel d'offres qui écrit « EBIOS RM » au cahier des charges. C'est le
   ticket d'entrée français face à Egerie et Tenacy.
3. **Le tiers.** 1 fonctionnalité sur 6, et c'est le besoin le plus tendu du marché
   français : la première remise du registre d'information DORA à l'ACPR est au
   **31/03/2026**.

---

## 2. Les principes de ce plan

**P1 — On ne construit pas ce qu'on ne peut pas garder.** Chaque lot arrive avec ses
essais, ses garde-fous de schéma branchés sur `f_verifier_schema()`, et sa porte. Un lot
sans morsure n'est pas un lot, c'est un commentaire (§18.4 des conventions).

**P2 — La simplicité est une fonctionnalité, pas une finition.** Deux lots entiers y sont
consacrés (L17 prise en main, L18 installation), et ils passent **avant** les lots de
fonctionnalités. Motif mesuré : le produit exige aujourd'hui **74 variables
d'environnement**, un fichier `filiales.conf` écrit à la main *avant* l'installation, la
création manuelle de 23 groupes Active Directory, et il n'offre **aucune recherche**. Un
outil que personne n'installe et dans lequel personne ne retrouve rien n'a pas de
fonctionnalités — il a une liste de fonctionnalités.

**P3 — Rien ne sort de la machine.** La contrainte du `PLAN_SERVEUR` §0.2 tient : aucun
CDN, aucun service tiers, aucune donnée qui part. Elle disqualifie d'office la notation
externe de fournisseurs, les benchmarks sectoriels et toute IA appelée en ligne. Ce n'est
pas une faiblesse à contourner, c'est **l'argument de vente n°1** face à des concurrents
100 % SaaS.

**P4 — Un non-objectif écrit vaut mieux qu'un objectif qui traîne.** Le §6 liste ce qu'on
ne fera pas et pourquoi. Une session future qui veut le rouvrir devra écrire son
arbitrage, pas simplement « le marché le fait ».

**P5 — Chaque lot énonce son critère d'acceptation en une phrase mesurable.** Pas « la
recherche fonctionne », mais « un terme présent dans une autre filiale ne remonte
jamais, et l'essai rougit quand on retire la clause de cloisonnement ».

---

## 3. Vague 10 — clore la mise en service *(prérequis, aucune fonctionnalité neuve)*

| Réf | Objet | Critère |
|---|---|---|
| **V10.1** | **Jouer la porte S7**, jamais jouée | Relecture métier et **paraphrase délibérée des catalogues** (droit d'auteur, `PLAN_SERVEUR` §4.2). Verdict inscrit au `PLAN_EXECUTION.md` §7. C'est le point le plus facile à manquer : **aucun échec ne le signale** |
| **V10.2** | **Rejouer la porte S8 — 7ᵉ passage** | Auditeur n'ayant écrit aucune des lignes examinées. Porte sur les sept livraisons non auditées depuis le 6ᵉ passage |
| **V10.3** | **Q-243** — troncature de queue du journal indétectable | Ancrer la tête de chaîne, **ou** corriger la phrase du plan qui promet plus que ce qui est tenu. Les deux sont acceptables ; le silence ne l'est pas |
| **V10.4** | **Q-247** — la barrière `GRC06` ne vérifie pas l'empreinte | Documenté et délibéré aujourd'hui. À trancher : fermer, ou reconduire par écrit avec propriétaire et échéance |
| **V10.5** | **Q-234, Q-235, Q-236, Q-238 → Q-241, Q-244** | Gardes qui ne mordent pas assez, résidus de désinstallation, journal des portes non gardé |
| **V10.6** | **Q-205 b, Q-206** | Aperçu d'import sans trace ; deux erreurs de fond dans le catalogue ANSSI français |
| **V10.7** | **Q-214 b, c, d, f** | Promotion de pièce avant `commit` sans réconciliation disque↔base ; quota lu puis consommé dans deux transactions ; trois collections non bornées ; trois valeurs pour la borne de corps |

**Condition de sortie de la vague 10 : S7 franchie et S8 franchie.** Tant qu'elle n'est
pas remplie, les lots ci-dessous n'existent que sur le papier.

---

## 4. Les lots — L17 à L26

### L17 — Prise en main : retrouver, comprendre, commencer 🔴

> **Le lot qui change le plus la perception du produit pour le coût le plus faible.**

**Pourquoi.** Le produit porte 33 modules et 394 exigences, et **on ne peut rien y
chercher**. C'est le seul défaut que chaque utilisateur rencontre à chaque session. La
recherche était déjà planifiée (action **D3**, vague 9) et délibérément reportée après
S8 — ce report est ici honoré, pas contourné : L17 se joue après la vague 10.

| Réf | Action | Critère d'acceptation — mesurable |
|---|---|---|
| **17.1** | **Recherche globale** — `tsvector` natif PostgreSQL sur les entités textuelles, sans dépendance neuve. L'extraction du contenu des PDF est un **second temps**, et elle passe par la même chaîne contrôlée que ClamAV | Une recherche rend les objets attendus **dans le périmètre de la session seulement**. ⚠️ Une recherche est un **oracle** : l'essai vérifie qu'un terme présent dans une autre filiale ne remonte **jamais**, et **il rougit quand on retire la clause de cloisonnement** (morsure obligatoire) |
| **17.2** | **Palette de commandes** (`Ctrl+K`) — aller à un module, ouvrir une fiche, lancer une action, sans passer par le menu | La palette n'offre **que** les modules que les droits de la session autorisent. Un essai avec le compte `sans.groupe` obtient une palette vide |
| **17.3** | **Écran de démarrage par rôle** — « par où je commence ? ». Trois à cinq gestes proposés selon le profil résolu (RSSI filiale, direction, contributeur, qualité, DPO), disparaissant à mesure qu'ils sont faits | L'écran est **dérivé des droits et des données**, jamais d'une liste écrite à la main : un profil neuf ne doit pas produire un écran vide en silence |
| **17.4** | **Regroupement du menu** — 33 entrées, c'est trop. Regrouper en 6 familles repliables (Pilotage · Conformité · Risques · Opérations · Résilience · Administration) sans supprimer aucune route | Toutes les routes existantes répondent à l'identique. Le fil d'Ariane reste juste |
| **17.5** | **Vue Kanban du plan d'actions** — par statut, glisser-déposer, en complément de la liste et de l'échéancier | Le déplacement d'une carte écrit par la **même route** que le formulaire, verrouillage optimiste compris. Un conflit de version affiche le même message qu'ailleurs |
| **17.6** | **Comparaison de deux versions d'un document** — la version en vigueur et une antérieure, côte à côte | Les deux pièces sont délivrées par l'API, journalisées comme deux téléchargements. Aucune extraction de contenu à ce stade |

**Périmètre exclusif** : `backend/db/migrations/021_*`, `backend/src/entites/**`,
`cyber-gouvernance_V4/js/core/ui.js`, `js/app.js`, `js/modules/*` (menu et démarrage).

**Ligne de la grille comblée** : #30 · #48 · partiellement #26.

---

### L18 — Installation en une commande 🔴 *(jouable en parallèle de la vague 10)*

> **Ce lot ne touche ni `src/`, ni le schéma, ni le frontend.** Il n'ouvre aucune surface
> d'audit — c'est ce qui l'autorise à se jouer avant que les portes soient franchies.

**Pourquoi, mesuré.** Pour installer aujourd'hui, il faut : écrire `filiales.conf` à la
main *avant* de lancer quoi que ce soit ; renseigner à la main les secrets LDAP, SMTP et
l'empreinte du compte de secours ; créer 23 groupes Active Directory ; puis lancer une
seconde commande pour vérifier que ce qui est servi correspond au dépôt. `install.sh`
s'arrête en code 2 sur une configuration incomplète — ce qui est **juste**, mais ne dit pas
comment la compléter.

⚠️ **Ce paragraphe annonçait « 74 variables d'environnement ». Le chiffre était faux, et le
corriger a changé le contenu du sous-lot 18.5 — voir la note qui l'accompagne.** Mesuré le
08/09/2026 : `src/config/index.ts` en lit **68**, et *un chiffre faux dans un plan est un
constat, pas une coquille* (`PLAN_EXECUTION.md` §5).

| Réf | Action | Critère d'acceptation — mesurable |
|---|---|---|
| **18.1** ✅ **livré le 08/09/2026** | **`install.sh --assistant`** — un dialogue qui pose les six questions, propose un défaut mesuré pour chacune, écrit `/etc/cyber-grc/env` et `filiales.conf`, puis installe. Il ne remplace pas le mode non interactif : il l'**alimente** | ✅ **rempli.** Éprouvé par pseudo-terminal dans les deux branches, avec saisies invalides — URL sans schéma, mot de passe trop court, code de filiale « GROUPE » : les trois refus bouclent. **Rien n'est écrit avant le récapitulatif** (vérifié : refus final → aucun fichier). Exige un terminal, sinon il échoue. ⚠️ **Reste à mesurer sur une VM neuve** : `--assistant` → `https://<hôte>/` → 200. Ne peut pas se jouer ici sans réinstaller par-dessus la recette |
| **18.2 a** ✅ **livré le 08/09/2026** | **Profil « découverte », côté configuration** — annuaire désactivé, **compte de secours** (identifiant + mot de passe, empreinte `scrypt` calculée par `dist/auth/secours.js` et non recopiée en shell), relances désactivées, **certificat auto-signé engendré** — sans lui Apache refuse de démarrer et la promesse « en dix minutes » ne tient pas | ✅ **rempli.** `CYBER_GRC_PROFIL=decouverte` est **écrit dans la configuration** et le `--diagnostic` le rend en réserve. Un essai exige que le certificat **n'apparaisse jamais en production** : un certificat que personne n'a décidé apprend aux utilisateurs à passer outre les avertissements TLS |
| **18.2 b** | **Le bandeau dans le produit** — « installation de découverte, non conforme à un usage de production » | ⚠️ **Seul sous-lot de L18 qui touche `src/` et la SPA** : un champ dans `GET /api/session`, un bandeau permanent. À déclarer au 7ᵉ passage de S8. Sans lui, le profil reste visible du seul exploitant — pas de l'utilisateur qui saisit |
| **18.3** | **`install.sh --diagnostic`** — une commande unique qui rend l'état des dix points qui cassent en vrai : services, publication servie == dépôt, RLS forcée, propriété de la base, chaîne du journal, joignabilité LDAP, sortie SMTP, ClamAV, certificat, espace disque | Sortie en **code 0 / 1 / 2** exploitable par une supervision. Chaque ligne dit **quoi faire**, pas seulement ce qui ne va pas. `--verifier-publication` y est **intégré**, plus une commande à ne pas oublier (constat Q-103) |
| **18.4** | ⚠️ **DÉJÀ LIVRÉ — mesuré le 08/09/2026, ce sous-lot n'existait pas.** `groupes-ad.sh --powershell --ou <DN>` rend depuis longtemps un script PowerShell idempotent, qui ne supprime jamais rien | ✅ **rempli avant d'être demandé.** Joué sur la recette : 23 groupes, 2 filiales actives, 8 profils, en-tête portant l'origine de chaque source. **Le défaut réel était de découvrabilité** : `filiales.conf.exemple` documentait `--powershell`, mais le guide d'installation que je venais d'écrire renvoyait vers `--csv`, moins utile. Corrigé dans `docs/INSTALLER.md` |
| **18.5** | ⚠️ **RÉÉCRIT le 08/09/2026 après mesure — l'objectif d'origine était déjà atteint.** Ne pas réduire le nombre de variables : **le dire**. Le chemin nominal exige **six valeurs**, pas soixante-huit | ✅ **mesuré, pas estimé** : `src/config/index.ts` lit **68** variables ; `install.sh` n'en réclame que **six** à l'exploitant (`SERVEUR_URL_PUBLIQUE`, plus `LDAP_URL`, `LDAP_BASE_RECHERCHE`, `LDAP_DN_SERVICE`, `LDAP_MOT_DE_PASSE_SERVICE` si l'annuaire est actif, plus `SMTP_HOTE` si les relances le sont) ; **deux** sont engendrées (`SESSION_SECRET`, `APPLICATION_VERSION`) ; **quatre** sont exigées par le serveur (`BASE_MOT_DE_PASSE`, `SESSION_SECRET`, `LDAP_MOT_DE_PASSE_SERVICE`, `BASE_SSL_CA` si SSL vérifié) ; **toutes les autres portent un défaut sûr**. Le travail est donc de **documenter les six** et de faire poser exactement ces questions par l'assistant |
| **18.6** | **Guide « installer en 10 minutes »** — une page, dix commandes, zéro renvoi | Un lecteur qui n'a jamais vu le projet installe sans ouvrir un autre fichier |
| **18.7** | **Assistant de premier démarrage dans le produit** — après l'installation : créer la première filiale, activer ses référentiels, importer l'annuaire, déposer la première politique | ⚠️ **Il ne crée aucune donnée métier.** Il conduit l'utilisateur vers les écrans qui existent. Voir l'arbitrage **A2** du §7 sur le jeu de découverte |

⚠️ **Trois fois dans ce seul lot, la mesure a contredit le plan** — 18.4 était déjà
livré, 18.5 déjà atteint, et le chiffre de 74 variables était faux. Un plan écrit sans
mesurer ne se trompe pas au hasard : il fait travailler sur des problèmes qui n'existent
pas, **et il le fait avec conviction**. Le correctif n'est pas d'écrire des plans plus
prudents, c'est de **mesurer avant d'écrire chaque sous-lot**, comme le §0 du `CLAUDE.md`
l'exige déjà pour l'environnement.

⚠️ **La leçon de 18.5, et elle vaut au-delà de ce lot.** J'avais écrit « 74 variables »
sans les compter, et bâti un sous-lot entier sur ce chiffre : *réduire la surface de
configuration*. La mesure a montré que **la surface était déjà de six**, et que le défaut
n'était pas le nombre — c'était que **rien ne dit lesquelles**. Un plan bâti sur un chiffre
supposé fait travailler sur le mauvais problème, et il le fait avec conviction. C'est le
§0 du `CLAUDE.md` appliqué à un plan plutôt qu'à un environnement : *avant d'écrire qu'une
chose est difficile ici, mesurez-la.*

**Périmètre exclusif** : `backend/deploy/**`, `docs/GUIDE_EXPLOITATION.md`,
`backend/README.md`.

⚠️ **Correction du 08/09/2026 — ce plan se contredisait lui-même, et le relever vaut mieux
que le laisser courir.** Le périmètre était écrit « aucun fichier de `src/` », alors que
**18.2 exige un bandeau visible DANS le produit** — ce qu'aucun fichier de `deploy/` ne
peut produire. Éditer à la main l'`index.html` publié est exclu : le jeton de version en
dérive, et une copie manuelle sert un fichier que les navigateurs gardent un mois
(constat **Q-103**). Le périmètre réel est donc :

| Sous-lot | Périmètre | Surface d'audit |
|---|---|---|
| **18.1, 18.3, 18.4, 18.5, 18.6** | `deploy/**` et documentation seulement | **aucune** — jouables avant les portes |
| **18.2** (bandeau découverte) | + un champ dans `GET /api/session` et un bandeau dans la SPA | **minime, mais réelle** — à déclarer au 7ᵉ passage de S8 |
| **18.7** (assistant de premier démarrage) | frontend | **réelle** — après les portes |

**Ce que je ne fais pas pour préserver la fiction d'un lot sans surface** : renoncer au
bandeau. Un profil « découverte » invisible depuis le produit **devient une installation de
production par oubli**, et c'est précisément le défaut que 18.2 existe pour empêcher. On
préfère déclarer dix lignes à auditer plutôt que livrer une configuration silencieusement
dégradée.

⚠️ **Garde qui ne se négocie pas** : les blocs de contrôle d'`install.sh` sont extraits par
le banc via les marqueurs `# >>> banc: <nom> <<<`. Toute réécriture du script **conserve
les marqueurs et leurs ancres** — le banc doit refuser un bloc vide, sans quoi ces essais
passent au vert en n'éprouvant rien.

---

### L18 bis — Jeu de découverte 🟢 *(après les portes — il écrit en base)*

**Autorisé par arbitrage de l'utilisateur le 08/09/2026** (§7, A2), sous **cinq conditions
constitutives**. Il ne se joue pas avec L18 : L18 est un lot de déploiement, celui-ci écrit
des lignes métier et emprunte le déclencheur de purge — donc il passe par une porte.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **18b.1** | **Marque d'origine dans la donnée** — une colonne `origine` valant `decouverte`, portée par les entités engendrées, reprise à l'export, à l'impression et au journal | ⚠️ La liste des entités marquées est **découverte dans le catalogue**, pas écrite à la main : une entité oubliée produirait une ligne de démonstration **indiscernable d'une ligne réelle** — exactement l'échec silencieux que la règle des listes proscrit |
| **18b.2** | **Chargement sur geste volontaire**, depuis les réglages, jamais par l'installateur | Aucun appel depuis `install.sh`, et un essai le vérifie sur le script lui-même |
| **18b.3** | **Refus si la base porte des données réelles** — le contrôle cherche **toute ligne non marquée**, pas un compteur | Un essai insère une seule ligne réelle et exige le refus |
| **18b.4** | **Purge complète en un clic** — pièces jointes comprises, par le déclencheur `017` | Après purge : 0 ligne marquée, 0 fichier dans le magasin, file de purge vide — les trois mesures de D2 |
| **18b.5** | **Interdit hors du profil découverte**, refus journalisé | Le refus porte le gabarit de route, comme `GRC06` |

**Porte** : rejoue le cloisonnement sur les entités marquées, et la purge sur les six
chemins de cascade.

---

### L19 — La chaîne de preuve : attester, déroger, relier 🟠

**Pourquoi.** Le pivot « Mesure de sécurité » est le meilleur atout fonctionnel du produit,
et la chaîne qui va de la politique à la preuve s'interrompt trois fois : un document n'est
relié qu'à un *référentiel*, jamais à une *mesure* ; une preuve appartient à un seul
porteur ; et rien n'atteste qu'une politique a été lue.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **19.1** | **Attestation de lecture d'une politique** — un document en vigueur peut exiger une attestation ; l'écran de démarrage la réclame ; le taux de couverture est un indicateur | Preuve d'audit **ISO 27001 A.5.1**. Table neuve avec `filiale_id`, RLS **activée et forcée**, unicité **composite** `(document_id, personne_id, filiale_id)`. Action `attestation` au journal |
| **19.2** | **Dérogations datées** — propriétaire, motif, échéance, approbation par le circuit L8 existant. Une dérogation échue **redevient une non-conformité**, sans intervention | L'échéance est **dérivée**, jamais recopiée : le calcul vit à un seul endroit, comme `PraMcoModule.isEnRetard` |
| **19.3** | **Lien document ↔ mesure** — la table `document_referentiels` relie au référentiel ; il manque le lien au pivot | La fiche Mesure affiche ses politiques ; la fiche Document affiche ses mesures. Clé étrangère **composite** |
| **19.4** | **Réutilisation d'une preuve** — une pièce jointe peut servir N contrôles sans être déposée N fois | ⚠️ **Le point dur** : le déclencheur `f_pieces_suivent_leur_porteur()` (migration `017`) supprime une pièce avec son porteur. Un partage naïf ferait disparaître une preuve encore utilisée ailleurs — **la suppression du dernier rattachement seule libère le fichier**, et l'essai le vérifie sur les six chemins de cascade, découverts dans `pg_constraint` |
| **19.5** | **Contrôles périodiques sur les mesures** — fréquence, prochaine échéance, preuve d'exécution, relance par L12 | Le modèle de `mco_actions` est **réutilisé, pas recopié** |
| **19.6** | **Efficacité distincte de la maturité** — deux dimensions, deux colonnes | La moyenne CMMI du tableau de bord n'est pas modifiée par cette addition |

**Lignes comblées** : #16 · #18 · #19 · #22 · #27 · #29.

---

### L20 — Conformité réglementaire opérationnelle 🟠

**Pourquoi.** Le produit sait dire qu'un incident est « à déclarer ». Il ne sait pas
**quand**, ni **avec quoi**. NIS2 impose trois paliers ; le produit n'en arme aucun.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **20.1** | **Horloge réglementaire à trois paliers NIS2** — alerte précoce **24 h**, notification **72 h**, rapport final **1 mois** ; plus le **72 h** RGPD | Les trois paliers apparaissent dans l'échéancier existant, avec leur reste-à-courir. ⚠️ Le calcul part de la **date de détection**, et l'écran dit **laquelle** — une horloge dont on ignore l'origine ne se défend pas devant l'ANSSI |
| **20.2** | **Génération des formulaires de notification** — ANSSI et CNIL pré-remplis depuis la fiche incident, en PDF, à relire et à envoyer par l'exploitant | ⚠️ **Le produit ne transmet rien à une autorité.** Il prépare ; l'humain envoie. Toute autre lecture serait une prise de responsabilité que le logiciel ne peut pas porter |
| **20.3** | **AIPD / PIA** — analyse d'impact RGPD reliée au traitement et aux mesures du pivot | Le registre art. 30 existant n'est pas dupliqué : l'AIPD **pointe** le traitement |
| **20.4** | **Demandes d'exercice de droits (DSAR)** — registre, délai d'un mois armé, traçabilité | Le délai emprunte le même mécanisme que 20.1 |
| **20.5** | **Main courante de crise** — horodatée, en ajout seul, exportable en fin de crise | ⚠️ **Ajout seul comme le journal d'audit** : une main courante rééditable ne prouve rien. Elle réutilise les quatre couches du §12 des conventions, elle ne les réinvente pas |

**Lignes comblées** : #41 · #42 · #43 · #77 · #78.

---

### L21 — Tiers, chaîne d'approvisionnement et DORA 🟠

> **Le domaine le plus faible du produit — 1 fonctionnalité sur 6 — et le besoin le plus
> tendu du marché français.**

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **21.1** | **Registre d'information DORA** — identifiant **LEI**, fonctions supportées, dates et nature contractuelles, criticité, **chaîne de sous-traitance** (rang 1, 2, n) | Export au format attendu par l'autorité. ⚠️ La chaîne de sous-traitance est **récursive** : un prestataire peut en porter d'autres. Contrainte anti-cycle en base, pas dans la route |
| **21.2** | **Questionnaire fournisseur** — construit depuis un référentiel existant, envoyé, relancé, réponses reversées sur la fiche | **Sans portail dans ce lot-ci** : le questionnaire s'exporte, se remplit hors ligne, se réimporte par le moteur d'import généralisé (L7). ⚠️ **Le portail est VALIDÉ et devient le lot L28** (arbitrage A3, 08/09/2026) — mais l'export **reste la voie de repli permanente**, et non un état transitoire : un fournisseur qui refuse un accès en ligne doit pouvoir répondre quand même |
| **21.3** | **Suivi contractuel et plan de sortie** — clauses de sécurité, dates de revue, réversibilité, plan de sortie daté | Les échéances contractuelles alimentent l'échéancier existant |
| **21.4** | **Scoring de risque fournisseur** — la criticité × accès existante devient un score composite intégrant la couverture des exigences et l'ancienneté de la dernière évaluation | Le score est **dérivé et recalculé**, jamais stocké figé |

**Lignes comblées** : #32 · #34 · #35 · partiellement #31.

---

### L22 — Ouverture technique : jetons, événements, connecteurs 🟠

> **Le lot qui débloque tous les suivants.** Sans lui, ni collecte automatique de preuve,
> ni surveillance continue, ni renvoi d'action vers l'outil des équipes.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **22.1** | **Jetons d'API** — portée, filiale, domaines, expiration, révocation, **droit d'export distinct** comme pour les sessions humaines | ⚠️ **Un jeton est un sujet de droits comme un autre** : il traverse `resoudre()` et la RLS, il ne les contourne pas. Un jeton ne peut jamais porter plus que le compte qui l'a créé, et l'essai le vérifie |
| **22.2** | **Journalisation des appels par jeton** | Toute action d'un jeton est traçable à la personne qui l'a émis |
| **22.3** | **Sorties événementielles (webhooks)** — création d'incident, franchissement d'échéance, refus d'approbation | ⚠️ `IPAddressDeny=any` de l'unité systemd **bloquera ces appels** si la destination n'est pas déclarée — c'est exactement le constat **Q-199**, où L12 était livré dans une configuration qui ne pouvait pas envoyer, **avec un banc vert**. L'essai de ce lot part de l'unité livrée, pas d'une configuration de développement |
| **22.4** | **Cadre de connecteurs** — un contrat unique : identité, périmètre, fréquence, journalisation, mode dégradé | ⚠️ **La liste des connecteurs actifs se découvre**, elle ne s'écrit pas : un connecteur ajouté sans être déclaré doit **échouer bruyamment**, jamais être ignoré en silence (règle des listes écrites à la main, `CLAUDE.md` §3) |
| **22.5** | **Trois premiers connecteurs, tous locaux** — **Active Directory** (comptes, groupes, dernières connexions) ; **serveur de sauvegarde** (dernière sauvegarde réussie, âge) ; **antivirus** (couverture du parc) | Chacun rend une **preuve datée** rattachée à une mesure. Trois suffisent à démontrer le cadre ; le catalogue s'étend ensuite sans nouvelle architecture |
| **22.6** | **Renvoi d'action vers Jira / ServiceNow** — l'action vit dans l'outil de l'équipe, son état revient | Facultatif, désactivé par défaut, sans dépendance nouvelle si inactif |

**Lignes comblées** : #20 · #23 · #50 · partiellement #56.

---

### L23 — Collecte automatique de preuve et surveillance continue 🔴 *(dépend de L22)*

**Pourquoi.** C'est la fracture n°1 du marché. Et c'est le lot qui transforme le produit
d'un **registre de ce que l'on déclare** en un **système qui constate**.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **23.1** | **Preuve collectée automatiquement** — un connecteur alimente la preuve d'une mesure, horodatée, avec sa source et sa fraîcheur | La fiche mesure distingue visuellement **preuve déclarée** et **preuve constatée**. ⚠️ Une preuve automatique **périmée** est plus dangereuse qu'une preuve absente : la fraîcheur est affichée, et une preuve expirée **redevient absente** |
| **23.2** | **Contrôle continu (CCM)** — un contrôle porte un test exécutable sur une source ; le résultat est daté et historisé | Le passage de vert à rouge **crée une action et notifie**, il ne se contente pas de changer une couleur |
| **23.3** | **Historisation des résultats** — la table `history` existante est réutilisée | Les courbes de tendance existantes accueillent les nouveaux indicateurs sans écran neuf |
| **23.4** | **Mode dégradé** — une source injoignable rend « indéterminé », **jamais « conforme »** | ⚠️ **Le point le plus important du lot.** Un test qui échoue à s'exécuter et qui rend « conforme » est une fausse assurance dans un outil produit en audit. L'essai coupe la source et **exige `indetermine`** |

**Lignes comblées** : #17 · #21.

---

### L24 — Campagnes et gouvernance descendante 🟢

**Pourquoi.** Le socle Groupe/Filiale est le meilleur atout architectural du produit, et
**rien ne permet au Groupe de lancer quoi que ce soit vers ses filiales**. La consolidation
regarde ; elle ne demande pas.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **24.1** | **Campagne d'évaluation** — le Groupe ouvre une campagne sur un référentiel, vers N filiales, avec échéance | Une filiale ne voit **que sa part**. Le cloisonnement de la campagne est éprouvé comme celui de la recherche : l'essai rougit si la clause tombe |
| **24.2** | **Suivi d'avancement consolidé** — par filiale, par répondant, par exigence | Un domaine hors droits rend **`null`, jamais zéro** — la règle de `/api/consolidation` s'applique telle quelle |
| **24.3** | **Relances automatiques** — L12 réutilisé, pas réécrit | Aucune route d'envoi neuve |
| **24.4** | **Accès contributeur restreint** — répondre à une campagne sans accéder au reste du produit | Le modèle de droits à 3 axes suffit : c'est un **profil**, pas un mécanisme neuf |

**Lignes comblées** : #5 · #66 · partiellement #39.

---

### L25 — Méthode de risque : EBIOS RM et quantification 🟢

**Pourquoi.** Ticket d'entrée français. ⚠️ **Et le lot le plus risqué du plan** : il touche
la méthode, donc les données déjà saisies.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **25.1** | **Les cinq ateliers EBIOS RM** — socle de sécurité, sources de risque, scénarios stratégiques, scénarios opérationnels, traitement | ⚠️ **En ADDITION, jamais en remplacement.** Les risques cotés en F×G×M restent valides et lisibles. Une migration qui les réinterpréterait réattribuerait **en silence** des cotations produites en audit — c'est exactement le motif qui a fait refuser la renumérotation ANSSI (**Q-192**) |
| **25.2** | **Écosystème et parties prenantes** — la cartographie de dépendances existante est **réemployée** comme support de l'atelier 3 | Aucun graphe neuf : le module Cartographie porte déjà les dépendances typées |
| **25.3** | **Échelles configurables par filiale** | ⚠️ Une échelle modifiée après coup rend les cotations existantes incomparables : le changement est **versionné et daté**, et les cotations portent l'échelle qui les a produites |
| **25.4** | **Quantification financière (FAIR)** — optionnelle, par risque | Une valeur en euros n'est affichée **que** si ses hypothèses sont saisies. Pas d'estimation par défaut : un chiffre inventé en comité de direction est pire que pas de chiffre |
| **25.5** | **Base de connaissances menaces / vulnérabilités types** | Alimente les ateliers 2 et 4. Portée Groupe, comme `risque_catalogue` |

**Lignes comblées** : #9 · #10 · #11 · #13 · partiellement #8.

---

### L26 — Catalogues ouverts 🟢

**Pourquoi.** Les référentiels sont aujourd'hui des **fichiers JavaScript versionnés** : une
évolution de norme est une livraison de code, et un client ne peut pas apporter sa propre
grille.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **26.1** | **Référentiels en base** — migration des cinq catalogues existants depuis les fichiers statiques | ⚠️ **Les auto-évaluations sont stockées par `(ref_id, code)`** : la migration **conserve les codes à l'octet près**, et un essai compare le catalogue migré au catalogue source, exigence par exigence. Une divergence silencieuse réattribuerait des réponses d'audit |
| **26.2** | **Import d'un référentiel client** — CSV/XLSX par le moteur d'import généralisé | Un référentiel importé se comporte comme un référentiel livré : radar, SoA, mapping, audit |
| **26.3** | **Versionnage d'un référentiel** — ISO 27002:2022 puis sa révision suivante, sans perdre les évaluations | Le passage d'une version à l'autre est **explicite et tracé** |
| **26.4** | **Correspondances suggérées** — proposer les rapprochements par similarité de libellé, à **valider par un humain** | ⚠️ Une correspondance appliquée sans validation propagerait un statut de conformité faux. La suggestion est une **proposition**, jamais une écriture |
| **26.5** | **Veille : signaler qu'un catalogue a vieilli** | Le produit ne va pas chercher la norme sur Internet (P3). Il **date** ses catalogues et signale l'ancienneté |

**Lignes comblées** : #1 · #2 · #4 · #3 renforcé.

---

### L27 — Assistance par IA : locale par défaut, externe sous conditions 🟢

> **Arbitré le 08/09/2026 (§7, A1).** Le modèle **local** est le chemin nominal. Un
> fournisseur **externe de confiance** reste possible — et il est encadré par la mécanique,
> pas par un texte.

**Les cinq usages, et pas un de plus.** L'IA **propose**, un humain **décide**. Aucun de ces
usages n'écrit en base sans validation explicite, et aucun ne porte de décision de
conformité :

| Usage | Ce que l'IA fait | Ce qu'elle ne fait jamais |
|---|---|---|
| Correspondances entre référentiels | propose des rapprochements | ne les applique pas — un statut de conformité propagé à tort est un faux en audit |
| Brouillon de politique | propose un texte à partir du canevas | ne publie pas : le circuit `GRC06` reste seul maître |
| Résumé d'incident | propose une synthèse | ne remplit ni la déclaration ANSSI ni la CNIL |
| Réponse à un questionnaire client | propose une réponse à partir des preuves existantes | ne l'envoie pas |
| Recherche en langage courant | reformule en filtres | **n'élargit jamais le périmètre** — la RLS borne, comme partout |

#### 27.1 Le mode LOCAL — le chemin nominal

Un modèle quantifié sur la VM du client, quelques Go de RAM, aucun appel sortant. C'est le
défaut, et c'est ce qui doit être proposé d'abord à tout client.

**Critère** : avec le mode local, `IPAddressDeny=any` de l'unité systemd reste **intact**.
Un essai le vérifie : *si la fonction marche alors que rien n'est ouvert, c'est qu'elle ne
sort pas.* C'est la seule preuve qui ne se contourne pas.

#### 27.2 Le mode EXTERNE — six barrières, dont une seule est un texte

⚠️ **Un panneau d'avertissement est la sixième, pas la première.** Voici l'ordre, du plus
dur au plus souple — et chacune existe parce qu'un avertissement seul serait oublié :

1. **Désactivé par défaut, et impossible à activer depuis l'interface.** Le mode externe
   s'active dans `/etc/cyber-grc/env`, par l'exploitant, en root. Aucune case à cocher ne
   l'ouvre : la décision d'exporter les données de gouvernance d'un groupe n'appartient pas
   à l'utilisateur qui a la fiche sous les yeux.
2. **La sortie réseau reste fermée tant que personne ne l'ouvre à la main.** L'unité systemd
   porte `IPAddressDeny=any` ; joindre un fournisseur externe exige d'ajouter *son* réseau à
   `IPAddressAllow`. **C'est une barrière physique, pas une promesse** — et c'est la leçon
   du constat **Q-199**, où L12 a été livré incapable d'envoyer *avec un banc vert*. Ici, ce
   défaut devient une **protection** : rien ne sort tant que l'exploitant n'a pas ouvert.
3. **Destination déclarée et vérifiée.** Un seul hôte, en configuration, avec son certificat
   vérifié. Aucune redirection suivie. ⚠️ Une redirection suivie ferait sortir la donnée
   vers un hôte que personne n'a déclaré.
4. **Ce qui part est minimisé, et MONTRÉ avant de partir.** L'utilisateur voit le texte
   exact qui sera transmis, et peut l'annuler. ⚠️ **Ne partent jamais**, quelle que soit la
   configuration : le contenu des pièces jointes, les entrées du journal d'audit, les fiches
   de l'annuaire des personnes, et **toute donnée d'une autre filiale que l'active**. Cette
   liste est appliquée par une **découverte** — les tables et colonnes concernées sont
   dérivées du catalogue, jamais énumérées à la main : une colonne ajoutée demain doit être
   exclue par défaut, pas incluse par oubli.
5. **Chaque appel est journalisé** — nouvelle action `ia_externe` : qui, quand, quelle
   destination, quel usage, combien d'octets. Le journal est en ajout seul : *une porte
   dérobée dont personne ne sait qu'elle a servi n'est pas une porte de secours* — c'est ce
   que dit déjà `src/auth/secours.ts`, et cela vaut ici mot pour mot.
6. **Et alors seulement, l'avertissement** : permanent dans le produit tant que le mode est
   actif — pas une fenêtre à fermer —, repris dans `--diagnostic` comme réserve, et rappelé
   au moment de chaque envoi. Même mécanique que le bandeau du profil découverte (18.2 b),
   pour la même raison : *ce qu'on ne voit pas devient une habitude*.

#### 27.3 Ce que « de confiance » doit vouloir dire, écrit noir sur blanc

Le produit ne peut pas juger un fournisseur ; il peut **exiger que le client l'ait jugé**.
La configuration porte donc quatre champs obligatoires, et le `--diagnostic` **rougit s'ils
sont vides** alors que le mode externe est actif :

- le **nom du fournisseur** et la **référence du contrat** ou de l'accord de traitement ;
- le **lieu d'hébergement** du traitement (l'UE change tout au regard du RGPD) ;
- **l'engagement de non-réentraînement** sur les données transmises — sa référence ;
- **qui, chez le client, a validé** — un nom, une date.

⚠️ **Ces champs ne protègent rien techniquement, et c'est assumé.** Ils existent pour qu'au
jour de l'audit, la question « pourquoi vos données de gouvernance sont-elles parties chez
ce fournisseur ? » ait une réponse écrite **avant** d'être posée, et pas improvisée après.

#### 27.4 Par filiale, jamais pour le groupe entier

Le mode externe s'active **par filiale**. Un groupe de vingt filiales dans plusieurs pays
n'a pas un régime unique : ce qui est validé en France peut ne pas l'être ailleurs, et
l'inverse. Une activation Groupe unique ferait sortir les données de dix-neuf filiales sur
la décision d'une seule.

**Critère d'acceptation du lot** : les cinq usages fonctionnent en local sans qu'aucune
sortie réseau ne soit ouverte ; en mode externe, un essai **coupe la destination** et
vérifie que le produit rend « indisponible » — **jamais une réponse inventée**, jamais un
silence. Et un essai vérifie qu'**une filiale sans activation ne peut pas déclencher un
appel**, même en empruntant l'écran d'une filiale qui l'a.

**Lignes comblées** : #36 · #68 · #69 · #70 · #72 (et #71 est déjà pris par L17, sans IA).

---

### L28 — Portail fournisseur exposé 🔴 *(le premier composant hors VPN)*

> **Validé le 08/09/2026 (§7, A3), avec consigne de le pousser aussi loin que possible.**

**Ce que le portail change.** L21.2 livre le questionnaire par export et réimport : cela
marche, et **cela reste la voie de repli permanente** — un fournisseur qui ne veut pas d'un
accès en ligne doit pouvoir répondre quand même. Le portail ajoute ce que l'export ne peut
pas donner : la relance qui suit toute seule, la preuve déposée à la source, l'historique
d'un fournisseur d'une campagne à l'autre, et la fin des classeurs qui reviennent par
courriel dans dix versions différentes.

⚠️ **Et il change la nature du produit** : jusqu'ici, tout vivait derrière un VPN. Ce lot
ouvre une porte sur l'extérieur. Il porte donc **la porte de sécurité la plus exigeante du
plan**, et il ne se joue **ni avant S8, ni en même temps qu'un autre lot**.

| Réf | Action | Critère d'acceptation |
|---|---|---|
| **28.1** | **Accès sans mot de passe** — un lien signé, à usage nominatif, **daté**, révocable, portant sur **un seul questionnaire d'une seule campagne** | ⚠️ **Pas de compte fournisseur, et c'est délibéré** : un compte, c'est un mot de passe à réinitialiser, une énumération possible, et une surface qui vit après la campagne. Un lien expire tout seul. L'essai vérifie qu'un lien expiré, révoqué, ou visant une autre campagne rend **404 — jamais 403** : un 403 confirmerait que la cible existe |
| **28.2** | **Cloisonnement du portail** — le fournisseur voit son questionnaire, et **rien d'autre** | La session du portail n'est **pas** une session du produit : elle ne traverse pas `resoudre()`, elle porte un périmètre **d'un seul objet**. ⚠️ C'est la surface la plus propice à une fuite entre filiales de tout le produit : la porte rejoue la grille §4 **entière** sur ce seul composant |
| **28.3** | **Dépôt de preuve par le fournisseur** — mêmes **huit contrôles** que le coffre L6, ClamAV compris | ⚠️ **Aucun chemin de dépôt parallèle.** Un fichier venu de l'extérieur passe par *la* chaîne, pas par une variante « simplifiée » écrite pour le portail — c'est ainsi qu'on se retrouve avec deux chaînes dont une seule est éprouvée |
| **28.4** | **Séparation au frontal** — vhost distinct, chemin distinct, **borne de corps et limiteur de débit propres**, en-têtes durcis | Éprouvé sur l'Apache livré, pas sur une configuration de développement (constats **Q-36**, **Q-44**) |
| **28.5** | **Relances et suivi** — échéance, rappels par L12, avancement visible côté client comme côté fournisseur | Le fournisseur voit **où il en est**, pas seulement qu'il est en retard |
| **28.6** | **Réponses reprises d'une campagne à l'autre** — le fournisseur reprend ses réponses précédentes et n'amende que ce qui a changé | ⚠️ Une réponse reprise porte **sa date d'origine**, visible : une réponse de 2024 présentée comme neuve serait un faux en audit |
| **28.7** | **Attestation rendue au fournisseur** — un récapitulatif de ce qu'il a déclaré, daté et signé numériquement, qu'il peut resservir à ses autres clients | C'est ce qui fait qu'un fournisseur **accepte** de répondre sérieusement : il y gagne quelque chose. Aucune donnée du client n'y figure |
| **28.8** | **Tout est journalisé** — ouverture du lien, réponse, dépôt, expiration | Actions neuves, tracées comme les autres |

**Porte S15 — la plus exigeante du plan.** Elle rejoue la grille §4 **intégralement** sur ce
seul composant, plus : énumération des liens, rejeu d'un lien expiré, tentative d'atteindre
une autre campagne, un autre fournisseur, une autre filiale ; dépôt hostile ; charge. ⚠️
**Elle est jouée par un auditeur qui n'a écrit aucune de ces lignes**, comme toutes les
autres — mais ici le refus doit être la position par défaut : *en cas de doute sur ce lot,
on ne livre pas.*

**Lignes comblées** : #32 (porté au niveau du marché) · renforce #31 et #35.

---

## 5. Ce que chaque lot doit respecter — les gardes du chantier

> ⚠️ **À relire avant d'écrire la première ligne de n'importe quel lot.** Chacune de ces
> règles a coûté un constat, souvent plusieurs.

1. **Toute table neuve porte `filiale_id`**, avec RLS **activée et forcée**, et **toutes**
   ses clés étrangères et unicités sont **composites** `(id, filiale_id)`. Une clé simple
   est satisfaite par une ligne **invisible** de la filiale voisine (`CONVENTIONS.md`
   §17.1, §19.1). Une table sans `filiale_id` s'inscrit dans la liste **écrite à la main**
   du §24 — et fait rougir deux contrôles jusqu'à ce qu'un humain tranche.
2. **Tout contrôle de schéma se branche sur `f_verifier_schema()`**, à la convention
   d'écriture `f_verifier_<x>()`, jamais par ajout à une liste. *Un garde-fou que rien
   n'appelle est un commentaire.*
3. **Aucune liste écrite à la main dont l'omission réussit en silence.** On découvre dans
   le catalogue (`pg_catalog` côté base, parcours de valeurs côté navigateur). La liste
   n'est le bon outil que lorsqu'une omission **échoue bruyamment** et qu'un humain doit
   décider (`CLAUDE.md` §3).
4. **Toute énumération neuve** ajoutée à un `check` du schéma est **gardée par
   `test/reprise/enumerations.test.mjs`**, par découverte dans `pg_constraint` — sinon
   l'écart n'éclate qu'à une restauration (constat **Q-248**).
5. **Tout champ neuf servi au navigateur traverse `normaliserListe()`** et est gardé par
   `test/pieces/champs-servis.test.mjs` — un champ filtré au passage laisse un écran vide
   **sans erreur**, invisible du banc navigateur comme des essais de module (constat
   **Q-250**).
6. **Le souligné initial est réservé aux champs que le serveur ajoute** ; l'écart est
   refusé par `f_verifier_champs_structurels()`.
7. **Aucune expression rationnelle à coût non borné dans `src/`** — ni construite, ni
   littérale portant une classe négative non bornée. Le contrôle balaie **tout `src/`**
   (constats **Q-208**, **Q-215**).
8. **Toute action neuve est journalisée**, et sa couverture est mesurée — pas déclarée.
9. **Échappement systématique** : `escapeHtml` sur toute donnée injectée, `I18n.valeur()`
   est un passe-plat dont la valeur vient de la base.
10. **Aucun gestionnaire en ligne** : la CSP du vhost livré les bloque.
11. **L'identifiant se lit dans le DOM au clic**, jamais capturé en fermeture : le serveur
    réattribue l'identifiant à la création.
12. **FR et EN dès la livraison**, jamais « à traduire plus tard ».
13. **Un correctif ne compte que s'il mord** : casser volontairement le remède et vérifier
    que le banc rougit. C'est la seule preuve qu'un essai couvre ce qu'il prétend couvrir
    (constat **Q-210** : deux correctifs justes, banc resté 30/30 vert).
14. **La boucle de livraison complète** : `npm test` avec `~/.grc-essais.env`,
    `npm run verifier-types`, `install.sh --maj`, puis **`--verifier-publication`**
    (constat **Q-103** : le dépôt était vert pendant que la machine servait l'ancien
    fichier).

---

## 6. Ce qu'on ne fait pas, et pourquoi

> Un non-objectif écrit vaut mieux qu'un objectif qui traîne. Une session future qui veut
> rouvrir l'un de ces points doit écrire son arbitrage, pas invoquer « le marché le fait ».

| Écarté | Motif |
|---|---|
| **Notation externe de fournisseurs** (surface d'attaque, type SecurityScorecard) | Suppose un appel à un service tiers depuis la machine du client. Contredit le principe **P3**. ⚠️ **À réexaminer après L27** : l'arbitrage A1 a ouvert une sortie externe encadrée par six barrières, et *la même mécanique rendrait ce service techniquement atteignable*. Je ne l'élargis pas de moi-même — **l'utilisateur a autorisé une IA externe, pas « les services tiers » en général**, et confondre les deux serait s'accorder une permission qu'on n'a pas reçue. À poser comme une question, le jour où un client le demande |
| **Benchmarks sectoriels** | Suppose de transmettre les données du client à un agrégateur. Même motif, en plus direct |
| **Gestion de vulnérabilités** (scan, registre CVE, remédiation) | Le produit doit **ingérer** un scanner par un connecteur L22, pas en devenir un. Le marché des scanners est mature ; y entrer diluerait le produit |
| **Plateforme de sensibilisation / phishing simulé** | Marché saturé de spécialistes. L'intégration (taux de complétion reversé comme preuve) est en revanche un connecteur L22 légitime |
| **Trust Center public** | Sans objet pour un déploiement sur site derrière VPN. La preuve vers l'extérieur passe par les exports, qui existent |
| **Pilotage par la valeur / coût des mesures** | Demande une donnée financière que le client ne saisira pas. À rouvrir seulement si un client la réclame **et** accepte de l'alimenter |
| **Découverte automatique d'actifs (CMDB)** | Partiellement couvert par le connecteur AD de L22. Une découverte réseau active est un outil d'audit intrusif, hors du rôle d'un GRC |
| **Clés primaires composites** | Déjà arbitré et **reporté par écrit** (`CONVENTIONS.md` §21). Ce plan ne le rouvre pas |

---

## 7. Trois arbitrages qui vous reviennent

> Ils ne sont pas tranchés ici parce qu'ils engagent le produit au-delà d'une session.

### A1 — L'intelligence artificielle ✅ **TRANCHÉ le 08/09/2026 — local par défaut, externe possible et encadré**

**Décision de l'utilisateur : le modèle LOCAL est la voie retenue, et la possibilité d'un
fournisseur externe de confiance est conservée, sous avertissement.**

C'est un arbitrage plus fin que celui que j'avais proposé, et il est défendable : refuser
tout appel externe ferme une porte que certains clients voudront ouvrir — un groupe qui a
déjà un contrat cadre avec un fournisseur d'IA, et un DPO qui l'a validé, n'a pas à être
privé de la fonction parce que *nous* avons décidé pour lui.

⚠️ **Mais un panneau d'avertissement seul ne suffit pas, et il faut le dire clairement.**
Un avertissement se lit une fois, se coche, et se transmet ensuite à des gens qui n'étaient
pas là. Or ce qui sortirait ici, ce sont des données de gouvernance cyber d'un groupe
industriel : scénarios de risque, écarts de conformité, constats d'audit, incidents. C'est
**exactement l'inventaire qu'un attaquant voudrait**. La décision est donc appliquée
intégralement — **et le garde-fou est mis dans la mécanique, pas seulement dans le texte**.

Cela devient le lot **L27**, ci-dessous.

### A3 — Le portail fournisseur ✅ **VALIDÉ le 08/09/2026 — et poussé aussi loin que possible**

**Décision de l'utilisateur : le portail exposé est retenu, et il faut le faire aussi bien
que possible.**

Ce que L21.2 livre sans portail — questionnaire exporté, rempli hors ligne, réimporté —
reste la **première étape** et la **voie de repli permanente** : un fournisseur qui refuse
de créer un accès en ligne doit pouvoir répondre quand même. Le portail s'ajoute, il ne
remplace pas.

Cela devient le lot **L28**, ci-dessous. ⚠️ **C'est le premier composant du produit exposé
hors du VPN** : il porte sa propre porte de sécurité, et elle est la plus exigeante du
plan.

### A2 — Un jeu de découverte ✅ **TRANCHÉ le 08/09/2026 — autorisé sous conditions**

Le brief initial interdit les données de démonstration pré-chargées, et la règle a bien
servi : un outil qui affiche « aucun risque » sur une base vide ne ment pas. Mais elle a un
coût mesurable sur la prise en main — à la première ouverture, **tous les écrans sont
vides**, y compris ceux qui expliquent le mieux le produit.

**Décision de l'utilisateur, 08/09/2026 : le jeu de découverte est AUTORISÉ, et les cinq
conditions ci-dessous sont constitutives — un jeu qui n'en respecte que quatre n'est pas
autorisé.**

1. **Étiqueté dans la donnée elle-même**, pas seulement à l'écran : chaque enregistrement
   engendré porte une marque que l'export, l'impression et le journal reprennent. Un jeu
   reconnaissable seulement par un bandeau devient indiscernable dès la première
   exportation ;
2. **chargé sur geste volontaire uniquement** — jamais par l'installateur, jamais au
   premier démarrage ;
3. **purgeable en un clic**, et la purge est **complète** : elle emprunte le déclencheur
   `f_pieces_suivent_leur_porteur()` (migration `017`) pour que les pièces jointes du jeu
   disparaissent avec lui, sur les six chemins ;
4. **refusé si la base contient déjà des données réelles** — le contrôle porte sur la
   présence de toute ligne non marquée, pas sur un compteur ;
5. **interdit hors du profil « découverte »** de L18, et le refus est journalisé.

⚠️ **Ce que ces conditions protègent** : le brief avait raison sur le fond — un outil
produit en audit ne doit jamais laisser un doute sur l'origine d'une ligne. Les cinq
conditions ne sont pas de la prudence décorative, elles sont **ce qui rend la décision
compatible avec le motif du brief**. Le jeu de découverte est livré au **L18 bis**, après
les portes, parce qu'il écrit en base.

### A3 — Un portail fournisseur exposé, oui ou non ?

L21 livre le questionnaire fournisseur **sans portail** : export, remplissage hors ligne,
réimport. C'est sûr et cela marche.

Un vrai portail — un tiers qui se connecte à *votre* machine — est plus confortable et
**ouvre une surface d'authentification neuve, exposée hors du VPN**. Cela mérite son propre
lot et sa propre porte de sécurité, pas un coin de L21.

**Mon avis** : ne pas le faire tant qu'un client ne le réclame pas ; le faire alors comme
un lot à part entière, avec porte dédiée.

---

## 8. Ordonnancement, dépendances et portes

```
                    ┌─────────────────────────────────────────┐
   VAGUE 10 ───────►│ S7 (jamais jouée)  +  S8 (7ᵉ passage)  │──► MISE EN SERVICE
   clore la mise    └─────────────────────────────────────────┘
   en service                        │
       ║ (en parallèle)              │
       ╚══► L18 installation ────────┤
            (ni src/, ni schéma)     │
                                     ▼
                            L17 prise en main ──► porte S10
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              L19 preuve       L20 réglementaire  L21 tiers/DORA
                    │                │                │
                    └────────────────┴────────┬───────┘
                                              ▼
                                     porte S11 (S10 → S11)
                                              │
                                     L22 ouverture technique ──► porte S12 🔴
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                    L23 preuve automatique / CCM     L24 campagnes
                              │                               │
                              └───────────────┬───────────────┘
                                              ▼
                                       porte S13
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                        L25 EBIOS RM                   L26 catalogues
                                              │
                                              ▼
                                       porte S14
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                    L27 IA (locale, puis         L28 PORTAIL FOURNISSEUR 🔴
                    externe encadrée)            seul, jamais avec un autre lot
                              │                               │
                              ▼                               ▼
                        porte S16                       porte S15 🔴🔴
                                                   la plus exigeante du plan
```

**Portes — ce que chacune éprouve**

| Porte | Après | Ce qu'elle regarde en priorité |
|---|---|---|
| **S10** | L17 | **La recherche est un oracle** : cloisonnement inter-filiales de la recherche et de la palette, sous chacun des sept profils |
| **S11** | L19, L20, L21 | Partage de preuve **sans perte** sur les six chemins de cascade ; ajout seul de la main courante ; récursion de la chaîne de sous-traitance |
| **S12** 🔴 | L22 | **La porte la plus lourde du plan.** Un jeton est un sujet de droits : il ne contourne ni `resoudre()`, ni la RLS, ni le droit d'export. Sorties réseau éprouvées **depuis l'unité systemd livrée**, pas depuis un développement (constat Q-199) |
| **S13** | L23, L24 | Une source injoignable rend **`indetermine`**, jamais `conforme`. Une campagne ne fuit pas entre filiales |
| **S14** | L25, L26 | Les cotations F×G×M antérieures sont **intactes et lisibles** ; les codes des catalogues migrés sont identiques à l'octet près |
| **S15** 🔴🔴 | L28 | **La plus exigeante du plan.** Premier composant exposé hors VPN : la grille §4 est rejouée **intégralement** sur ce seul lot, plus énumération de liens, rejeu d'un lien expiré, tentative d'atteindre une autre campagne / un autre fournisseur / une autre filiale, dépôt hostile, charge. ⚠️ **En cas de doute sur ce lot, on ne livre pas** |
| **S16** | L27 | En mode local, `IPAddressDeny=any` reste **intact** — la preuve qu'aucune donnée ne sort. En mode externe : destination coupée → « indisponible », **jamais une réponse inventée** ; une filiale non activée ne peut pas déclencher d'appel, même par l'écran d'une filiale qui l'est |

**Priorités** : 🔴 fait ou défait la valeur du produit · 🟠 comble un écart marché réel ·
🟢 positionnement à moyen terme.

---

## 9. L'indicateur de succès

La grille des 86 fonctionnalités est **l'instrument de mesure de ce plan**. Elle se rejoue
après chaque porte, et le chiffre s'inscrit — il ne s'estime pas.

| Étape | ✅ | 🟡 | ❌ |
|---|---|---|---|
| **Aujourd'hui (08/09/2026)** | 35 | 17 | 34 |
| après **L17 + L18** | 37 | 16 | 33 |
| après **L19 + L20 + L21** | 49 | 9 | 28 |
| après **L22 + L23** | 55 | 6 | 25 |
| après **L24 + L25 + L26** | 71 | 5 | 10 |
| après **L27 + L28** | **76** | **2** | **8** |

⚠️ **Recalculé le 08/09/2026 au soir**, après que les arbitrages **A1** et **A3** ont été
tranchés : les cinq lignes d'intelligence artificielle (#36, #68, #69, #70, #72) cessent
d'être suspendues et deviennent le lot **L27** ; le portail fournisseur (#32) passe au
niveau du marché avec **L28**.

**Les 8 lignes finalement non couvertes sont, une par une, des non-objectifs assumés du
§6** — et il faut pouvoir les nommer, sans quoi « non-objectif » n'est qu'un mot pour
« oublié » :

| # | Ligne | Motif |
|---|---|---|
| 33 | notation externe de fournisseurs | service tiers ; à réexaminer après L27, comme une **question**, pas comme un acquis |
| 51 · 53 | registre de vulnérabilités, surface d'attaque | le produit **ingère** un scanner (L22), il n'en devient pas un |
| 61 | pilotage par la valeur / coût | demande une donnée financière que le client ne saisira pas |
| 63 | benchmarks sectoriels | suppose de transmettre les données du client à un agrégateur |
| 73 | plateforme de sensibilisation | marché saturé de spécialistes ; l'intégration vaut mieux que la construction |
| 75 · 76 | Trust Center public, partage sous NDA | sans objet en déploiement VPN ; ⚠️ **à revoir si L28 change la donne** — un portail exposé existe désormais |

Les 2 lignes 🟡 restantes : **#56** (découverte d'actifs, partiellement couverte par le
connecteur AD de L22) et **#74** (complétion de sensibilisation, reversée comme preuve par
un connecteur mais sans plateforme intégrée).

⚠️ **Ce tableau est une cible, pas un verdict.** Comme le banc, il ne se recopie pas : il
se rejoue (constat **Q-219**).

---

## 9 bis. ▶ Où reprendre — état au 08/09/2026 au soir

**Ce qui est fait de ce plan :**

| | État |
|---|---|
| **L18.1** `--assistant` | ✅ livré, éprouvé par pseudo-terminal dans les deux branches |
| **L18.2 a** profil découverte (configuration) | ✅ livré — `CYBER_GRC_PROFIL=decouverte`, compte de secours, certificat auto-signé |
| **L18.3** `--diagnostic` | ✅ livré — douze sujets, code 0/1/2, joué sur la recette |
| **L18.4** groupes AD | ✅ **il l'était déjà** — le défaut était de découvrabilité |
| **L18.5** surface de configuration | ✅ **elle l'était déjà** — six valeurs, pas soixante-huit |
| **L18.6** `docs/INSTALLER.md` | ✅ livré — cinq commandes, aucun renvoi |
| **L18.2 b** le bandeau dans le produit | ⬜ **reste — c'est le prochain geste** |
| **L18.7** assistant de premier démarrage | ⬜ frontend → après les portes |

**Le prochain geste, et pourquoi celui-là.** Le bandeau **18.2 b** est le seul écart qui
reste à L18, et c'est celui qui décide si le profil découverte tient sa promesse : *un
profil dégradé qu'on ne voit pas devient une production par oubli*. Il est aujourd'hui
visible de l'**exploitant** — configuration, `--diagnostic` — mais pas de l'**utilisateur
qui saisit**. Environ dix lignes : un champ dans `GET /api/session`, un bandeau permanent
dans la SPA. ⚠️ **C'est le seul sous-lot de L18 qui touche `src/` : à déclarer au 7ᵉ
passage de S8.**

Puis **Q-251** (`PLAN_EXECUTION.md` §7), court lui aussi — pour que l'auditeur trouve un
banc stable et un lot complet plutôt qu'à 90 %.

**Ensuite, et pas avant : les portes.** S7 jamais jouée, puis le 7ᵉ passage de S8, qui aura
**dix livraisons** à examiner.

**Et au bout du plan, deux lots décidés le 08/09 au soir** : **L27** (assistance IA, locale
par défaut, externe sous six barrières) et **L28** (portail fournisseur exposé). ⚠️ **L28
est le premier composant du produit hors VPN** : il ne se joue ni avant S8, ni en même temps
qu'un autre lot, et sa porte **S15** est la plus exigeante de tout le plan — *en cas de
doute sur ce lot, on ne livre pas.*

⚠️ **Une leçon de ce lot, à lire avant d'ouvrir le suivant.** Trois fois sur six sous-lots,
la mesure a contredit ce plan : 18.4 était déjà livré, 18.5 déjà atteint, et le chiffre de
« 74 variables » était faux. *Un plan écrit sans mesurer ne se trompe pas au hasard : il
fait travailler sur des problèmes qui n'existent pas, et il le fait avec conviction.* Avant
d'ouvrir **L19**, mesurer chacun de ses six sous-lots dans le dépôt — comme le §0 du
`CLAUDE.md` l'exige déjà pour l'environnement.

---

## 10. Ce que ce plan ne change pas

- **La façade `DataStore` synchrone reste intacte.** C'est ce qui a permis de basculer 26
  modules sans en réécrire un seul ; aucun lot de ce plan n'a de raison d'y toucher.
- **Le périmètre de session vient du serveur**, et `js/core/api.js` n'expose aucun
  paramètre de filiale. Les jetons de L22 ne sont pas une exception : ils sont des sujets
  de droits comme les autres.
- **Le produit n'écrit pas dans l'Active Directory.** L18 engendre un script que
  l'exploitant lance ; il ne s'y connecte pas.
- **Rien ne sort de la machine.** Les webhooks de L22 sont une sortie **déclarée par
  l'exploitant** vers une destination qu'il choisit — pas un service du produit.
- **Les identifiants texte sont conservés**, ce qui rend l'import d'un export exact au
  round-trip.

