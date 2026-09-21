# Plan d'achèvement — construire le logiciel complet

> **Arbitrage de l'utilisateur, 14/09/2026.** Ce document **fait autorité sur l'ordre des
> travaux**. Il suspend le §0 bis du `PLAN_PRODUIT.md` (« aucun lot L17+ avant que S7 et S8
> soient franchies ») et la conduite par portes du `PLAN_EXECUTION.md` §1.

## 0. La décision, et ce qui l'a motivée

**On arrête les passages de porte. On construit jusqu'à ce que le logiciel soit complet et
fonctionnel. L'utilisateur lance alors un `ultrareview`. On corrige et on sécurise ensuite.**

Ce qui a été mesuré le 14/09, et qui tranche :

| | |
|---|---|
| nouveaux écrans dans la SPA en dix jours | **0** |
| part du travail hors SPA sur la période | **80 %** |
| rapports de porte écrits | 34, **28 690 lignes** — presque toute la SPA (32 963) |
| banc d'essai | **74 792 lignes** pour 35 903 lignes de serveur |
| les trois derniers passages de S8 | **rien** en classe 1 ou 2 (blocage, fuite, perte) |

Le §0 bis du `PLAN_EXECUTION.md` dit qu'une porte refusée **trie** au lieu d'arrêter. Rien
n'est tombé en classe 1 ou 2 depuis trois passages : la mise en service n'était plus
bloquée par la mesure, seulement par le rituel. Et le critère du **contrôle S16** est **non
borné par construction** — un test de mutation sur tout le schéma grandit avec le code, donc
il ne peut pas être satisfait.

## 1. Les règles qu'on garde, et celles qu'on suspend

**Gardées** — elles sont le produit, pas le rituel :

1. **Cloisonnement par filiale** : toute table métier porte `filiale_id`, RLS activée et
   forcée, toute contrainte hors politique porte `filiale_id`. Une écriture neuve qui ne
   respecte pas ça n'est pas livrable.
2. **Échappement de toute donnée injectée en DOM** (`escapeHtml`), **aucun gestionnaire en
   ligne** (la CSP du vhost les bloque).
3. **La façade `DataStore` reste synchrone** — c'est ce qui a permis de basculer 26 modules
   sans en réécrire un.
4. **Le banc reste vert.** On n'ajoute pas un essai par ligne écrite ; on n'en casse aucun.

**Suspendues jusqu'à l'`ultrareview`** :

- les portes de sécurité entre lots (S7 à S16) ;
- l'audit d'un correctif par un passage complet ;
- le réancrage des chiffres dans quatre documents à chaque livraison — **un seul bloc
  `CHANGELOG` par vague**, à sa clôture ;
- le registre des constats : les constats ouverts restent au `PLAN_EXECUTION.md` §7, ils
  seront traités **avec** le retour de l'`ultrareview`, pas avant.

## 2. Les six vagues — ordonnées par ce qui SE VOIT

> **Règle d'ordonnancement, et elle est le remède au reproche du 14/09** : *si une vague ne
> change rien à ce que l'utilisateur voit en ouvrant le produit, elle est mal placée.*

### V-A — Prise en main *(L18 bis, L17, L16-D3)* — ✅ **CLOSE le 21/09/2026**

Ce qui change à l'écran, dès l'ouverture :

| | Quoi |
|---|---|
| **A1** | **Jeu de découverte** — un groupe fictif complet (filiales, risques, actifs, exigences évaluées, incidents, documents, actions, audits). Marqué **dans la donnée**, refusé si des données réelles existent, purgé d'un geste. C'est ce qui fait qu'on *voit* le produit au lieu de le deviner |
| **A2** | **Menu regroupé** — 32 entrées à plat deviennent 6 sections repliables, avec l'état courant en badge |
| **A3** | **Recherche globale + palette `Ctrl+K`** — une seule barre qui trouve un risque, un actif, une exigence, un document, une personne. Bornée par la RLS côté serveur, jamais par un filtre côté client |
| **A4** | **Écran de démarrage par rôle** — RSSI, contributeur, auditeur, direction : ce qui m'attend aujourd'hui, pas un tableau de bord générique |
| **A5** | **Kanban du plan d'actions** — colonnes par statut, glisser-déposer, filtre par responsable |

> ✅ **A4 et A5 sont LIVRÉS le 21/09/2026**, et **L16-D3 le même jour** : la vague A est
> CLOSE. Elle était restée ouverte onze jours avec deux items non construits, pendant que
> les vagues C à F se fermaient — *une vague sans ligne de clôture n'est pas une vague
> close, et personne ne l'avait remarqué* (constat de l'état des lieux du 21/09).
>
> **A4 — « Ma journée »**, écran d'ENTRÉE du produit (`js/modules/accueil.js`) : ce qui est
> en retard, ce qui échoit cette semaine, ce qui m'est attribué. ⚠️ **« Par rôle » se
> DÉRIVE des droits, il ne se récite pas** — le produit porte neuf profils de socle et un
> client peut en composer d'autres ; quatre écrans écrits pour quatre noms auraient
> montré à un auditeur ce qu'on destinait à un contributeur. Ce qui distingue deux rôles
> est ce qu'ils PEUVENT VOIR, et le serveur l'a déjà résolu : `DataStore` ne contient que
> ce que la session a le droit de lire.
>
> **A5 — le Kanban**, une VUE de `/actions` et non un second écran. ⚠️ **Le glisser-déposer
> n'est pas le seul chemin** : chaque carte porte deux boutons de déplacement, et c'est
> l'essai qui les mesure — *une fonctionnalité qui n'existe qu'à la souris est une
> fonctionnalité absente pour une partie des utilisateurs*. ⚠️ Et une action au statut
> hors vocabulaire est **montrée** dans une colonne qui le dit, jamais masquée.

### V-B — La chaîne de preuve et le réglementaire *(L19, L20)*

Attestation de conformité imprimable ; **dérogations** datées et approuvées ; **main courante**
en ajout seul ; la preuve reliée à l'exigence qu'elle sert. Échéances réglementaires NIS2 /
DORA / RGPD **opérationnelles** — ce qui est dû, par qui, pour quand.

### V-C — Tiers et campagnes *(L21, L24)* — ✅ **CLOSE le 18/09/2026**

Questionnaires fournisseurs et leur relance ; registre DORA des prestataires critiques ;
**campagnes descendantes** — le Groupe envoie une exigence à ses filiales et suit l'avancement.

> **Livré** : migrations `042` à `045`, schéma `data` en **v21**, banc 2169/2169. L'indicateur
> a été **rejoué EN ENTIER** comme le §4 l'impose — premier rejeu intégral : **46 ✅ · 15 🟡 ·
> 25 ❌**.
>
> ⚠️ **Ce qui reste nommé plutôt que tu** : les gabarits **XBRL** de DORA (format de dépôt
> versionné par l'ESA), l'agrégation **par répondant** de 24.2, et le **portail fournisseur**
> qui est le lot L28. ⚠️ **Six défauts ont été trouvés AU NAVIGATEUR sur la recette pendant
> cette vague, aucun par le banc** — dont une campagne convoquée *indestructible* et un bloc
> de création invisible pour le seul compte qui en avait le droit.

### V-D — Méthode et catalogues *(L25, L26)* — ✅ **CLOSE le 19/09/2026**

**EBIOS RM** (sources de risque, scénarios stratégiques et opérationnels) en préservant les
cotations F×G×M existantes ; quantification ; **catalogues ouverts** — importer et éditer un
référentiel sans toucher au code.

> **Livré le 18/09/2026 — les ateliers 1 et 2, et la base de connaissances du Groupe**
> (actions **25.1** en partie, **25.2** et **25.5**) : migration `046`, schéma `data` en
> **v22**, greffon `src/ebios/`, écran `js/modules/ebios.js` en **onglet du sujet
> « risques »**, à côté de « Matrice F×G ».
>
> ⚠️ **Le critère qui gouverne tout le lot est NÉGATIF, et il est désormais MÉCANIQUE.**
> *« Les risques cotés en F × G × M restent valides et lisibles »* : le garde-fou
> `f_verifier_ebios_cadrage()` nomme les cinq colonnes de cotation **une par une** et
> refuse tout déclencheur d'une table EBIOS qui écrirait dans `risques`. Une propriété
> négative ne se voit pas à l'usage — elle ne se mesure qu'en la cherchant, et une phrase
> dans un plan ne retient personne (motif du constat **Q-192**).
>
> ⚠️ **Deux enseignements de la livraison**, et aucun n'est venu d'une relecture :
> `f_verifier_portee_figee()` a **refusé le déploiement** parce que la table mixte
> `ebios_connaissances` n'avait pas son déclencheur de portée — *troisième fois qu'un
> installateur appelable rattrape un lot qu'il n'a pas vu naître* ; et le filet des modules
> a refusé l'écran parce qu'il dessinait sa liste depuis le serveur au lieu de la mémoire,
> ce qui retirait à `recalerBalisage()` ce sur quoi mordre.
>
> **Livré le 19/09/2026 — les ateliers 3, 4 et 5** (migration `047`, schéma `data` en
> **v23**) : l'écosystème et ses parties prenantes évaluées, les chemins d'attaque, les
> modes opératoires et la **décision** de traitement. L'action **25.1 est complète**.
>
> ⚠️ **Trois absences délibérées, et chacune est le critère d'une action** : la
> cartographie n'est pas refaite (25.2) ; un chemin ne porte **aucune gravité** — c'est
> celle de l'événement redouté qu'il réalise, et un essai le mesure dans le catalogue ; et
> le plan d'actions n'est pas refait — rattacher un scénario à un risque du registre suffit
> pour que `actions.risque_id` s'applique, et **c'est un lien, pas une conversion**.
>
> ⚠️ **Et un garde de CLASSE est né de la `046`** : `f_verifier_set_null_composites()`
> refuse toute clé étrangère composite en `on delete set null` sans liste de colonnes —
> la faute qui avait fait tomber dix essais et **toute restauration de sauvegarde**
> (`CONVENTIONS.md` §43). Il balaie le catalogue : il couvre les clés qu'aucune migration
> n'a encore écrites.
>
> **Livré le 19/09/2026 — l'action 25.3, les échelles de cotation** (migration `049`, schéma
> `data` en **v24**, écran `js/modules/echelles.js` en onglet du sujet « risques »). Une
> échelle publiée est **FIGÉE** — on en publie une révision —, le socle du Groupe est
> surchargeable par filiale, et **chaque cotation porte l'échelle qui l'a produite**.
>
> ⚠️ **Le conflit entre deux documents qui font autorité, tranché** : le `PLAN_SERVEUR` §2.2
> range l'échelle au niveau Groupe *« sans quoi les risques ne s'additionnent pas »*, quand
> le critère 25.3 la veut configurable par filiale. Le §2.2 énonce une **conséquence**, pas
> un interdit — d'où le remède : rendre l'échelle explicite, et faire **refuser à la
> consolidation** l'addition de ce qui n'est pas comparable plutôt que de la faire en
> silence.
>
> 🛑 **Et la première rédaction du figeage cassait la reprise** : export puis reprise
> « remplacer » rendait **409**, *le produit produisait une sauvegarde qu'il refusait de
> relire*. Classe des trois conflits de la `041` et des constats Q-194 / Q-284, tranchée
> pareil — **restaurer une sauvegarde gagne**. Trouvé par le banc. ⚠️ Et **trois défauts de
> plus trouvés en cliquant sur la recette**, après 2 230 essais verts.
>
> **Livré le 19/09/2026 — l'action 25.4, la quantification financière** (migration `050`,
> schéma `data` en **v25**, panneau FAIR sur la fiche de risque). ⚠️ C'est la réponse à la
> limite que 25.3 venait de rendre visible : la consolidation refuse d'additionner deux
> expositions ORDINALES, et une somme d'argent, à devise égale, s'additionne toujours.
> Elle refuse là aussi dès que **deux devises** coexistent.
>
> ⚠️ **Un triplet incomplet ne rend RIEN**, et le refus est posé à deux étages : une
> contrainte refuse la donnée, la dérivation rend `null`. Des pertes secondaires absentes
> ne valent pas zéro : le montant devient un **PLANCHER**, marqué et affiché « ≥ » —
> l'estimation par défaut *dans le sens rassurant* est la plus dangereuse des deux.
>
> 🛑 **Et le plus important de ce lot ne parle pas de quantification** : le garde-fou qui
> tient le « EN ADDITION » de tout L25 balayait les tables par leur **NOM**
> (`like 'ebios\_%'`), et la table de quantification lui échappait. **Mesuré** : sa
> rédaction d'origine rend **0 anomalie** sur le déclencheur fautif que la rédaction
> élargie attrape — *un garde qui ne regarde pas rend zéro anomalie, c'est-à-dire ce
> qu'il rend quand tout va bien*. Il balaie désormais le catalogue entier.
>
> **Livré le 19/09/2026 — le lot L26 EN ENTIER, et la vague D avec lui** (migrations
> `051` et `052`, schéma `data` en **v26**, écran « Gestion des catalogues »). Les six
> catalogues, leurs 40 domaines, leurs **424 exigences** et leurs six dictionnaires
> quittent la racine web et entrent en base.
>
> ⚠️ **Les codes sont conservés À L'OCTET PRÈS**, et c'est le critère du lot : ils sont la
> moitié droite de la clé par laquelle toute auto-évaluation est stockée. Le semis a été
> **engendré** depuis les fichiers source, et le banc les compare à la base champ par
> champ à chaque exécution.
>
> 🛑 **Deux défauts trouvés par le banc, et deux en cliquant sur la recette** : le balayage
> de renommage réécrivait les **codes du catalogue ANSSI** ; une colonne `jsonb` était tenue
> pour changée à chaque fois, de sorte qu'une filiale ne pouvait plus **relire son propre
> export** ; l'écran perdait sa **barre d'onglets** sans une erreur ; et la **veille était
> INERTE** — colonne, dérivation et garde-fou livrés, et aucune fenêtre de surveillance.
> *Une capacité qu'aucune donnée n'active est une capacité absente.*
>
> **⇒ LES LOTS L25 ET L26 SONT COMPLETS. La vague D est CLOSE** — reste le **rejeu
> INTÉGRAL de l'indicateur**, que le §4 impose à chaque clôture de vague.

### V-E — Ouverture et automatisation *(L22, L23)* — ✅ **CLOSE le 19/09/2026**

Jetons d'API (sujets de droits, jamais un contournement), événements sortants, connecteurs ;
collecte automatique de preuve et surveillance continue. Une source injoignable rend
**`indetermine`**, jamais `conforme`.

**Livré** : migrations `053` (jetons, abonnements, file d'événements), `054` (connecteurs,
collectes, quatrième événement), `055` (vocabulaire clos des réglages), `056` (ce qui est
admis n'est pas ce qui est émis) ; `src/auth/jetons.ts`, `src/ouverture/`,
`src/connecteurs/` ; deux écrans — « Ouverture technique » en onglet des Paramètres, et
« Collecte automatique » en onglet des Mesures ; schéma `data` en **v27**.

⚠️ **LES QUATRE CHOSES QUE CETTE VAGUE A APPRISES, ET AUCUNE NE VENAIT D'UNE RELECTURE :**

1. **Ce qui est ADMIS n'est pas ce qui est ÉMIS.** `echeance_franchie` était admis par la
   contrainte depuis la `053` et émis par **personne** — trouvé en construisant l'écran qui
   devait le proposer. Le garde-fou de la `053` nommait pourtant ce danger dans son propre
   témoin : il visait le cas où la contrainte se **vide**, pas celui où elle est juste et où
   l'émetteur manque. *La barrière regardait dans une direction ; le trou était dans l'autre.*
   Fermé par la `056`, qui confronte la déclaration au catalogue **dans les deux sens**.
2. **Un essai peut couvrir une règle sans jamais la faire décider** — constat **Q-210**, et
   cette fois dans l'essai écrit pour tenir le critère le plus important du lot. Le §1 de
   `test/collecte/` écrivait une valeur textuelle dans un réglage numérique : l'exécuteur
   rendait « indéterminé » pour *configuration incomplète*, sans jamais interroger la
   source. Contre la mutation « une source injoignable rend conforme », il restait **vert**.
3. **L'intersection des droits se faisait sur le niveau le PLUS ÉLEVÉ.** Émettre un jeton
   exige l'administration : `droits.niveau` vaut donc toujours « administration » chez qui
   peut émettre, et l'intersection était décorative. Un administrateur de l'application,
   simple lecteur sur les risques, obtenait un jeton **administrateur sur les risques**.
   Le niveau se rabat désormais sur le **plus faible des domaines demandés**.
4. **Un domaine hors des droits était retranché EN SILENCE.** Le jeton rendu « marchait »,
   sans le domaine demandé, et l'intégration échouait des semaines plus tard sur un 403 que
   personne ne rattachait à cette émission. Classe **Q-201 / Q-207** : on refuse, et on nomme.

⚠️ **Et deux défauts que seul le banc pouvait dire** : `jetons_api.domaines` est un
`text[]`, type qu'aucune entité n'expose — le catalogue des entités, qui balaie **toutes**
les tables, s'arrêtait dessus et **le serveur ne démarrait plus** ; et la vérification d'un
jeton lisait `u.login` et `f.actif`, deux colonnes qui n'existent pas (42703 à chaque appel
par jeton). *Les deux requêtes se lisent bien ; c'est ce qui les rend invisibles.*

🛑 **ET CINQ DÉFAUTS QUE SEUL LE NAVIGATEUR A DITS, dont le plus grave du lot** :

1. **Un jeton émis rendait 401 à son premier usage** — la fonctionnalité entière était
   inopérante, livrée, verte au banc. `jetons_api` est cloisonnée, et la recherche par
   empreinte précède le périmètre qu'elle produit : *la ligne était invisible à la seule
   transaction qui devait la voir*. Le secret porte désormais **sa filiale en clair**,
   devant l'aléa. ⚠️ **Dix-huit essais mesuraient les jetons et aucun ne l'a vu** : ils
   appelaient la fonction sous un périmètre posé. C'est **Q-325 reproduit**.
2. Le formulaire d'émission **n'offrait aucun domaine**, et le serveur en exige un.
3. Le menu des abonnements **ne proposait que trois événements sur quatre**.
4. Depuis les mesures, **la collecte était inatteignable** — la barre d'onglets n'était
   posée que d'un côté.
5. **Huit classes CSS écrites et définies nulle part** — le défaut du matin, refait le soir.

⚠️ **La règle qui en sort, et elle n'est pas nouvelle : un lot n'est pas livré tant que
son écran n'a pas été CLIQUÉ.** Deux mille trois cents essais verts ne disent rien du
chemin que l'utilisateur emprunte.

### V-F — IA locale et portail fournisseur *(L27, L28)* — ✅ **CONSTRUITE le 19/09/2026**

En dernier, parce que ce sont les deux seules surfaces **externes**. L'IA **propose**, un
humain **décide**. Le portail est le premier composant hors VPN.

**Livré** : migrations `057` (assistance) et `058` (portail) ; `src/assistance/` et
`src/portail/` ; écran « Assistance IA » en onglet des Paramètres ; vhost
`deploy/apache/cyber-grc-portail.conf`, **livré désactivé**.

🛑 **CE QUI EST CONSTRUIT N'EST PAS CE QUI EST OUVERT, et la distinction est le lot.**

| | État livré | Ce qu'il faut pour l'ouvrir |
|---|---|---|
| **L27 mode local** | fonctionne, **et c'est mesuré sur la machine réelle** : `IPAddressDeny=::/0 0.0.0.0/0` avec la seule boucle locale autorisée, et l'assistance répond. *Si la fonction marche alors que rien n'est ouvert, c'est qu'elle ne sort pas* | un modèle installé sur `127.0.0.1` — le produit dit « indisponible » sans lui, il n'invente pas |
| **L27 mode externe** | **fermé** : `CYBER_GRC_IA_EXTERNE` absent, et sans lui aucune ligne d'activation n'entre en base, quelle que soit la route | le réglage, **puis** une activation par filiale avec ses quatre champs de confiance, **puis** l'ouverture de la sortie réseau |
| **L28 portail** | **aucune route n'est montée** — `PORTAIL_ACTIF=non` par défaut, et le défaut n'enregistre rien. Le vhost est livré **désactivé** | `a2ensite`, un certificat, un limiteur au pare-feu — **et la porte S15** |

⚠️ **LA CONSIGNE DU PLAN PRODUIT PRIME, ET ELLE EST CITÉE** : *« la porte S15 est la plus
exigeante du plan […] ici le refus doit être la position par défaut : en cas de doute sur
ce lot, on ne livre pas »*. Le portail est **construit et éprouvé** ; il n'est **pas
ouvert**, et il ne doit pas l'être avant l'ultrareview. Ce n'est pas une réserve qu'on
reconduit : c'est l'ordonnancement que le plan a fixé.

⚠️ **CE QUE LA VAGUE F A APPRIS :**

1. **Le `CONVENTIONS.md` §46 a payé le lendemain de son écriture.** `portail_liens` est
   cloisonnée, et la recherche par empreinte précède le périmètre qu'elle produit :
   exactement la circularité découverte le matin même au lot L22. Le lien porte donc sa
   filiale en clair, et le défaut n'a **pas** été refait. *Une règle écrite la veille et
   appliquée le lendemain est la seule preuve qu'elle valait la peine d'être écrite.*
2. **Une mutation est passée, et c'était la plus dangereuse du lot.** Mettre
   `perimetreGroupe` et `administrationGroupe` à `true` dans la session du portail
   laissait **treize essais sur quatorze verts** : la RLS borne encore la filiale, donc la
   voisine restait invisible. Ce que la mutation ouvrait ne se voit pas d'un
   questionnaire. L'essai mesure désormais **le périmètre lui-même** — constat **Q-210**,
   sur la surface publique du produit.
3. **Le banc a corrigé la date d'origine d'une reprise.** La première rédaction prenait
   `cree_le` de la ligne ; c'est la date où elle est entrée dans **ce système** — pour des
   réponses arrivées par l'import du lot L7, la date de l'import. C'est `recu_le` du
   questionnaire précédent qui est la date qu'un auditeur reconnaît.
4. **Un garde-fou a exigé un arbitrage, et il avait raison de le demander** :
   `uq_portail_liens_empreinte` est une unicité **sans `filiale_id`**, ce que le §19.1
   interdit. Elle est dispensée **par écrit** — l'unicité doit être globale, et la
   conséquence que le §19.1 redoute est ici l'effet recherché.

## 3. Ce qui vient après — ⇒ **C'EST MAINTENANT LE GESTE SUIVANT**

> 🛑 **LES SIX VAGUES SONT CONSTRUITES au 19/09/2026.** Il n'y a plus de lot à jouer.
> Ce qui suit n'est plus « après » : c'est le travail immédiat.

1. **L'utilisateur lance un `ultrareview`** sur le logiciel complet
   (`/code-review ultra`). ⚠️ **Une session ne peut pas la déclencher** : elle est
   lancée par l'utilisateur, et facturée. C'est ici qu'elle était attendue depuis
   l'arbitrage du 14/09, et c'est ici qu'on est.
2. On traite son retour **et** les constats restés ouverts au `PLAN_EXECUTION.md` §7
   (≈ 30, dont Q-243 et l'oracle d'existence de compte B-1 du 10ᵉ passage).
3. Durcissement final, puis mise en service.

⚠️ **CE QUI NE DOIT PAS ÊTRE OUVERT AVANT L'ÉTAPE 1, ET C'EST ÉCRIT DEPUIS LE 08/09** :
le **portail fournisseur** (porte S15, *en cas de doute on ne livre pas*) et le **mode IA
externe**. Les deux sont **construits et fermés** — le portail n'enregistre aucune route,
et aucune activation externe n'entre en base sans un réglage d'exploitant. *Construire
n'est pas ouvrir, et la distinction est le lot.*

## 4. L'indicateur

`docs/COMPARATIF_MARCHE.md` — **86 fonctionnalités**. **35 ✅ à l'établissement du
08/09/2026 ; 44 ✅ · 12 🟡 · 30 ❌ au rejeu du 16/09/2026**, clôture de la vague B. Cible
**76 ✅**. Il se rejoue à la clôture de chaque vague ; il ne s'estime pas.

⚠️ **Au 21/09/2026 : 54 ✅ · 18 🟡 · 14 ❌ (~74 %)** — une seule ligne remesurée depuis le
rejeu intégral, la n° 30 « recherche plein texte », que l'action D3 fait passer de 🟡 à ✅.

⚠️ **Rejoué à la clôture de la vague F, le 19/09/2026 : 53 ✅ · 19 🟡 · 14 ❌ (~73 %)**
— quatre lignes déplacées par L27 et L28, et **deux laissées ❌ par ARBITRAGE** : une IA
qui *décide* de la conformité ou de la valeur d'un tiers n'est pas dans les cinq usages,
et le produit répond aux deux besoins **sans IA**.

⚠️ **Rejoué à la clôture de la vague E, le 19/09/2026 : 53 ✅ · 17 🟡 · 16 ❌ (~72 %)** —
cinq lignes déplacées par L22 et L23, et **deux en-têtes de section faux** de nouveau
attrapés par le recompte mécanique. *La discipline tient parce qu'elle est mécanique.*

⚠️ **Rejoué INTÉGRALEMENT le 19/09/2026, à la clôture de la vague D : 51 ✅ · 15 🟡 ·
20 ❌ (~68 %).** Onze lignes déplacées par L25 et L26, les vingt ❌ restants confrontés au
dépôt par recherche de leur mécanisme, trois faux amis ouverts et écartés à la main.
🛑 **Et le rejeu a trouvé un défaut dans l'indicateur lui-même** : les dix-huit en-têtes de
section n'avaient **jamais été recomptés**, et dix contredisaient les lignes qu'elles
surplombent. Ils le sont désormais par programme — *le constat Q-219, dans le document qui
sert à mesurer tout le reste.*

⚠️ **Le rejeu du 16/09 est PARTIEL, et le document le dit** : seules les onze lignes que
les vagues A et B pouvaient déplacer ont été remesurées ; les soixante-quinze autres
gardent leur verdict du 08/09. **Un rejeu intégral est dû à la clôture de la vague C.**
*Un indicateur qui tairait sa propre incomplétude serait pire qu'un indicateur en retard.*
