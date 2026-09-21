# Changelog — Cyber GRC

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/).
Deux composants depuis le chantier serveur : la SPA `cyber-gouvernance_V4/`
(HTML/CSS/JS, sans build) et le serveur applicatif `backend/`
(Node.js 22 + TypeScript + PostgreSQL). Cadrage : `docs/PLAN_SERVEUR.md` ;
conduite du chantier : `docs/PLAN_EXECUTION.md`.

## [Non publié]

> **État mesuré le 21/09/2026**, après l'action **D3**, sur la machine réelle
> (`SRV-Infra`, Debian 13, **Node v22.23.2**, **Apache/2.4.68 (Debian)**,
> **PostgreSQL 17.11**) : **59 migrations**, **89 tables**, **356 politiques**,
> **63 garde-fous**, **495 décisions** au registre de l'article 30, publication
> **87 fichiers**, schéma `data` en **v27**, indicateur **54 ✅ · 18 🟡 · 14 ❌ (~74 %)**.
> ⚠️ La `059` n'ajoute **aucune table** ni politique : `documents.recherche` est une
> colonne de plus sur une table qui en portait déjà quatre-vingt-neuf politiques.
> `install.sh --diagnostic` → **14 conformes, 2 réserves, 0 bloquant** sur **quinze
> sujets** (`SMTP_ACTIF=non` et le profil DÉCOUVERTE de cette machine) — le quinzième,
> « assistance IA », naît de L27.
> Le compte d'essais exact se relève au `backend/README.md` §8 — **il ne se recopie pas
> ici** (constat **Q-219**, et ce bloc a été faux quatre fois).
>
> 🛑 **LES SIX VAGUES DU `docs/PLAN_ACHEVEMENT.md` SONT CONSTRUITES.** Le geste suivant
> n'est plus un lot : c'est l'**ultrareview**, que l'utilisateur seul peut lancer.
> ⚠️ **Et ce qui est construit n'est pas ce qui est ouvert** — le portail fournisseur
> n'enregistre aucune route, le mode IA externe est fermé par un déclencheur en base.
> Règle : `backend/db/CONVENTIONS.md` **§47**.

> `npm test` → **2411 essais, 2411 passés, 0 échec** — 2 084 sans navigateur et 327 avec —,
> trente-huit familles. ⚠️ **+26 le 21/09/2026** : la recherche documentaire (action **D3**,
> migration `059`) apporte `test/recherche/documentaire.test.mjs` (19) et
> `test/navigateur/recherche-documentaire.test.mjs` (7).
>
> **État mesuré le 18/09/2026** : **relevé famille par
> famille** (trente-deux familles, dont `echelles` qui naît avec l'action 25.3),
> `npm run verifier-types` sans erreur, `npm audit --omit=dev` → **0 vulnérabilité**,
> `db/verifier_cloisonnement.sql` **sous `grc_app`** → **110 contrôles, 110 réussis, 0
> échoué** (code 0), `f_verifier_schema()` → **0 anomalie** (**53 garde-fous consignés**,
> **48 migrations**, **74 tables**, **296 politiques**, **422 décisions** au registre),
> `install.sh --verifier-publication` → **92 fichiers servis identiques au dépôt**, et
> `install.sh --diagnostic` → **13 conformes, 2 réserves** (`SMTP_ACTIF=non` **et le profil
> DÉCOUVERTE de cette machine**, posé le 15/09/2026), **0 bloquant**.
>
> ⚠️ **Ce bloc annonçait l'état du 16/09 — 2078 essais, 41 migrations, 61 tables, 244
> politiques, 331 décisions, 85 fichiers publiés — et le bilan « 14 conformes, 1 réserve »
> était faux DÈS SON ÉCRITURE** : la recette était en profil découverte depuis la veille.
> Les grandeurs du schéma, elles, sont désormais **gardées jusque dans leur répartition**
> (`test/documentation/chiffres-du-schema.test.mjs`, trois grandeurs de plus le 18/09) ; le
> bilan du `--diagnostic`, lui, ne l'est pas et ne peut pas l'être — il exige `sudo` et
> l'état d'une machine. *C'est la famille Q-219, et ce qui change est qu'on le dit.*
>
> ⚠️ **Les chiffres de ce bloc étaient faux de quatre migrations et de quatre garde-fous**
> — il annonçait « 35 garde-fous, 31 migrations, 52 tables, 208 politiques, 206 décisions »,
> c'est-à-dire l'état du **08/09**, pendant que le `backend/README.md` §8, lui, disait le
> réel. *Deux points de mesure des mêmes grandeurs divergent, et la divergence est
> silencieuse* : c'est le constat **Q-219**, et il vit ici parce qu'aucun garde-fou ne lit
> CETTE phrase-ci — le contrôle de Q-53 ne confronte que le **nombre d'essais**.
>
> ⚠️ **Trois pièges de mesure rencontrés, et ils valent d'être dits.**
> **(1)** `verifier_cloisonnement.sql` joué en **superutilisateur** rend **82/107** : un
> superutilisateur n'est pas soumis à la RLS, et les « échecs » ne mesuraient que cela. Il se
> joue **sous `grc_app`**, comme sa propre ligne 59 le prescrit. **(2)** `npm test` a rougi
> une fois sur deux passages complets, sur un essai de **rapport de temps** étranger à ce
> lot — constat **Q-251**, ci-dessous. **(3)** ⚠️ **Le banc s'enlise sur cette machine si
> l'on joue autre chose EN MÊME TEMPS** : `node --test` lance les seize familles navigateur
> sur six cœurs, et `free -m` est descendu à **134 Mio libres sur 7 892** — cinq familles
> bloquées **45 minutes en ayant consommé 5 secondes de processeur**. Le piège du
> diagnostic : `test/navigateur/bascule.test.mjs` semblait fautif ; **joué seul, 44/44 en
> 112 secondes**. *Un essai lent sous charge n'est pas un essai en défaut.*
>
> ⚠️ **Et rien de tout cela ne valait passage de porte — la démonstration est venue vite.**
> La porte **S8 a été jouée une HUITIÈME fois le 11/09/2026, par deux auditeurs indépendants,
> et REFUSÉE** : **1 bloquant, 11 majeurs, 7 mineurs, 0 fuite entre filiales**, constats
> **Q-291 → Q-309**, **cinq contrôles sur dix-huit en échec**. Les cinq livraisons du lot RGPD
> — celles que ce bloc annonçait « soumises à aucun auditeur » — **portent à elles seules le
> bloquant et huit des onze majeurs**. ⚠️ **Sur 41 mutations, 14 ne mordent pas**, et treize
> visent des gardes posés dans les trois jours précédents. *Un banc vert mesure ce qu'il
> regarde, jamais ce qu'il ne regarde pas* — et ce passage-ci l'a mesuré sur ce document même.

### Un système de mise en page : les conteneurs cessent de choisir leur largeur (21/09/2026)

**Signalé par l'utilisateur** : *« la largeur des différents conteneurs des formulaires
change même à l'intérieur de la même section, ce qui n'est pas responsive et n'est pas beau
à voir. »*

#### Ce qui a été MESURÉ avant de corriger

Sur la seule fiche d'un document : **quatre largeurs de carte** (956 · 900 · 820 · 772 px)
et **six largeurs de champ** — dont **362, 371 et 379**, trois valeurs presque identiques.
*L'œil attrape cet écart sans pouvoir le nommer, et c'est exactement ce qui fait qu'un
logiciel « n'est pas beau à voir ».*

Dans les 49 modules : **38 `max-width` écrits à la main**, en huit valeurs différentes, et
**cinq seuils de repli** (`minmax` de 180 à 300 px) — donc cinq moments où la page se
réorganise, au lieu d'un.

#### Les trois règles du système

1. **Un panneau ne choisit pas sa largeur** — c'est la page qui la donne. Les 24 plafonds
   posés sur des cartes sont retirés. ⚠️ Ceux des zones d'**impression** sont gardés : une
   page imprimée a bien une largeur fixe, et les confondre aurait cassé la sortie papier,
   qui est une pièce d'audit.
2. **Une seule grille, à douze colonnes.** Douze se divise par 2, 3, 4 et 6 : toutes les
   dispositions du produit s'y expriment sans inventer de piste. Comme la grille est **la
   même partout**, un champ « à moitié » fait la même largeur d'un écran à l'autre — ce qui
   était tout le sujet. Vingt grilles déclarées en ligne y sont ramenées, et une grille
   `.grille` neutre accueille les dispositions asymétriques, qui gardent leur intention
   (« Type » plus large que « Version » et « Statut » : 6 + 3 + 3).
3. **Un seul seuil de repli**, à 1100 px puis 820 px.

#### Et un `fieldset` cesse d'être une boîte dans une boîte

⚠️ **C'était la source des largeurs presque identiques.** Un `fieldset` posé DANS une carte
ajoutait sa bordure et son retrait : trois champs de même rôle faisaient 427, 439 et 444 px.
Une section de formulaire se marque désormais par son **intitulé et un filet**, pas par un
cadre — son contenu reste aligné sur celui de la carte.

#### Le liseré orange de 4 px est retiré

Il était posé sur **chaque** carte, si bien qu'il ne distinguait plus rien : quatre panneaux
d'un écran portaient la même barre que le panneau principal. *Une couleur qui souligne tout
ne souligne rien.* L'orange reste la couleur d'action — boutons, entrée de menu active,
bascules —, là où il veut dire quelque chose. Le panneau se tient par une bordure fine et
une ombre douce.

#### Le résultat

| Écran | Largeurs de carte | Largeurs de champ |
|---|---|---|
| `/documents/:id` | 4 → **1** | 6 → **3** (212 · 443 · 906) |
| `/incidents/:id` | 2 → **1** | 3 → **3** |
| `/prestataires/:id` | 2 → **1** | 5 → **3** |

Trois valeurs qui sont exactement **3/12, 6/12 et 12/12**.

🛑 **Gardé, et la mutation a été jouée** : `test/navigateur/largeurs-coherentes.test.mjs`
refuse qu'un écran porte deux largeurs de panneau ou plus de quatre largeurs de champ. En
remettant le plafond d'origine, il rougit et NOMME le défaut signalé —
`/documents/DOC-A → 820 · 956 px`.

⚠️ **Le nombre quatre est MESURÉ, pas choisi** : le système à douze colonnes n'offre que
quatre parts au formulaire. Une cinquième largeur signifie qu'un conteneur s'est remis à
décider tout seul.

**Mesuré** : banc **2411/2411**, fiche vérifiée de 1440 à 860 px sans un débordement.

### « Une table qui sort de son cadre » — signalé par l'utilisateur, trouvé partout (21/09/2026)

**Le signalement était précis, et le mot exact était « son cadre ».** Reproduit à
**980 px** de large sur la fiche d'un document : `<table class="data-table">` sort de son
conteneur de 14 px. Puis cherché **partout**, par un balayage de toutes les routes du
routeur à deux largeurs.

⚠️ **Le banc était entièrement vert.** 2 405 essais vérifiaient qu'un écran se rend et que
son contenu est juste ; **aucun ne vérifiait qu'il tient dans sa largeur**.

#### La cause principale n'était pas le tableau : c'était la bulle d'aide

`.help-tip__pop` était `position: absolute` **et** `visibility: hidden`. Or `visibility:
hidden` **masque mais garde la boîte dans le flux** : une bulle de 260 px centrée sur une
icône de 16 px déborde de **122 px de chaque côté**, invisible. Près du bord droit, **c'est
la page entière qui se met à défiler latéralement** — le symptôme le plus déroutant qui
soit, puisque rien d'apparent ne l'explique.

Et `position: absolute` la faisait **rogner** par tout ancêtre à `overflow: hidden`.

Elle est désormais **`position: fixed`** et **`display: none`** au repos : elle ne pèse plus
sur la mise en page, et aucun `overflow` ne la rogne. Ses coordonnées sont posées par
`js/core/help.js` à l'ouverture et **bornées à la fenêtre** — une bulle près d'un bord se
replie au lieu de sortir de l'écran —, et elle suit le défilement, ce qu'une bulle fixe ne
fait pas seule.

⚠️ **46 des 49 modules appellent `Help.tip`**, et **aucun essai ne couvrait ce composant** :
le plus employé du frontend était le moins éprouvé.

#### Les deux autres causes, corrigées à la CLASSE

1. **Un tableau sans conteneur qui défile.** La règle du dépôt l'impose depuis toujours —
   *« le contenu large défile dans son propre conteneur »* — mais **rien ne l'appliquait**.
   Une règle `:has(> table)` le fait pour les 49 modules d'un coup, plutôt qu'un passage
   fichier par fichier qui en oublie toujours un.
2. **`min-width: auto` sur les enfants de grille**, le piège le plus courant des grilles
   CSS : un champ ou un mot long empêche sa colonne de se réduire et pousse le cadre.

⚠️ **L'ordre comptait** : ces deux règles n'étaient sûres qu'**après** le changement de la
bulle — `overflow-x: auto` aurait rogné une bulle en `absolute`.

**Mesuré : de dizaines d'écrans en défaut à UN SEUL** — un `<text>` SVG à +3 px dans un
graphique, contenu, sans effet sur la page.

#### 🛑 ET IL A FALLU TROIS RÉDACTIONS POUR QUE LE GARDE-FOU MORDE

`test/navigateur/debordements.test.mjs` balaie toutes les routes **découvertes auprès du
routeur**. Sa mise au point est la leçon du jour :

| Rédaction | Ce qu'elle mesurait | Mutation |
|---|---|---|
| 1ʳᵉ | 1024 px, dépassement de `#app` | **verte** |
| 2ᵉ | 960 px, dépassement de `#app` | **verte** |
| 3ᵉ | **980 px**, dépassement **du PARENT** | ✅ rouge |

Deux erreurs distinctes, et chacune valait d'être faite. **La largeur** : le défaut ne vit
qu'autour de 980 px — au-dessus il y a la place, en dessous une bascule de mise en page
relâche la pression ; les deux premières valeurs avaient été *choisies*, la troisième est
*mesurée*. **Le cadre** : je comparais l'élément à la zone applicative, quand le
signalement disait le bon mot — *« sort de son cadre »*, et le cadre est le **parent**. Un
tableau qui sort de sa carte reste souvent dans la zone applicative.

Le garde joue donc **deux largeurs**, compare **au parent**, et exige que le balayage ait
visité au moins quarante écrans dont dix fiches — *un balayage qui ne visiterait rien
passerait au vert* (constat Q-210).

**Mesuré** : banc **2408/2408**, mutation jouée et rougie, correctif restauré et vérifié
identique à sa sauvegarde.

### Passe de style : quatre manquements à la charte, vus en capturant les écrans (21/09/2026)

**Aucun n'a été trouvé en lisant le code.** Le banc était entièrement vert avant comme
après — il mesure qu'un écran se rend et que son contenu est juste, **jamais qu'il est
lisible**. Six écrans ont été capturés au navigateur, à 1440 × 900, avant de toucher à quoi
que ce soit.

#### 1. `.status` défigurait le français — et avait été contourné SEPT FOIS

`text-transform: capitalize` est la règle **anglaise** : une capitale à chaque mot. À
l'écran, les statuts sortaient en « **En Retard De 190 J** », « **Non Critique** », « **À
Réviser** » — dans un produit dont les écrans servent de pièce en audit.

🛑 **Il avait été contourné écran par écran, sept fois** : `.grp-puce .status`,
`.apr-table .status`, `.rfa-carte .status`, `.att-table .status`, `.der-table .status`,
`.aipd-table .status`, `.mc-verdict .status`. *À chaque fois l'instance, jamais la classe* —
le travers récurrent de ce chantier, et il était sous les yeux de tous, commenté en toutes
lettres dans la feuille de style.

⚠️ **Le remède n'est PAS `text-transform: none`** : les valeurs sont stockées en minuscule
(« à faire », « en cours »), et `none` aurait rendu « à faire », ce qui est pire. C'est
`::first-letter` qui met la capitale — les acronymes (« RTO », « PCA ») et les noms propres
restent intacts. `display: inline-block` est une **condition**, `::first-letter` ne
s'appliquant qu'à un conteneur de bloc. **Les sept contournements sont retirés.**

#### 2. Les couleurs SÉMANTIQUES servaient de couleurs d'ACTION

La charte du produit est explicite (`CLAUDE.md` §2) : orange `#E9631B` pour l'action, et
**vert conforme / orange partiel / rouge critique / gris non applicable réservés aux
statuts**. Or :

- **huit boutons** — « Enregistrer l'audit », « Historiser le test », « Enregistrer le
  procès-verbal » — peints du **vert « conforme »** ;
- « Export Data (Excel) » en **`#1d6f42` écrit en dur**, un vert de tableur hors du système
  de tokens ;
- « Imprimer Rapport (PDF) » en **`#c0392b`**, le rouge « critique », sur une impression.

*Le lecteur d'un rapport s'appuie sur ce code couleur ; le diluer sur des verbes le rend
illisible.* Les huit boutons prennent l'orange d'action ; les deux du tableau de bord
deviennent des actions **secondaires**, ce qu'elles sont.

#### 3. De l'anglais et des Titres Capitalisés dans l'interface

« Export Data (Excel) », « Enregistrer l'Audit », « Nouveau Scénario », « Audits Internes »,
« Déclarer un Processus »… **douze libellés** remis en français et en **casse de phrase**,
comme la convention l'impose depuis le premier chantier.

#### 4. Trois défauts introduits le matin même, invisibles au banc

- **Les pastilles des trois écrans neufs employaient des classes qui n'existent pas** —
  `danger`, `warn`, `info` au lieu de `status-non-conforme` et ses sœurs. Le texte
  s'affichait **sans fond** : rien ne signalait que c'était un statut, et **aucun essai ne
  rougissait puisque le texte était bien là**.
- La barre du Kanban avait ses deux étiquettes à des hauteurs différentes — la bascule et
  la liste n'ayant pas la même hauteur, `align-items: flex-end` alignait leurs bas.
- Les dates de « Ma journée » sortaient en **ISO brut** (`2026-03-15`) au lieu du format
  français.

⚠️ **Ce qui n'est PAS corrigé, et qui est un choix** : chaque bloc du tableau de bord porte
le même liseré orange pleine largeur. C'est répétitif et cela aplatit la hiérarchie — mais
c'est une question de composition, pas un manquement à la charte, et le frontend est prévu
pour être refait.

**Mesuré** : banc **2405/2405**, six écrans recapturés et relus après correction.

### La vague A se ferme enfin, 20.2 est livrée, et le produit change de nom de domaine (21/09/2026)

**Quatre chantiers, et le premier est un constat plutôt qu'une livraison.**

#### Ce que l'état des lieux a trouvé

**A4 et A5 n'existaient nulle part** — ni fichier, ni fonction, ni route. C'étaient les
deux seuls items de la vague **V-A** jamais construits, et **V-A n'avait aucune ligne de
clôture** là où V-C à V-F en portaient une. *Une vague qu'on n'a pas déclarée close reste
ouverte sans que personne le remarque : deux écrans sont restés dus onze jours pendant que
quatre vagues postérieures se fermaient.*

Et une phrase de `docs/REPRISE.md` §6 annonçait, en tête du travail restant, que *« les 26
modules n'emploient pas encore »* l'échelle typographique. **Mesuré : 316 emplois de
`var(--text-*)` contre 2 tailles en dur**, toutes deux en `pt` dans des règles
d'impression. Le travail était fait ; la phrase envoyait le refaire.

#### A4 — « Ma journée », l'écran d'ENTRÉE du produit

`js/modules/accueil.js`, route `/accueil`, et c'est désormais **ce que le produit ouvre**.
Ce qui est en retard, ce qui échoit cette semaine, ce qui m'est attribué — aucun
indicateur, seulement des lignes sur lesquelles cliquer.

⚠️ **« Par rôle » se DÉRIVE des droits, il ne se récite pas.** Le plan nommait quatre rôles ;
la pente était d'écrire quatre écrans. Elle est refusée : le produit porte **neuf profils de
socle** et un client peut en composer d'autres — un profil absent de la liste serait retombé
sur un écran par défaut, c'est-à-dire aurait montré à un auditeur ce qu'on destinait à un
contributeur. Ce qui distingue deux rôles est ce qu'ils PEUVENT VOIR, et le serveur l'a déjà
résolu. ⚠️ Aucune correspondance « type d'échéance → domaine » n'est écrite : elle serait une
seconde source de vérité sur les droits.

⚠️ **Le bloc « qui m'est attribué » avoue sa limite** : le rapprochement se fait sur le NOM
affiché — les entités stockent le responsable en texte, arbitrage de l'annuaire — et quand la
session ne porte aucun nom, le bloc le DIT au lieu de paraître vide.

#### A5 — le Kanban du plan d'actions

Une **vue** de `/actions`, pas un second écran : un Kanban rangé ailleurs aurait obligé à
savoir d'avance dans laquelle des deux pages se trouve son action.

⚠️ **Le glisser-déposer n'est pas le seul chemin.** Chaque carte porte deux boutons de
déplacement, et c'est **eux** que l'essai mesure — le glisser se simule mal, un essai
fragile finirait désactivé, et *une fonctionnalité qui n'existe qu'à la souris est une
fonctionnalité absente pour une partie des utilisateurs.* ⚠️ Les colonnes viennent du
**vocabulaire de la base**, et une action au statut inconnu est **montrée** dans une colonne
qui le dit : une action invisible est une action oubliée. ⚠️ L'identifiant voyage dans le
`dataTransfer`, pas dans une variable de module — deux cartes saisies coup sur coup
déposeraient sinon la même.

#### 20.2 — les formulaires de notification ANSSI et CNIL

`/notification/:id`, atteint depuis la fiche d'incident. Deux régimes : **NIS2 article 23**
et **RGPD article 33**.

⚠️ **LE PRODUIT NE TRANSMET RIEN, et le document le porte en toutes lettres.** C'est le
critère de l'action, et le bouton dit « **préparer** », jamais « déclarer » — un essai le
vérifie.

⚠️ **Et il DIT SES MANQUES.** Un formulaire pré-rempli à moitié est plus dangereux qu'un
formulaire vide : *vide, on le remplit ; à moitié rempli, on l'envoie.* Chaque rubrique que
le produit ne sait pas remplir est affichée **en creux, nommée, avec ce que le texte attend
à cet endroit** — et l'en-tête compte ce qui reste. Les coordonnées de l'entité en font
partie : le lot L9 rend la raison sociale, pas l'adresse (constat **Q-160**), et le
formulaire le dit plutôt que de laisser croire à un oubli de saisie.

⚠️ Il ne reproduit **aucun formulaire officiel** : les téléservices changent sans préavis, et
recopier leur maquette ferait vieillir le produit en silence. Ce qui est stable est le
CONTENU que le texte exige.

#### Le nom de domaine : `grc.exemple.interne` → `grc-test.site`

**Demandé par l'utilisateur, et l'exposition publique assumée par écrit.**

⚠️ **Le produit était DÉJÀ joignable depuis Internet, avant toute intervention** : Apache
écoute sur `*:80` et `*:443`, politique `INPUT` à `ACCEPT`, aucun pare-feu — et le port 443
servait l'application à qui s'y connectait, avec un certificat qui ne correspondait pas. Ce
qui change n'est pas l'exposition : c'est qu'elle est **nommée et correctement certifiée**
(Let's Encrypt, renouvellement éprouvé par `--dry-run`, crochet de rechargement d'Apache
posé — sans lui le renouvellement réussit et le défaut persiste).

⚠️ **Le vhost du dépôt reste GÉNÉRIQUE** : chez le client, le certificat vient de sa PKI
interne. Les chemins ne nomment aucune autorité, et cette machine les fait pointer vers
Let's Encrypt par des **liens symboliques**.

⚠️ **Une exception ACME est posée dans le vhost en clair**, et elle n'est pas un confort :
sans elle, le renouvellement échoue **soixante jours après la mise en service**, longtemps
après que tout le monde a cessé de regarder.

🛑 **ET `install.sh` NE RÉÉCRIT PAS LE VHOST DÉPLOYÉ** — il ne l'installe que s'il est
absent. Un commentaire du modèle affirmait l'inverse ; **c'est la machine qui l'a démenti**,
le vhost déployé restant à l'ancien nom pendant que le dépôt portait le nouveau. Le
commentaire dit désormais la commande à passer.

⚠️ **Les 16 rapports de `docs/securite/` gardent l'ancien nom**, délibérément : *on ne
réécrit pas l'histoire pour ranger le présent* (refus déjà motivé au constat Q-256). Ils
décrivent des mesures faites sur `grc.exemple.interne`, et elles y ont bien été faites.

#### La passe de style — **1 205 → 895** attributs `style=`

⚠️ **Le gain n'est pas le compte, c'est ce qu'il a sorti** : `style="color:red"` apparaissait
**39 fois dans 17 modules**, sur les astérisques de champ obligatoire. Une couleur **brute**,
hors du système de tokens — et qui empruntait le rouge que le produit **réserve aux statuts
critiques**. Une pièce d'audit vit de ce code couleur ; le diluer sur une marque de saisie
est un défaut, pas un détail. Token dédié `--marque-requis`, **non sémantique**.

Onze classes utilitaires couvrent les motifs répétés plus de quinze fois : **270 attributs
convertis, dont 24 FUSIONNÉS** dans une classe existante — remplacer sans fusionner aurait
produit deux attributs `class`, dont le second est ignoré **en silence**. ⚠️ Les 895 restants
ne se convertissent pas de force : sur **565 motifs distincts**, la plupart ne servent qu'un
écran.

#### Et un garde-fou qui manquait, trouvé en se trompant

⚠️ **L'indicateur du chantier n'était gardé par RIEN.** Le `CHANGELOG` affirme à trois
reprises que « le recompte mécanique » a attrapé des en-têtes faux — c'est vrai, mais **à la
main**. J'ai déplacé une ligne dans le TEXTE sans changer son VERDICT, annoncé
« 56 ✅ · 17 🟡 · 13 ❌ » quand le tableau en portait 55/18/13, et **rien n'aurait rougi**.
`test/documentation/indicateur-marche.test.mjs` recompte le tableau, confronte l'en-tête et
**recalcule le pourcentage pondéré** — celui qu'on cite en réunion, et qui dérivait d'un
point à chaque livraison.

**Indicateur** : **56 ✅ · 17 🟡 · 13 ❌** sur 86, **75 %** — trois lignes déplacées et
nommées (n° 30 recherche, n° 42 formulaires, n° 48 Kanban).

### La recherche documentaire — L16, action D3, la dernière du lot (21/09/2026)

**Le lot L16 est COMPLET.** L'action D3 avait été reportée **cinq fois**, et toujours pour
le même motif écrit dès la vague 9 : *une recherche est un **oracle**, c'est la surface la
plus propice à une fuite entre filiales.* Elle répond « zéro » ou « un » sur un terme
choisi, et ces deux réponses disent quelque chose de ce qui existe — y compris ailleurs.

**Ce qui est livré** — migration `059` :

- `documents.recherche`, un `tsvector` **ENGENDRÉ** sur `titre` (poids `A`), `type` (`B`)
  et `notes` (`C`), indexé en **GIN** ;
- `f_sans_accent()`, immuable, **sans extension** : « securite » trouve « Sécurité », et la
  racinisation française fait que « chiffrer » trouve « chiffrement » ;
- `GET /api/recherche/documents?q=…`, seconde route du greffon `src/recherche/` ;
- un champ de recherche sur l'écran « Gestion documentaire », qui dit **où** la
  correspondance a eu lieu.

⚠️ **LE MOTIF DU REPORT EST DEVENU LA FORME DE L'ESSAI.** L'index vit sur `documents`, que
la RLS borne déjà : **aucune requête ne nomme de filiale**, et un contrôle de FORME lit la
source pour l'exiger. Un essai cherche un terme présent **uniquement chez la voisine** — et
il est doublé de son **témoin positif** sur le même terme, sans lequel il serait vert sur
une route qui ne rend jamais rien (constat **Q-210**).

⚠️ **ELLE NE REND JAMAIS L'EXTRAIT, ET C'EST UN ARBITRAGE, PAS UNE ÉCONOMIE.** Le point 3
de `src/recherche/index.ts` refusait le texte libre à la recherche globale, au motif que le
registre de l'article 30 dit qu'une partie porte des personnes. La spécification de D3,
antérieure, demandait `notes`. **Mesuré dans le registre avant de trancher** : `titre`,
`type` et `notes` sont toutes trois `non_personnelle` — donc licites à indexer —, mais
`notes` est en régime **« signaler »** (*« un nom peut y figurer »*). Les trois sont donc
indexées, et **deux garde-corps posés** : la route rend le document et **où** la
correspondance a eu lieu, jamais la phrase ; et le poids `C` range l'annotation derrière le
titre, si bien que l'usage normal ne la rencontre pas. Un essai navigateur vérifie le **DOM
entier**, attributs compris — l'écran aurait pu aller chercher la note dans `DataStore`.

⚠️ **LA COLONNE EST ENGENDRÉE, ET CE N'EST PAS UN DÉTAIL RGPD.** Elle se recalcule à chaque
écriture : la purge de l'article 17 qui vide `notes` **vide l'index dans la même
instruction**. Un index tenu par un déclencheur, ou par un traitement de fond, aurait pu
survivre à la donnée qu'il indexe — c'est-à-dire garder une trace de ce qu'on vient
d'effacer. Un essai le mesure en vidant la note et en cherchant le nom.

🛑 **TROIS GARDE-FOUS ONT REFUSÉ LA MIGRATION, ET AUCUN N'AVAIT ÉTÉ PRÉVU :**

1. le registre a refusé le régime **`signaler`** sur une colonne non textuelle — la purge y
   construit une comparaison de texte, et elle est **transactionnelle** : une seule
   déclaration de ce genre l'aurait avortée **pour toutes les filiales** (constat Q-300).
   Régime **`conserver`**, et le registre dit pourquoi ;
2. `f_verifier_types_ranges()` a refusé le type **`tsvector`**, non rangé. La réponse est
   « **porteur** » : un `tsvector` contient les LEXÈMES du texte dont il est tiré — si la
   note porte « relancé Mme Ollier », l'index porte « ollier ». C'est le renversement du
   constat A-3, et il a fait exactement son office ;
3. la couche de conversion des entités ne connaissait pas `tsvector` et a **refusé le
   démarrage**. Il rejoint `tableau_texte` comme famille **REFUSÉE** aux trois points de
   conversion — le servir au frontend ou le verser dans le fichier d'échange aurait rendu
   par une porte dérobée l'extrait que la route refuse expressément de rendre.

⚠️ **ET UN QUATRIÈME A RÉCLAMÉ L'ATTENTE DE LA POUSSÉE.**
`test/depot/relecture-apres-ecriture.test.mjs` a vu que `documents.js` écrit par
`DataStore` et lit désormais par `Api`. La dispense était possible ; elle aurait été
fausse. **Un document créé à l'instant doit être trouvable** : la recherche passe donc par
`UI.apresEcriture()`. *Le banc navigateur ne peut pas voir ce défaut — il monte le serveur
dans le même processus, où la poussée aboutit dans la même milliseconde.*

⚠️ **CE QUI RESTE DEHORS, ET LE MOTIF EST ÉCRIT** : le **contenu des pièces jointes**. La
spécification le range dans un second temps parce que l'extraction doit passer par la même
chaîne contrôlée que ClamAV (lot L6, huit contrôles dans un ordre figé). *Extraire du texte
d'un PDF, c'est l'analyser ; l'analyser hors de cette chaîne, ce serait ouvrir une seconde
porte d'entrée aux fichiers hostiles.*

⚠️ **`unaccent` N'EST PAS EMPLOYÉ, ET C'EST MESURÉ** : l'extension est *disponible* sur la
grappe mais *non installée*, et `create extension unaccent` exige le **superutilisateur** —
une migration tourne sous `grc_proprietaire`. La poser aurait fait échouer l'installation
chez le client **au milieu d'une migration**, pour une raison étrangère au produit.

**Essais** : `test/recherche/documentaire.test.mjs` (19, dont la mutation RGPD et la
morsure du garde-fou) et `test/navigateur/recherche-documentaire.test.mjs` (7).
L'indicateur `docs/COMPARATIF_MARCHE.md` passe sa ligne 30 de 🟡 à ✅ — **54 ✅ · 18 🟡 ·
14 ❌**, et le document dit que c'est la **seule** ligne remesurée depuis le rejeu intégral
du 19/09.

### Le guide d'exploitation dit COMMENT lier l'API d'IA du client (20/09/2026)

**Documentation seule — aucun code touché.** Le `GUIDE_EXPLOITATION.md` §5 septies
décrivait les six barrières du mode externe sans jamais donner la marche à suivre :
l'exploitant savait *pourquoi* c'était fermé, pas *comment* l'ouvrir. Il porte désormais
la procédure des deux montages, mesurée dans le dépôt.

- **Le discriminant est écrit** : ce n'est pas *à qui appartient l'API*, c'est **où elle
  tourne**. Boucle locale → mode LOCAL, deux lignes d'environnement et rien en base ;
  toute autre adresse — **y compris une API interne au groupe** — → mode EXTERNE.
- **Les trois gestes du mode externe, dans l'ordre** : `CYBER_GRC_IA_EXTERNE=oui`, qui
  **n'active rien** et autorise seulement ; `IPAddressAllow=` de l'unité, avec le rappel
  que **le résolveur DNS compte autant que la destination** ; puis l'`insert` dans
  `ia_activation`, **en `psql`**, avec `set_config('grc.ia_externe_autorisee', …)` — car
  **aucune route du produit ne pose ce réglage**, et c'est la barrière n° 1.
- **Le contrat HTTP attendu** est donné : `{"prompt", "stream": false}`, et les deux
  formes de réponse lues (`response`, `choices[0].message.content`). Toute autre forme
  vaut « indisponible ».
- ⚠️ **La clef d'API passe par un mandataire local, et le piège est nommé** : *un
  mandataire porte la CLEF, jamais la SORTIE*. Un mandataire sur `127.0.0.1` relayant
  vers un tiers ferait passer l'externe pour du local — plus de destination déclarée,
  plus d'entrée `ia_externe` au journal, plus de bandeau, plus de réserve au
  `--diagnostic`.
- **Refermer est documenté aussi**, et des deux façons : retirer l'autorisation fait
  **retomber en local** sans rien casser, `actif = false` referme une filiale **sans
  effacer** ses champs de confiance.
- ⚠️ **La réserve est écrite** : L27 n'a pas franchi sa porte **S16**.

`test/documentation/` **33/33** et `test/depot/` **66/66** après la passe.

### L'assistance par IA et le portail fournisseur — L27 et L28 (19/09/2026)

**La vague F est construite.** Ce sont les deux seules surfaces **externes** du produit,
et c'est pourquoi elles viennent en dernier.

🛑 **CE QUI EST CONSTRUIT N'EST PAS CE QUI EST OUVERT, et la distinction est le lot.**
Le mode IA externe est **fermé**, le portail **n'enregistre aucune route**, et son vhost
est livré **désactivé**. La consigne du `docs/PLAN_PRODUIT.md` prime : *« la porte S15 est
la plus exigeante du plan […] en cas de doute sur ce lot, on ne livre pas »*.

#### Ajouté — L27, l'assistance par IA (arbitrage A1)

- **Les cinq usages arbitrés, et pas un de plus** : correspondances, brouillon de
  politique, résumé d'incident, réponse à un questionnaire, recherche en langage courant.
  ⚠️ **L'IA PROPOSE, UN HUMAIN DÉCIDE** : aucun n'écrit en base, et un essai balaie les
  quatre tables métier avant et après les cinq appels pour le **mesurer**.
- **Le mode LOCAL est le chemin nominal, et il ne sort pas.** ⚠️ `IA_URL_LOCALE` **refuse
  le démarrage** sur une adresse extérieure : ce serait une sortie réseau déguisée en mode
  local, c'est-à-dire la barrière n° 2 contournée par le réglage qui prétend ne pas en
  avoir besoin. **Mesuré sur la machine réelle** : `IPAddressDeny=::/0 0.0.0.0/0` avec la
  seule boucle locale autorisée, et l'assistance répond. *Si la fonction marche alors que
  rien n'est ouvert, c'est qu'elle ne sort pas.*
- **Les six barrières du mode externe**, et la sixième seule est un texte : *(1)* on ne
  l'active pas depuis l'application — un déclencheur en base l'exige de l'exploitant ;
  *(2)* la sortie réseau reste fermée ; *(3)* destination déclarée, `https`, **aucune
  redirection suivie** ; *(4)* ce qui part est **montré avant de partir**, et la route
  d'envoi **RECOMPOSE** au lieu de croire le client — sinon la barrière protégerait
  l'utilisateur honnête et personne d'autre ; *(5)* chaque appel externe est journalisé
  (`ia_externe`) ; *(6)* l'avertissement, permanent, sans bouton de fermeture.
- 🛑 **Le troisième verdict est le cœur du lot** : source coupée, réponse illisible,
  modèle absent rendent **« indisponible »** — *jamais une réponse inventée, jamais un
  silence*. Et **200, non 500** : l'indisponibilité est une information, pas une panne.
- **Activation PAR FILIALE, jamais pour le Groupe** : ce qui est validé en France peut ne
  pas l'être ailleurs, et une activation Groupe ferait sortir les données de dix-neuf
  filiales sur la décision d'une seule. Une filiale **sans ligne** est en mode local —
  *le défaut n'a besoin de rien, et c'est ce qui rend son absence sûre.*
- **Les quatre champs de « confiance » sont exigés PAR LE SCHÉMA** : fournisseur, contrat,
  lieu d'hébergement, engagement de non-réentraînement, qui a validé. ⚠️ Ils ne protègent
  rien techniquement, **et c'est assumé** : ils existent pour qu'au jour de l'audit la
  question ait une réponse **écrite avant** d'être posée.
- **L'injection d'invite se ferme à la source** : les sauts de ligne sont retirés des
  valeurs, de sorte qu'une saisie ne peut pas fabriquer une ligne « Contrainte : … » et se
  faire passer pour une instruction. *Pas par une consigne qui demanderait au modèle de ne
  pas se laisser faire.*
- **Quinzième sujet au `--diagnostic`**, et le registre de l'article 30 tranche deux
  colonnes qui comptent : `ia_appels.invite` et `ia_appels.reponse` sont **personnelles et
  supprimables** — un résumé d'incident nomme des gens, et un texte soumis est une pièce
  de travail, pas une preuve d'audit.

#### Ajouté — L28, le portail fournisseur (arbitrage A3)

- **Pas de compte fournisseur, et c'est délibéré** : un compte, c'est un mot de passe à
  réinitialiser, une énumération possible et une surface qui **vit après la campagne**. Un
  lien **expire tout seul** — signé, nominatif, daté, révocable, borné à 180 jours, et
  portant sur **un seul questionnaire**.
- **404, jamais 403.** Lien inconnu, expiré, révoqué, ou visant un questionnaire disparu :
  quatre motifs distincts au journal, **une seule réponse à l'octet près** sur le réseau.
  Un 403 confirmerait que la cible existe, et la surface est **publique**.
- **La session du portail n'est pas une session du produit** : aucun profil, aucun
  domaine, **un périmètre d'un seul objet**. Toute lecture ajoute un
  `where questionnaire_id` **en plus** de la RLS — deux barrières, parce que c'est ici que
  la première coûterait le plus cher.
- **Aucun chemin de dépôt parallèle** : le portail monte `greffonPieces` **tel quel**, et
  les huit contrôles du lot L6 — ClamAV compris — s'exercent sur un fichier venu de
  l'Internet public exactement comme sur un fichier déposé depuis le VPN. *C'est ainsi
  qu'on se retrouve avec deux chaînes dont une seule est éprouvée.*
- **Une réponse reprise porte SA DATE D'ORIGINE**, et la modifier la lui **retire** : une
  réponse de 2024 présentée comme neuve serait un faux en audit, et du neuf présenté comme
  ancien serait l'autre moitié du même faux.
- **Une attestation rendue au fournisseur**, sans **aucune donnée du client** : c'est ce
  qui fait qu'il accepte de répondre sérieusement — il y gagne quelque chose.
- **Vhost séparé** (`deploy/apache/cyber-grc-portail.conf`), livré **désactivé** : nom
  propre, borne de corps **plus étroite** que celle du produit (12 Mio contre 27),
  `DocumentRoot` vide, CSP `default-src 'none'`, en-têtes de provenance effacés, journaux
  séparés, et **un seul préfixe relayé**.

#### Corrigé / appris

- ⚠️ **Deux balayages du catalogue ont rencontré des tables qui ne sont pas des entités**
  — `evenements_sortants`, `collectes`, `portail_liens` —, et la bonne réponse n'était ni
  de rétrécir le balayage ni de lui apprendre à semer n'importe quoi : c'est de **borner,
  puis de MESURER la borne**. Un essai de plus demande à la route de dépôt d'accepter une
  pièce sur chaque exclu, et exige le refus. *Une exclusion dit « voici la mesure qui le
  prouve » ; un angle mort dit « le balayage ne l'a pas vue », et les deux se ressemblent
  dans un banc vert.* Règle : `CONVENTIONS.md` **§48**.
- ⚠️ **Le `CONVENTIONS.md` §46 a payé le lendemain de son écriture.** `portail_liens` est
  cloisonnée, et la recherche par empreinte précède le périmètre qu'elle produit :
  exactement la circularité découverte le matin même au lot L22. Le lien porte sa filiale
  en clair, et le défaut n'a **pas** été refait. *Une règle écrite la veille et appliquée
  le lendemain est la seule preuve qu'elle valait la peine d'être écrite.*
- 🛑 **Une mutation est passée, et c'était la plus dangereuse du lot.** Mettre
  `perimetreGroupe` et `administrationGroupe` à `true` dans la session du portail laissait
  **treize essais sur quatorze verts** — la RLS borne encore la filiale, donc la voisine
  restait invisible. L'essai mesure désormais **le périmètre lui-même**. Constat **Q-210**,
  sur la surface publique du produit.
- **Le banc a corrigé la date d'origine d'une reprise** : `cree_le` est la date où la ligne
  est entrée dans **ce système** — pour des réponses importées, la date de l'import. C'est
  `recu_le` du questionnaire précédent qui est la date qu'un auditeur reconnaît.
- **Un garde-fou a exigé un arbitrage** : `uq_portail_liens_empreinte` est une unicité
  **sans `filiale_id`**, ce que le §19.1 interdit. Dispensée **par écrit** — l'unicité doit
  être globale, et la conséquence que le §19.1 redoute est ici l'effet recherché.

---

### L'ouverture technique et la collecte automatique — L22 et L23 (19/09/2026)

**La vague E est close.** Le produit sait désormais laisser un autre système lui parler
sans compte humain, faire partir un événement quand quelque chose arrive, et **constater
lui-même** une partie de sa propre conformité.

#### Ajouté — L22, l'ouverture technique

- **Jetons d'API** (migration `053`, `src/auth/jetons.ts`, `src/ouverture/`). ⚠️ **Un jeton
  est un sujet de droits comme un autre** : il bâtit un `EtatSession` et traverse la
  résolution de périmètre et la RLS — il ne les contourne pas, et il n'ouvre aucun chemin
  d'autorisation parallèle (motif du constat Q-70). Sa portée est **« filiale », en dur** :
  un jeton de portée Groupe aurait lu vingt filiales, et il aurait suffi d'en perdre un.
- **Le secret n'existe qu'une fois.** Le serveur le fabrique, le rend, et n'en garde qu'une
  **empreinte SHA-256**. ⚠️ **SHA-256 et non `scrypt`, délibérément** : un secret de 256 bits
  tiré d'un générateur cryptographique n'a pas de dictionnaire à protéger, et un dérivateur
  lent ferait payer sa latence à **chaque appel d'API**, ce qui est le contraire du but.
- **Quatre refus indiscernables** — inconnu, révoqué, expiré, filiale inactive. Le motif va
  au journal ; ce qui revient sur le réseau est un 401 unique. Distinguer « inconnu » de
  « révoqué » dirait à qui essaie des jetons au hasard lesquels ont existé (contrôle **S12**).
- **Révoquer n'est pas supprimer** : la ligne reste, datée et nominative. Savoir qu'un accès
  a existé, qui l'a émis et qui l'a coupé est exactement ce qu'un audit vient chercher.
- **Événements sortants** (`053`) — création d'incident, refus d'approbation, création
  d'action, franchissement d'échéance. ⚠️ **Le service web n'appelle JAMAIS vers l'extérieur** :
  les déclencheurs **enfilent**, et une unité systemd distincte **draine**. C'est la discipline
  de L12 pour le courriel et du journal vers rsyslog, et elle a la même raison — une requête
  d'utilisateur ne doit pas attendre un tiers. L'unité est livrée **non armée**, avec
  `IPAddressDeny=any` : rien ne part tant que l'exploitant n'a pas ouvert la sortie, et
  l'écran le dit (constat **Q-199**).
- **La charge ne porte pas le contenu** : l'abonné reçoit de quoi **venir chercher** —
  l'événement, l'entité, l'identifiant —, avec le jeton qui le borne. Y mettre la description
  d'un incident de sécurité serait une extraction de données par la porte qu'on vient d'ouvrir.
- **L'action 22.6 — renvoi vers Jira / ServiceNow — est la COMBINAISON de 22.1 et 22.3**, et
  le dire ainsi est plus honnête que d'écrire un intégrateur : l'**aller** par l'abonnement à
  `action_creee`, le **retour** par un jeton borné au domaine « actions » sur la route
  générique. Ni client Jira, ni client ServiceNow, ni schéma d'authentification propre à
  l'un d'eux — donc **rien à maintenir** le jour où leur API change, et rien à désactiver
  puisqu'il n'y a rien. C'est mot pour mot le critère : *« sans dépendance nouvelle si inactif »*.

#### Ajouté — L23, la collecte automatique de preuve

- **Trois connecteurs locaux** (`054`, `055`, `src/connecteurs/`) — sauvegarde, antivirus,
  annuaire. Chacun rend une **preuve datée rattachée à une mesure**, et `mesure_id` est
  **obligatoire** : un connecteur sans mesure produirait un constat que personne ne regarde.
- 🛑 **AUCUN CHEMIN D'ÉCHEC NE REND « CONFORME »** (critère 23.4, le point le plus important
  du lot). Source injoignable, configuration incomplète, répertoire illisible, démon qui
  répond **sans dater sa base de signatures** : tout cela rend `indetermine`, qui n'est ni
  vert ni rouge. ⚠️ Et la distinction va dans l'autre sens aussi : un répertoire **lisible et
  vide** est « non conforme », pas « indéterminé » — la source a répondu, et elle a répondu
  « rien ».
- **Une preuve périmée redevient absente**, et « périmé » n'est **pas** « non conforme » :
  une preuve périmée ne dit pas que le contrôle a échoué, elle dit qu'on ne sait plus. La
  fraîcheur est **dérivée** (`f_collecte_fraicheur`), jamais rangée — une colonne « valide »
  vieillirait sans que rien n'écrive.
- **Le PASSAGE au rouge ouvre une action** et la **rattache à la mesure** ; rester rouge n'en
  ouvre pas. Un connecteur qui passe toutes les cinq minutes sur un contrôle rouge créerait
  **288 actions par jour**, et le plan d'actions deviendrait illisible — y compris le jour où
  il dit quelque chose. Et `indetermine` ne crée **rien** : accuser l'équipe sécurité d'une
  panne de réseau n'aide personne.
- **L'historique du contrôle** (23.3) : chaque passage écrit une ligne, et « depuis quand »
  se **compte** au lieu d'être rangé. Un contrôle qui ne garde que son dernier état ne sait
  pas dire « rouge depuis trois semaines » — or c'est cela qu'un auditeur demande.
- **L'indicateur « preuves fraîches »** rejoint les courbes de tendance existantes, **sans
  écran neuf**. ⚠️ On compte les preuves **fraîches** et non les périmées, et le choix de
  polarité est le point délicat : un indicateur absent d'un point d'historique se lit `0`, ce
  qui, avec « nombre de périmés », serait une **bonne nouvelle inventée**.
- **Deux écrans** : « Ouverture technique » en onglet des Paramètres, « Collecte automatique »
  en onglet des Mesures. *Une capacité qu'aucun écran n'appelle est une capacité absente.*

#### Corrigé — quatre défauts trouvés en construisant, aucun par une relecture

- 🛑 **Ce qui est ADMIS n'est pas ce qui est ÉMIS** (migration `056`). `echeance_franchie`
  était admis par la contrainte depuis la `053` et **émis par personne** : un exploitant se
  serait abonné, l'écran aurait montré l'abonnement actif, la file serait restée vide, et
  rien n'aurait dit pourquoi. ⚠️ **Le garde-fou de la `053` nommait ce danger dans son propre
  témoin** — il visait le cas où la contrainte se **vide**, pas celui où elle est juste et où
  l'émetteur manque. *La barrière regardait dans une direction ; le trou était dans l'autre.*
  Un franchissement d'échéance n'étant l'insertion d'**aucune** ligne, l'enfilage a été
  extrait du déclencheur et le minuteur des relances l'émet.
- **L'intersection des droits se faisait sur le niveau le PLUS ÉLEVÉ.** Émettre un jeton
  exige l'administration : `droits.niveau` vaut donc toujours « administration » chez qui
  peut émettre, et l'intersection était **décorative**. Un administrateur de l'application,
  simple lecteur sur les risques, obtenait un jeton **administrateur sur les risques**. Le
  niveau se rabat désormais sur le **plus faible des domaines demandés**.
- **Un domaine hors des droits était retranché EN SILENCE.** Le jeton rendu « marchait »,
  sans le domaine demandé, et l'intégration échouait des semaines plus tard sur un 403 que
  personne ne rattachait à cette émission. Classe **Q-201 / Q-207** : on refuse, et on nomme
  le domaine.
- **Le vocabulaire des réglages d'un connecteur est CLOS** (`055`), et le motif est le
  secret : `connecteurs` devient une **entité** (schéma `data` **v27**) et voyage donc dans le
  fichier d'échange, qui est lisible et éditable. Une configuration ouverte y aurait tôt ou
  tard porté un mot de passe **en clair**. ⚠️ La parade n'est **pas** d'interdire les clefs qui
  *ressemblent* à un secret — `motdepasse_2` passerait, et reconnaître un mot au lieu de
  mesurer un sens est ce que le `CONVENTIONS.md` §39.1 interdit. C'est la **liste** qui est
  close, déclarée en base, et **lue** par le serveur au lieu d'être recopiée (constat Q-219).
  Effet second, qui vaut à lui seul : un réglage mal orthographié est **refusé** au lieu
  d'être ignoré (constat Q-91).

#### Corrigé — trois défauts que seul le banc pouvait dire

- **`jetons_api.domaines` est un `text[]`**, type qu'aucune entité n'expose — et le catalogue
  de la couche d'entités, qui balaie **toutes** les tables, s'arrêtait dessus : **le serveur
  ne démarrait plus**. La famille est nommée, et les trois conversions la **refusent
  explicitement** : le jour où une entité exposera un tableau, il faudra décider ce qu'il
  devient dans le fichier d'échange, et ce jour-là le produit le dira au lieu de deviner.
- **`u.login` et `f.actif` n'existent pas** — les colonnes s'appellent `identifiant` et
  `statut`. `42703` à **chaque vérification de jeton**, c'est-à-dire sur tout appel par jeton.
  *Les deux requêtes se lisent bien ; c'est ce qui les rend invisibles à une relecture.*
- **`actions.id` n'a pas de valeur par défaut** : le déclencheur qui ouvre une action au
  passage au rouge échouait en `23502`, et comme il vit dans la transaction du constat,
  **il empêchait d'écrire la preuve**. *Le garde qui ouvre l'action empêchait d'écrire ce
  qu'elle documente.*

#### 🛑 Corrigé — CINQ défauts trouvés EN CLIQUANT SUR LA RECETTE, aucun par le banc

⚠️ **C'est la cinquième fois de la semaine, et le premier de la liste est le plus grave
du lot** (`docs/REPRISE.md` §4).

1. 🛑 **UN JETON ÉMIS RENDAIT 401 À SON PREMIER USAGE** — la fonctionnalité entière était
   inopérante, livrée, et verte au banc. `jetons_api` est **cloisonnée**, et la recherche
   par empreinte a lieu **avant** qu'un périmètre existe : c'est elle qui va le produire.
   *La ligne était invisible à la seule transaction qui devait la voir.*
   - ⚠️ **Trois remèdes ont été écartés, et chacun se heurtait à une barrière que le
     produit avait de bonnes raisons de poser** : ouvrir la politique de lecture à
     `f_authentification()` est **refusé par un garde-fou existant** (migration `007` §5 —
     *un réglage de session ne doit jamais élargir une LECTURE*) ; `using (true)`, comme
     `sessions`, aurait laissé une filiale lister les accès ouverts chez sa voisine ; et
     une fonction `security definer` **ne contourne rien**, la RLS étant forcée y compris
     pour le propriétaire.
   - Le secret porte donc **sa filiale, en clair**, devant l'aléa : la couche
     d'authentification la lit **sans interroger la base**, pose ce périmètre, puis cherche
     l'empreinte sous la RLS ordinaire. ⚠️ **Rien n'est affaibli** — une marque forgée fait
     chercher là où rien n'est, et rend le même refus qu'un secret inventé.
   - ⚠️ **DIX-HUIT ESSAIS MESURAIENT LES JETONS, ET AUCUN NE L'A VU** : ils appelaient
     `verifierJeton()` sous `base.avecPerimetre(...)`, **qui pose un périmètre**. *Le banc
     mesurait la fonction ; personne ne mesurait ce que l'appelant reçoit.* C'est mot pour
     mot le constat **Q-325** — « `GRC07` n'arrivait nulle part », éprouvé en SQL direct et
     jamais par la route —, **reproduit huit jours plus tard dans un autre lot**. Une
     famille entière naît pour cela : `test/ouverture/authentification-par-jeton.test.mjs`
     monte le serveur réel et présente un vrai `Authorization: Bearer`. Elle a été **jouée
     contre le défaut avant d'être gardée**, et elle rougit.
2. **Le formulaire d'émission n'offrait NI domaine, NI niveau, NI export**, et le serveur
   exige au moins un domaine : l'écran était **inutilisable**, et affichait un message qui
   parlait d'un choix que rien ne proposait. Classe **Q-201 / Q-207**.
3. **Le menu des abonnements ne proposait que trois événements sur quatre** :
   `echeance_franchie` manquait, parce que la route découvrait les **déclencheurs** et
   qu'aucun déclencheur ne peut voir un fait dérivé. *La correction du matin, refaite d'un
   cran plus haut le soir même, dans l'écran écrit pour la porter.*
4. **Depuis l'écran des mesures, la collecte automatique était INATTEIGNABLE** : la barre
   d'onglets était posée d'un seul côté. *Une capacité qu'aucun écran n'appelle est une
   capacité absente* — et un chemin à sens unique est un demi-chemin.
5. **Huit classes CSS écrites et définies dans aucune feuille** — `form-grid`, `cases`,
   `cards-grid`, `liste-detail`, `encart-alerte`, `secret-jeton`, `case-en-ligne`,
   `btn-sm` —, plus trois noms de badges inventés là où le produit en a déjà quatre.
   ⚠️ **C'est exactement le défaut du 19/09 au matin**, refait le soir : *une classe écrite
   n'est pas une classe définie, et aucun essai ne le dit.*

#### Leçon de méthode — un essai peut couvrir une règle sans jamais la faire décider

⚠️ Le §1 de `test/collecte/`, écrit pour tenir **le critère le plus important du lot**,
écrivait une valeur textuelle dans un réglage numérique : l'exécuteur rendait « indéterminé »
pour *configuration incomplète*, **sans jamais interroger la source**. Contre la mutation
« une source injoignable rend conforme », il restait **vert**. C'est le constat **Q-210**,
et il n'a été vu que parce que la mutation a été jouée — pas parce que l'essai a été relu.

### Les catalogues de référentiels entrent en base — L26 (19/09/2026)

**Migrations `051` et `052`, schéma `data` en v26**, écran **Gestion des catalogues** en
onglet du sujet « référentiels », et trois lectures neuves sous `/api/catalogues/`.

**Ce que c'était.** Six fichiers JavaScript publiés dans la racine web, chargés par douze
balises `<script>`. Trois conséquences, et aucune n'était théorique : une évolution de
norme était une **livraison de code** ; un client **ne pouvait pas apporter sa grille**,
alors que chaque donneur d'ordre de la filière aéronautique a la sienne ; et rien ne
**datait** les catalogues — personne ne savait, en ouvrant le produit, que le guide
d'hygiène de l'ANSSI qu'il évalue a été publié en 2017.

**Le critère qui a gouverné tout le lot est étroit** : *les auto-évaluations sont stockées
par `(ref_id, code)`, la migration conserve les codes **à l'octet près**, et un essai
compare le catalogue migré au catalogue source, exigence par exigence.*

⚠️ **Les 470 lignes du semis n'ont pas été tapées : elles ont été ENGENDRÉES** depuis les
fichiers source, par un programme qui les charge et les recopie. Un semis recopié à la main
aurait introduit, sur 424 exigences, au moins une différence — un accent, une espace
insécable, un « 5.1 » devenu « 5.10 » — et cette différence aurait **réattribué une réponse
d'audit en silence**. ⚠️ Et l'engendrement ne suffit pas : `test/catalogues/fidelite.test.mjs`
recharge les mêmes fichiers à chaque banc et compare la base, champ par champ. *Un semis
engendré une fois est juste une fois ; c'est la comparaison qui le garde juste.*

**Le registre du navigateur n'a pas changé d'interface — il a changé de source.** `get()`,
`all()`, `flatExigences()` et `couverture()` sont intacts, et aucun des modules qui les
appellent n'a à le savoir : c'est le principe qui a permis de basculer vingt-six modules
sans en réécrire un seul au lot L2.

**Ce que le lot apporte, action par action :**

- **26.1** — quatre tables MIXTES, les six catalogues et leurs six dictionnaires ;
- **26.2** — une grille apportée par une filiale passe par le **moteur d'import du lot L7**,
  sans une ligne écrite pour elle, et se comporte comme un catalogue livré ;
- **26.3** — une révision de norme est un **autre référentiel** qui `remplace_id` le
  précédent ; la route rend le **PLAN** de reprise des réponses — ce qui se reporte, ce qui
  est abandonné, ce qui reste à évaluer — et **signale les intitulés qui ont changé sous le
  même code** ;
- **26.4** — des correspondances **proposées** par similarité de libellés, avec leur score.
  Rien n'est créé tant qu'un humain ne clique pas ;
- **26.5** — l'ancienneté est **dérivée**, et « date inconnue » n'est **jamais** « à jour ».

🛑 **DEUX DÉFAUTS TROUVÉS PAR LE BANC, ET LE PREMIER ÉTAIT GRAVE.**

1. **Le balayage de renommage réécrivait les CODES du catalogue.** Quand le serveur
   réattribue l'identifiant d'un enregistrement créé, `js/core/sync.js` réécrit toute
   chaîne égale à l'ancien — il ne peut pas savoir lesquels de ces champs étaient des
   références (`CLAUDE.md` §3, cas c), alors il réécrit et **prévient**. Depuis que les
   catalogues vivent dans `data`, les codes du guide d'hygiène de l'ANSSI y sont « 1 » à
   « 42 » : la reprise d'un export ancien portant l'identifiant « 7 » **réécrivait le code
   7 de l'ANSSI**. Or ce code est la moitié droite de la clé par laquelle toute
   auto-évaluation est stockée. Mesuré : *« 7 → 4 valeur(s) »* au lieu d'une. Les quatre
   collections de catalogue sont désormais écartées du balayage — *un catalogue de norme
   ne référence aucun enregistrement de l'utilisateur ; il n'a rien à recaler, il n'a que
   des dégâts à subir.*

2. **Une colonne `jsonb` était tenue pour CHANGÉE à chaque fois.** `valeursEquivalentes()`
   rendait `false` sans regarder : une filiale exportait son jeu de données, le
   réimportait, et recevait **403 « cet élément appartient au socle commun du Groupe »** —
   parce que les documents figés du socle étaient réputés modifiés. *Le produit produisait
   une sauvegarde qu'il refusait de relire*, classe des constats **Q-194** et **Q-284**,
   tranchée pareil : **restaurer une sauvegarde gagne.**
   ⚠️ **Le défaut ne datait pas de ce lot** : il dormait depuis les premières colonnes
   `jsonb` — la grille d'un audit, les étapes RACI d'un scénario PRA. Il ne s'était jamais
   VU parce qu'aucune de ces tables ne porte de ligne de portée Groupe.
   ⚠️ Et **la première rédaction du correctif n'a rien changé** : elle comparait un objet
   analysé (ce que `pg` rend) à une CHAÎNE (ce que la couche d'écriture produit).

⚠️ **ET DEUX DÉFAUTS TROUVÉS EN CLIQUANT SUR LA RECETTE**, le septième et le huitième de
la semaine : l'écran perdait sa **barre d'onglets** — `ongletsHtml` attend la liste que
`ongletsDe` compose, pas une route, et il rendait la chaîne vide **sans une erreur** —, et
la **veille était INERTE**. La migration `051` posait la colonne, la dérivation et le
garde-fou, et **aucune fenêtre de surveillance** : les six catalogues rendaient « non
surveillé », et le produit ne signalait rien. Jamais. *Une capacité qu'aucune donnée
n'active est une capacité absente.* La migration `052` pose la fenêtre à soixante mois —
et le guide de l'ANSSI, publié en 2017, bascule immédiatement en **« à vérifier »**. C'est
vrai, et c'est ce que l'action 26.5 doit dire.

**Mesuré** : 52 migrations, 81 tables, 324 politiques, **56 garde-fous**, 455 décisions ;
familles neuves `test/catalogues/` (24 essais) ; publication **82 fichiers** — douze de
moins, les catalogues ayant quitté la racine web.

### La quantification financière d'un risque — L25, action 25.4 (19/09/2026)

**Migration `050`, schéma `data` en v25**, panneau **FAIR** sur la fiche de risque, et une
colonne de plus à la vision Groupe. *L'action qui manquait à L25, et le lot est complet.*

**Le problème que l'action 25.3 venait de rendre visible.** Depuis les échelles, la
consolidation **refuse** d'additionner deux expositions cotées sur des graduations
différentes. C'est honnête, et cela laisse sans réponse la seule question qu'un comité de
direction pose : *« combien ça nous coûte ? »* Une somme d'argent, à devise égale,
s'additionne toujours — c'est la raison d'être de FAIR.

**La méthode, et ce qu'elle refuse.** La fréquence d'un événement de perte et sa magnitude
s'estiment chacune par un **triplet** `(minimum, plus probable, maximum)` ; la perte
annualisée est le produit des deux **moyennes PERT** — `(min + 4 × probable + max) / 6`.

⚠️ **Un triplet incomplet ne rend RIEN**, et le refus est posé à **deux étages** : une
contrainte refuse d'écrire un triplet à deux valeurs, et la dérivation rend `null` sur tout
argument nul. Deux valeurs sur trois donneraient un nombre qui *aurait l'air* mesuré — et
c'est celui-là qu'on cite en comité de direction. C'est le critère 25.4 mot pour mot : *pas
d'estimation par défaut*.

⚠️ **Des pertes secondaires absentes NE VALENT PAS ZÉRO.** Écrire `coalesce(secondaire, 0)`
aurait toujours abouti — et sous-estimé **en silence** toute quantification où personne n'a
chiffré l'amende, c'est-à-dire produit l'estimation par défaut *dans le sens rassurant*, le
pire des deux. Le montant ne porte alors que la perte primaire : c'est un **PLANCHER**, que
`secondaire_estimee` marque et que l'écran annonce par un « ≥ ».

⚠️ **Le montant est INÉCRIVABLE** : `perte_annualisee` est une colonne `generated always`,
et le navigateur la reçoit sous `_perteAnnualisee` — un champ à souligné initial, écarté à
l'entrée **par le préfixe**. Il n'y a donc pas d'aperçu en direct pendant la saisie : il
faudrait une seconde implémentation de la dérivation, qui divergerait de celle que la
consolidation du Groupe additionne (constat **Q-219**).

🛑 **ET LE PLUS IMPORTANT DE CE LOT NE PARLE PAS DE QUANTIFICATION.**
`f_verifier_ebios_cadrage()` tient depuis la migration `046` la garantie centrale de L25 —
*aucun traitement automatique ne réinterprète la cotation F × G × M*. Son sixième contrôle
balayait les tables dont le **nom** commence par `ebios_`. La table créée ici s'appelle
`risque_quantification` : **elle lui échappait**.

Et le mode de défaillance est le pire de tous : *un garde qui ne regarde pas rend zéro
anomalie, c'est-à-dire exactement ce qu'il rend quand tout va bien.* **Mesuré, pas
supposé** : la rédaction d'origine, remise en place avec un déclencheur fautif, rend
**0 anomalie** là où la rédaction élargie en rend une. Le balayage part désormais du
**catalogue entier**. C'est la règle du `CONVENTIONS.md` §39 retournée contre elle-même une
fois de plus — *reconnaître un NOM au lieu de mesurer ce qu'une chose FAIT*, motif des
constats **Q-312** et **Q-313**.

🛑 **ET UN DÉFAUT TROUVÉ AU NAVIGATEUR SUR LA RECETTE, APRÈS UN BANC VERT — le sixième en
une semaine.** On enregistre une estimation complète, et le panneau affiche « estimation
incomplète : le montant n'est pas calculé ». Le montant existait : la base l'avait calculé,
la route l'avait renvoyé — et **`js/core/sync.js` ne lisait de la réponse que deux choses**,
l'identifiant définitif et le numéro de version. Tout le reste était **jeté**.

*Le défaut ne vivait ni dans la base, ni dans la route, ni dans l'écran : il vivait dans ce
qu'une couche intermédiaire choisissait de ne pas garder.* Et il ne pouvait apparaître
qu'avec la **première entité dont un champ AFFICHÉ est calculé par la base** — jusque-là,
tout ce que l'écran montrait, il l'avait lui-même écrit.

⚠️ **Le remède ferme la CLASSE, par le PRÉFIXE et non par une liste** : `sync.js` adopte
désormais tout champ à **souligné initial** rendu par le serveur — la marque, dans tout le
produit, de ce que le serveur ajoute. Une liste de noms aurait rattrapé `_perteAnnualisee`
et manqué le prochain champ dérivé, **en silence**.

⚠️ **Et l'essai qui le garde a failli être creux** : sa première rédaction restait VERTE
sous la mutation — le **sondage** finissait par rapporter la modification, et le montant
apparaissait vingt secondes plus tard au lieu de trois. Ce qui mord est le **compte des
rechargements** : le montant doit venir de la réponse de l'écriture, pas d'un
`/api/rafraichir`. *Un essai qui couvre une règle sans jamais la faire décider ne la couvre
pas* (constat **Q-210**).

**Ce que le banc a trouvé, et que je n'avais pas vu :**

- `I18n.nombre()` porté jusqu'à un gabarit **sans échappement** — la devise vient de la
  base. `UI.montantFair` rend désormais du balisage **déjà échappé**, comme `UI.badge`, et
  les deux appelants ne l'échappent plus ;
- un **emoji** dans une chaîne affichée (`⚠️` dans l'aide d'une colonne de la vision
  Groupe) — arbitrage E du `docs/REPRISE.md` §2 ;
- le **semis du banc** ne couvrait pas la table neuve : *« zéro visible » est aussi ce que
  rend une table vide* ;
- et la migration a été refusée **trois fois** par `f_verifier_schema()` — trois colonnes
  `jsonb` sans décision au registre de l'article 30, quatre tables sans déclencheur de
  pièces, une unicité sans `filiale_id`. ⚠️ La troisième correction était elle-même
  fautive : le régime « signaler » construit une comparaison **textuelle** que la base
  refuse sur un `jsonb`, et la purge — transactionnelle — s'en serait avortée **pour toutes
  les filiales** (constat **Q-300**).

**Mesuré** : 50 migrations, 77 tables, 308 politiques, **55 garde-fous**, 432 décisions ;
famille neuve `test/quantification/` (22 essais, dont **cinq mutations jouées et rougies**).

### Les échelles de cotation, versionnées et datées — L25, action 25.3 (19/09/2026)

**Ce que « 3 » veut dire cesse d'être écrit en dur dans le navigateur.** Jusqu'ici, les
quatre niveaux d'une gravité vivaient dans `js/modules/risques.js` et
`js/modules/ebios.js` : aucune ligne du produit ne disait *quelle* gravité est un 3, qui
l'avait décidé, ni depuis quand. Le jour où une filiale passe à cinq niveaux, les
cotations d'hier et celles de demain se rangent **dans la même colonne** et le tableau de
bord les additionne — sans que rien ne le signale, puisque la donnée est du même type,
dans la même borne, sous le même nom.

Migration **`049`**, schéma `data` en **v24**, écran `js/modules/echelles.js` en **onglet
du sujet « risques »**, à côté des ateliers EBIOS RM.

| | |
|---|---|
| `echelles` + `echelle_niveaux` | MIXTES : `filiale_id` nul = socle du Groupe, renseigné = échelle d'une filiale |
| Six colonnes sur cinq tables | `risques` (F et G), l'événement redouté, le scénario opérationnel, le couple source / objectif, la partie prenante |
| `f_echelle_porteurs()` | la déclaration vit **dans la base**, et le serveur la LIT — la recopier en TypeScript en ferait une seconde source |
| `f_cotation_dans_son_echelle()` | refuse une échelle introuvable, d'un autre sujet, en brouillon, d'une autre filiale, ou une valeur hors graduation |
| `f_verifier_echelles()` | **54ᵉ garde-fou** : part du catalogue, se vérifie dans les deux sens, mesure le `tgtype` et l'action des clés |

⚠️ **LE CONFLIT ENTRE DEUX DOCUMENTS QUI FONT AUTORITÉ, ET COMMENT IL SE TRANCHE.** Le
`PLAN_SERVEUR` §2.2 range l'échelle au niveau **Groupe** — *« sans quoi les risques ne
s'additionnent pas »* — quand le critère 25.3 la veut **configurable par filiale**. Le
§2.2 n'énonce pas un interdit : il énonce une **conséquence**. Le remède n'est donc pas
d'interdire, c'est de rendre l'échelle **explicite et portée par chaque cotation**, pour
que la consolidation puisse refuser d'additionner ce qui n'est pas comparable au lieu de
l'additionner en silence.

⚠️ **RIEN N'EST RÉATTRIBUÉ.** Les six colonnes sont nullables, et `null` **ne veut pas
dire « échelle du Groupe »** : il veut dire *« échelle non tracée »*, et c'est ce que
l'écran affiche. Toute cotation antérieure est dans ce cas ; lui attribuer d'office la
graduation du jour inventerait un fait — c'est le motif du constat **Q-192**, dans l'outil
qui sert de preuve en audit. Le palier de reprise v23 → v24 ne devine donc **rien**.

⚠️ **ET LE MARQUAGE NE VIT PAS DANS UN DÉCLENCHEUR**, pour une raison qui vaut au-delà de
ce lot : un `before insert` ne distingue pas *« l'appelant n'a rien dit »* de *« l'appelant
a dit : pas d'échelle »* — il voit deux fois une colonne nulle. Il vit dans
`src/entites/`, seule couche qui connaît la différence, et il est appelé **après**
`retirerLesInchangees` : ré-enregistrer une fiche sans rien changer ne réestampille rien.

⚠️ **DEUX GARANTIES QU'ON CROYAIT POSÉES NE L'ÉTAIENT PAS, ET C'EST LE MÊME DÉFAUT DEUX
FOIS** — `CONVENTIONS.md` **§45** :

1. une **clé étrangère composite ne contrôle RIEN** quand une colonne est nulle
   (`MATCH SIMPLE`), et `filiale_id` l'est pour tout le socle du Groupe : la portée d'un
   niveau est donc tenue par un **déclencheur**, pas par la clé que le §17.1 prescrivait ;
2. une **unicité traite deux NULL comme distincts** : le socle pouvait porter deux
   révisions 1 du même sujet. `nulls not distinct` le dit en un mot — **et laisse
   `filiale_id` parmi les colonnes de clé**, donc le garde-fou du cloisonnement continue de
   le voir, au lieu d'être dispensé de regarder par une entrée de plus dans une liste de
   dispenses que personne ne relit.

🛑 **ET LE BANC A TROUVÉ UN DÉFAUT BLOQUANT DANS LA PREMIÈRE RÉDACTION.** Le §6 interdisait
d'ajouter un niveau à une échelle publiée, **sans exception** — et
`GET /api/export` puis `POST /api/reprise « remplacer »` rendait **409** : *le produit
produisait une sauvegarde qu'il refusait de relire*. C'est la classe des trois conflits de
la migration `041` et des constats **Q-194** et **Q-284** — *un invariant d'ajout seul
contre un balayage qui supprime* —, et elle se tranche toujours pareil : **restaurer une
sauvegarde gagne**.

Deux discriminants ont remplacé l'interdit : *(a)* **une ligne écrite dans la même
transaction n'est « publiée » pour personne** (`f_ligne_ecrite_ici()`), ce qui laisse
passer la reprise sans ouvrir la retouche d'une échelle en service ; *(b)* la
**suppression** n'est plus interdite par un déclencheur mais par les six clés
`on delete restrict`, qui **ignorent la RLS** et protègent donc aussi la cotation d'une
filiale invisible — plus fort que ce qu'on retire. Le retrait d'un **niveau** reste refusé,
par un déclencheur de contrainte **différé au commit** : un `before delete` ne distingue
pas un retrait de la disparition de l'échelle entière.

⚠️ **Et le premier discriminant était faux à sa première écriture** : il comparait `xmin` à
`pg_current_xact_id()`, qui rend la transaction de **premier niveau** — or la couche
d'écriture pose un **point de reprise** à chaque insertion. L'exemption n'aurait joué sur
aucun chemin réel, avec un commentaire affirmant le contraire. `pg_xact_status()` répond
pour une sous-transaction comme pour une racine.

⚠️ **ET LA CONSOLIDATION REFUSE D'ADDITIONNER CE QUI N'EST PAS COMPARABLE.** Sans cela, la
phrase ci-dessus sur le §2.2 serait de la rhétorique : dès que deux échelles sont
**employées** dans le périmètre d'une session Groupe, `GET /api/consolidation` rend
`expositionResiduelle: null` et publie la liste des échelles ; l'écran en tire sa phrase,
au lieu d'un « — » qu'on confondrait avec « personne n'a rien coté ». ⚠️ **Les cotations
non tracées ne comptent PAS pour une divergence** : elles ne prouvent rien, et les traiter
comme telles aurait rendu l'indicateur nul sur toute installation existante — *on refuse
d'additionner quand on SAIT que c'est faux, pas quand on l'ignore*.

⚠️ **Un défaut de plus, trouvé par l'essai et invisible autrement** : l'agrégat des
échelles est un `id_metier[]`, dont le pilote `pg` ignore l'OID — il rend la représentation
**textuelle** du tableau, `new Set(...)` la découpe en **caractères**, et l'union en compte
vingt et quelques. L'exposition consolidée serait restée nulle **en permanence**, sur toute
installation. Un `::text[]` le ferme. *L'essai ne l'a vu que parce qu'il sème d'abord sa
matière* (motif Q-210).

⚠️ **ET TROIS DÉFAUTS DE PLUS, TROUVÉS EN CLIQUANT SUR LA RECETTE APRÈS 2 230 ESSAIS
VERTS.** C'est la quatrième leçon de méthode de `docs/REPRISE.md`, vérifiée une fois de
plus : *vérifier au navigateur trouve ce que deux mille essais ne voient pas*.

1. **L'écran archivait le SOCLE DU GROUPE** quand une filiale publiait le sien. Le serveur
   refusait — 403, écrire une ligne de portée Groupe est réservé à l'administration
   Groupe — et **l'écran avalait le refus** : il annonçait la publication pendant que le
   socle restait en place. Le refus était le bon comportement : archiver le socle le
   retirerait aux dix-neuf autres filiales, pour une décision qu'une seule a prise.
2. **Deux échelles sont « en vigueur », et une seule gouverne.** Le socle et l'échelle
   locale le sont toutes deux ; le `find()` du `DataStore` prenait la première venue. Une
   filiale publiait cinq niveaux et **sa fiche de risque en proposait quatre** — le serveur
   tranchait déjà dans le bon sens, c'est l'écran qui disait autre chose que la base.
3. **Le socle DISPARAISSAIT de l'écran** dès qu'une filiale publiait le sien : l'historique
   filtrait sur le statut, et le socle reste « en vigueur ». La filiale ne voyait plus ce
   qu'elle avait cessé d'employer. Classe Q-201 / Q-207.

⚠️ **Et un quatrième, de style, qui ne touche pas que ce lot** : `class="card"` et
`class="muted"` n'existaient **dans aucune feuille de style**. Les trois écrans livrés les
18 et 19/09 — campagnes, ateliers EBIOS RM, échelles — se rendaient **à plat** au milieu
d'un produit qui a des cartes partout. Le balisage était correct, la classe écrite, et rien
ne disait qu'elle ne menait nulle part. Les deux classes sont définies dans `style.css` —
**corriger la classe et non l'instance** : le quatrième écran qui les emploiera sera juste
sans qu'on y pense.

Banc : deux familles neuves — `test/echelles/` (23 essais), dont cinq **mutations** du
garde-fou et deux du marquage, jouées et rougies ; `test/navigateur/echelles.test.mjs`,
qui rejoue les trois défauts ci-dessus **dans un vrai navigateur** et dont les deux
mutations ont été jouées et rougies ; plus deux essais de consolidation, dont la mutation a
été jouée.

⚠️ **Le premier de ces essais a failli être creux** : « le socle est intact » reste VRAI
sous la mutation, puisque c'est le serveur qui refuse. Ce qui mord est le **refus lui-même**
— l'essai compte les réponses `4xx` pendant la publication, et exige zéro.

### « Échange de données » devient PARAMÈTRES, en quatre onglets (19/09/2026)

Demandé par l'utilisateur : *« je sens que la section Échange de données ne sert à rien…
on peut l'effacer completement sans risques, ou bien la remplacer avec une vraie section
Parametres ? »*.

**Mesuré avant de trancher, parce que l'intuition était à moitié juste.** L'écran portait
déjà **six blocs**, dont trois sans rapport avec l'échange — l'état de la liaison, la
sécurité, le jeu de découverte. Le nom mentait sur le contenu. Mais l'échange, lui, garde
deux usages qu'un serveur partagé ne supprime pas : la **sortie de filiale** (lot L13 —
l'enveloppe remise à l'acquéreur est l'**unique trace** d'une opération irréversible) et
la reprise d'une filiale rachetée déjà équipée. Dans un groupe qui fait des acquisitions,
c'est le cas nominal. Effacer aurait donc coûté deux capacités ; renommer et ranger ne
coûte rien.

| Onglet | Ce qu'il apporte |
|---|---|
| **Identité** | ce que le serveur sait de la filiale — raison sociale, coordonnées, langue. ⚠️ **Le serveur les JOIGNAIT à la charte de session depuis le 04/09** et `js/core/session.js` **les jetait** : c'est la moitié frontend du constat **Q-160**, restée ouverte quinze jours parce que rien ne rougit quand un client ignore un champ qu'on lui sert (classe **Q-69**) |
| **Réglages** | la table `parametres` cesse d'être invisible — deux seuils jusque-là écrits en dur : le seuil « urgent » de l'échéancier et le préavis de revue documentaire |
| **Échange de données** | l'existant, avec son avertissement |
| **Jeu de découverte** | l'existant, toujours conditionné au profil |

#### ⚠️ « Personne ne lit cette table » était FAUX, et il a fallu casser pour le savoir

Le diagnostic de départ disait : *`parametres` existe depuis la `001` et personne ne
l'écrit ni ne la lit*. **Deux mécanismes y écrivaient déjà, sans papiers**, et ce sont les
garde-fous neufs qui les ont révélés en les cassant :

- `src/notifications/relances.ts` — `notifications.derniere_relance`, la fenêtre
  anti-doublon du lot L12, une clé par filiale. Le déclencheur « aucune surcharge hors
  catalogue » a refusé son écriture ;
- `deploy/retention.sh` — `journal.ancrage_<année>`, l'empreinte du dernier maillon
  archivé, **sans laquelle la chaîne du journal ne se vérifie plus de part et d'autre
  d'une coupure**. La contrainte de complétude a fait échouer le script.

*Une table qu'on croit morte mérite d'être interrogée avant d'être décrite ainsi* — c'est
la règle du `CLAUDE.md` §0, appliquée à une table plutôt qu'à une machine. Les deux clés
sont désormais **au catalogue, avec leurs papiers**, et le second cas a corrigé la règle
elle-même : le discriminant n'est pas « niveau Groupe » mais **« modifiable »** — un
réglage offert à l'écran doit porter de quoi s'afficher et de quoi être hérité ; un **état**
que le produit tient pour lui-même ne doit rien.

#### Un magasin FERMÉ, tenu par trois barrières

Un réglage que le produit ne lit pas est un réglage qui ment : l'exploitant le modifie,
croit avoir agi, et rien ne change (constat **Q-91**, aggravé ici — le produit propose
lui-même la modification). Trois barrières, chacune sur un chemin différent :

1. **la route** refuse une clé absente du catalogue ;
2. **la base** refuse une surcharge orpheline — un déclencheur, pas un `if` de route : il y
   a quatre chemins d'écriture, et une route ne voit que le sien (`CONVENTIONS.md` §8.1) ;
3. **le dépôt** refuse qu'une clé entre au catalogue sans qu'un fichier du produit la lise
   (`test/depot/reglages-catalogue-lus.test.mjs`).

#### ⚠️ Et une règle du dépôt enfreinte, puis rétablie

La première rédaction du garde-fou **lisait des lignes de `parametres`**. Le
`CONVENTIONS.md` §41 l'interdit — *un garde-fou de schéma ne lit aucune ligne d'une table
cloisonnée*, parce qu'`install.sh` appelle `f_verifier_schema()` sans périmètre —, et
l'appel est tombé en `GRC04` à l'exécution suivante.

Le §41 donne son propre remède, mot pour mot : *« un garde qui doit lire des lignes est
souvent le signe qu'une contrainte manque »*. C'était le cas **deux fois** : les deux
propriétés sont devenues une **contrainte** et un **déclencheur**, et le garde-fou ne
regarde plus que `pg_constraint` et `pg_trigger`.

### Le journal d'audit part vers l'agrégateur de logs — sans ouvrir une sortie réseau (19/09/2026)

Demandé par l'utilisateur : *« exporter les logs vers un agrégateur de logs, comme du
Graylog, qui contient déjà les logs des autres serveurs de l'entreprise »*.

Chaque entrée du journal d'audit est désormais **aussi** écrite en une ligne JSON sur la
sortie standard, marquée `"flux":"journal_audit"`. L'unité systemd la dirige vers
`journald` ; un `rsyslog` la pousse vers Graylog. **C'est rsyslog qui sort, jamais le
service** : `IPAddressDeny=any` reste fermé, et le `docs/GUIDE_EXPLOITATION.md` §5 quater
donne la recette en trois gestes, dont la vérification.

#### Trois décisions, et chacune se mesure

- **Ni `valeurs_avant`, ni `valeurs_apres`.** Le constat **Q-330** a rangé le contenu des
  enregistrements sous le **droit d'export**, distinct de la lecture. Un flux continu n'a
  ni identité ni droit, et le cloisonnement par filiale n'existe pas dans un agrégateur :
  l'y verser serait un export permanent que personne n'a autorisé.
- **La ligne ne part qu'APRÈS le `commit`.** `journaliser()` écrit dans la transaction de
  l'appelant ; l'émettre tout de suite mettrait dans le SIEM un événement qu'un `rollback`
  efface ensuite de la base — **une fausse accusation, et qui ne se corrige pas une fois
  partie chez quelqu'un d'autre** (classe du constat Q-301). Le tampon est attaché au
  client par `avecTransaction`, vidé au `commit`, jeté au `rollback`.
- **La sortie ne dépend pas de `SERVEUR_NIVEAU_JOURNAL`.** Une ligne émise en `info`
  disparaîtrait sur un serveur réglé en `warn` : un réglage d'exploitation ferait taire la
  piste d'audit sans que personne l'ait voulu. Et **il n'y a aucun interrupteur dans le
  produit** — couper se fait par une règle `rsyslog`, parce qu'un réglage de plus est un
  réglage de plus à oublier.

#### ⚠️ Et un défaut introduit puis retiré dans la même journée, qui vaut son paragraphe

La première rédaction lisait le numéro de chaîne par `insert … returning`. **PostgreSQL
applique la politique de LECTURE au `returning`** : une entrée transversale — démarrage,
arrêt, refus d'autorisation — n'a pas de filiale, donc personne ne peut la relire, et
l'insertion échouait en `42501`.

Or ces appelants-là sont précisément **les trois que le §29.3 autorise à envelopper
`journaliser()` dans un `try`**, leur événement n'emportant aucune écriture métier :
l'échec était **avalé**, et le service démarrait en ne traçant plus son propre démarrage.

*Un enrichissement de confort avait supprimé des entrées du registre qui sert de preuve en
audit, sans qu'aucun écran ni aucun code de retour ne le dise.* C'est
`test/journal/couverture.test.mjs` qui l'a dit — celui qui exerce le produit puis **compte
ce qui est arrivé en base**, au lieu de relire `src/`.

Trois issues étaient possibles ; les deux premières — ouvrir la lecture du journal, ou
passer par une fonction `security definer` — coûtaient la condition **E6** ou une seconde
voie d'écriture dans un registre en ajout seul. La troisième a été prise : **se passer de
ce que `returning` apportait**. Détecter un trou ou une retouche est le travail de
`GET /api/journal/verification`, qui rejoue le chaînage en base ; la copie sert à
corréler, pas à prouver — et le guide le dit à l'endroit où on serait tenté de le croire.
Règle écrite : `db/CONVENTIONS.md` **§44**.

#### Et un garde de plus, pour que le différé reste vrai

`test/depot/transactions-par-la-porte.test.mjs` refuse qu'un fichier de `src/` ouvre une
transaction ailleurs que dans `src/db/pool.ts`. Il ne corrige rien — c'était déjà vrai —
il **fige** : un appelant qui gérerait sa propre transaction n'aurait pas de tampon, et sa
ligne partirait avant la validation **sans qu'aucun essai ne rougisse**.

### L25 — EBIOS RM : les ateliers 3, 4 et 5, et l'action 25.1 est complète (19/09/2026)

Migration `047`, schéma `data` en **v23**. L'écosystème et ses parties prenantes évaluées,
les **chemins d'attaque**, les **modes opératoires** et la **décision** de traitement —
éviter, réduire, transférer, accepter.

#### Trois absences délibérées, et chacune est le critère d'une action

- **La cartographie n'est pas refaite** (critère 25.2). `actif_dependances` porte déjà les
  dépendances typées ; ce que l'atelier 3 ajoute est l'**évaluation** d'une partie
  prenante, et le lien vers le prestataire du produit quand c'en est un — qu'elle
  **pointe** sans recopier ni raison sociale, ni criticité, ni niveau d'accès.
- **Un chemin ne porte AUCUNE colonne de gravité.** Elle est celle de l'événement redouté
  qu'il réalise. Une colonne ici créerait une seconde réponse à la même question, qui
  vieillirait dès la prochaine réévaluation de l'atelier 1 — sans que personne le sache.
  Le garde-fou le mesure **dans le catalogue** ; un essai aussi.
- **Le plan d'actions n'est pas refait.** `actions.risque_id` existe depuis le premier
  chantier : rattacher un scénario à un risque du registre suffit pour qu'il s'applique.
  ⚠️ **Et c'est un LIEN, pas une conversion** — l'essai relit les cinq colonnes de
  cotation du risque **et sa `version`** de part et d'autre du geste.

#### « Accepter » exige sa justification, et c'est la seule des quatre

Éviter, réduire et transférer produisent un travail que quelqu'un verra — un projet, un
contrat, un plan d'actions. **Accepter ne produit rien** : sans la phrase qui dit pourquoi,
la décision est indistinguable d'un oubli, et c'est exactement celle qu'un auditeur vient
chercher. Le schéma l'impose (`ck_ebios_scenarios_operationnels_acceptation`) ; l'écran la
**demande**, plutôt que de laisser remonter un code de contrainte.

#### ⚠️ Un garde de CLASSE, né de ce que la `046` avait payé

`f_verifier_set_null_composites()` refuse toute clé étrangère **composite** en
`on delete set null` **sans liste de colonnes** — la faute qui avait fait tomber dix essais
et, avec eux, **toute restauration de sauvegarde** (`CONVENTIONS.md` §43). Il balaie le
**catalogue** : il couvre les clés qu'aucune migration n'a encore écrites.

⚠️ **Et il ne juge pas les clés simples**, où `set null` sans liste nullifie la bonne
colonne et rien d'autre : un garde qui crie pour rien finit ignoré (constat Q-64). La
morsure **et** le non-bruit sont éprouvés.

> Le premier réflexe avait été d'écrire le contrôle nominatif et de noter qu'un garde de
> classe « restait à écrire ». C'est la forme de réserve que le `CLAUDE.md` §0 proscrit —
> *une réserve écrite n'est pas une réserve traitée* — et elle aura duré une migration.

#### Et le garde-fou a corrigé son auteur

Le témoin du niveau d'un scénario attendait « critique » pour 3 × 3 = 9, que le prédicat
range dans « élevé ». Le garde l'a dit **à la première application de la migration**. Il
porte désormais **les deux bornes** du seuil — 9 est le dernier « élevé », 12 le premier
« critique » — qui se contrediraient s'il bougeait d'un cran dans l'un ou l'autre sens.
*Un témoin qui se trompe de valeur ne mesure pas la fonction : il mesure la mémoire de
celui qui l'a écrit.*

### L25 — EBIOS RM : les ateliers 1 et 2, EN ADDITION de la cotation F × G × M (18/09/2026)

**Vague D entamée.** La méthode d'analyse de risque de l'ANSSI entre dans le produit —
migration `046`, schéma `data` en **v22**, greffon `src/ebios/`, écran
`js/modules/ebios.js` monté en **onglet du sujet « risques »**, à côté de « Matrice F×G ».
Cela couvre les actions **25.2** et **25.5** en entier, et **25.1** pour ses deux premiers
ateliers.

**Cinq collections neuves** : `ebios_connaissances` (la base de connaissances du Groupe —
sources de risque types et modes opératoires types, MIXTE comme `risque_catalogue`),
`ebios_etudes` (le cadrage : un périmètre, un exercice), `ebios_valeurs_metier`,
`ebios_evenements_redoutes` et `ebios_sources_risque` (les couples source de risque /
objectif visé).

#### ⚠️ Le critère qui gouverne le lot est NÉGATIF, et il est désormais MÉCANIQUE

*« Les risques cotés en F × G × M restent valides et lisibles. Une migration qui les
réinterpréterait réattribuerait **en silence** des cotations produites en audit. »* C'est
le motif qui a fait refuser la renumérotation du catalogue ANSSI (constat **Q-192**), et
une propriété négative ne se voit pas à l'usage : **elle ne se mesure qu'en la cherchant.**

`f_verifier_ebios_cadrage()` nomme donc les cinq colonnes de cotation de `risques` **une
par une** et refuse tout déclencheur d'une table EBIOS qui y écrirait — mesuré dans le
catalogue, pas dans une liste. Côté banc, `test/ebios/ateliers.test.mjs` relit les cinq
colonnes **et la `version`** de chaque risque avant et après avoir conduit un atelier
complet : une écriture invisible se verrait là, et c'est la seule façon de distinguer
« EBIOS RM s'ajoute » de « EBIOS RM a réinterprété ». **Le produit porte deux méthodes de
cotation en même temps, et elles ne se parlent pas.**

#### Ce que le produit NE fait pas, et pourquoi

- **La pertinence d'un couple se DÉRIVE** (`f_ebios_pertinence`), à un seul endroit — la
  ranger obligerait quelque chose à la remettre après chaque révision d'un critère, et
  l'animateur en révise en séance. ⚠️ Et elle **se tait dès qu'un critère manque** : pas
  d'estimation par défaut, motif du critère 25.4 — *un chiffre qui a l'air mesuré sans
  l'être est pire que pas de chiffre, parce qu'il est cité en comité de direction.*
- **Le produit propose, un humain décide.** Aucun « retenir tous les couples au-dessus de
  3 » : retenir engage les ateliers 3 et 4, et le schéma exige la **justification**
  (`ck_ebios_sources_risque_retenue`). L'écran la demande plutôt que de laisser remonter
  un code de contrainte.
- **Rien n'est ressaisi de ce qui existe** (action 25.2) : le socle de sécurité de
  l'atelier 1, ce sont les référentiels applicables et le pivot « Mesure » ; les biens
  supports, ce sont les `actifs` et leur cartographie ; et une valeur métier **POINTE** le
  processus du BIA — ni criticité, ni RTO, ni RPO n'ont de jumelle, et un essai le mesure
  dans le catalogue.
- **L'échelle n'est PAS figée à quatre niveaux.** Le schéma borne 1 à 10 : l'action **25.3**
  rendra les échelles configurables et **versionnées** par filiale, et un `check (1..4)`
  posé aujourd'hui serait une barrière que la migration suivante devrait abattre —
  c'est-à-dire une barrière qui n'en est pas une. C'est déjà l'arbitrage écrit en 2026 pour
  `risques.f_frequence`.

#### ⚠️ Deux refus, et aucun n'est venu d'une relecture

1. **`f_verifier_portee_figee()` a refusé le déploiement.** `ebios_connaissances` est
   MIXTE, et sans déclencheur de portée une ligne du socle Groupe peut **basculer** dans
   une filiale — transition qu'aucune politique RLS ne voit, puisqu'elle juge la ligne
   avant et la ligne après, chacune valide de son côté (`CONVENTIONS.md` §17.6). Le remède
   tient en une ligne — `select f_poser_portee_figee();` — et c'est la **troisième fois**
   qu'un installateur appelable rattrape un lot qu'il n'a pas vu naître, après
   `f_poser_tracabilite_insertion()` et `f_poser_declencheurs_pieces()`. *L'oubli est
   bruyant, et c'est ce qu'on veut* (§40.4).
2. **Le filet des modules a refusé l'écran.** Sa première rédaction dessinait la liste des
   études depuis `GET /api/ebios/etat`, par analogie avec l'écran des campagnes —
   **analogie fausse** : une campagne n'existe que par son état dérivé, une étude est une
   entité ordinaire tenue en mémoire. Conséquences : une étude créée n'apparaissait qu'au
   rechargement suivant, et l'identifiant rendu dans le balisage n'était plus celui que
   `recalerBalisage()` recale après que le serveur les a réattribués — *la convention du
   `CLAUDE.md` §3 n'avait plus rien sur quoi mordre*. La liste vient désormais de la
   mémoire ; seuls les **comptes** viennent du serveur, et tant qu'ils ne sont pas revenus
   la colonne affiche « — » plutôt qu'un zéro, qui serait une affirmation fausse.

#### Et un piège de banc, dans mon propre jeu d'essai

L'aide de semis écrivait `champs.ressources ?? 3`. Or **`null ?? 3` vaut 3** : le couple
« incomplet » qui devait éprouver le *« pas d'estimation par défaut »* arrivait **complet**
en base, et l'essai mesurait autre chose que ce qu'il annonçait. Il a rougi — pour la bonne
raison, cette fois — et l'aide distingue désormais « absent du jeu d'essai » de
« volontairement nul ». *Un essai qui ne fait pas décider la règle ne la couvre pas*
(constat Q-210).

### « Les docs sont à jour ? » — la troisième fois, et le garde-fou ne voyait pas le gras (18/09/2026)

**Le contrôle mécanique rendait 89/89.** La prose portait **cinq manques**, dont deux que la
journée venait de créer — et le plus gros datait de **dix jours**.

⚠️ **LA TABLE DES LOTS DU `README` DÉCRIVAIT L'ÉTAT DU 08/09**, trois vagues en arrière :
*« L19 → L26 ⬜ planifiés »* alors que **L19 est entier**, **L20 livré sauf 20.2**, **L21 et
L24 livrés**. Et L17 « non commencé », L18 bis « après les portes ».

**Pourquoi le garde-fou ne l'a pas vu — deux raisons, et les deux sont fermées :**

1. **sa liste de preuves s'arrêtait à L6.** Il surveillait six lots sur vingt-huit, et
   rendait donc vert sur tout ce qui a été livré depuis. Elle en suit **treize** désormais,
   chacun avec son livrable — une migration, un module — comme preuve ;
2. ⚠️ **et son motif ne reconnaissait pas la forme EN GRAS.** Le `README` écrit
   `| **L19 → L26** | ⬜ planifiés`, avec les deux astérisques de fermeture entre le numéro
   et le carré ; le motif exigeait au plus une barre et des espaces. *Un contrôle qui ne
   reconnaît qu'UNE écriture de ce qu'il cherche ne garde pas la propriété, il garde une mise
   en forme.* Les deux formes sont maintenant éprouvées, la seconde par un cas témoin.

**Les quatre autres manques :**

- **le guide utilisateur annonçait neuf profils et n'en décrivait que huit** — c'est moi qui
  ai créé l'écart cet après-midi en corrigeant l'introduction sans écrire la section. Le
  **répondant de campagne** a la sienne, avec ce qu'il voit, ce qu'il fait, et ⚠️ **ce qu'il
  ne voit pas** : les parts des autres filiales, ni même leur nombre ;
- **les trois écrans de L21 et L24 n'étaient décrits nulle part** pour un utilisateur :
  registre DORA, questionnaires de sécurité, campagnes du Groupe. Ils entrent au tableau du
  RSSI, et l'échéancier y annonce ses **neuf** sources au lieu de deux ;
- **`docs/PLAN_ACHEVEMENT.md`** ne marquait pas la vague C close ; **`docs/PLAN_INTERFACE.md`**
  ignorait les deux onglets neufs ;
- ⚠️ **et le `GUIDE_EXPLOITATION` annonçait 329 colonnes décidées quand le registre en compte
  385.** C'est **mot pour mot la faute du constat Q-331** — *« la correction avait porté sur
  les documents que l'équipe relit, pas sur celui que l'exploitant lit »* —, refaite trois
  jours après. Elle est désormais **gardée** : un contrôle confronte le nombre du guide au
  catalogue à chaque banc, comme ceux du §8 le sont.

⚠️ **ET LE GARDE-FOU DES ÉCRANS CITÉS A ATTRAPÉ MA PROPRE PROSE, DEUX FOIS.** Ma première
rédaction envoyait le lecteur vers « Prestataires → Questionnaires », puis vers
« Prestataires, sur la fiche d'un tiers » — deux destinations qui n'existent sous aucun
libellé : le questionnaire est un **bloc de la fiche**, pas un écran. C'est la classe des
constats **Q-265 / Q-266**, deux bloquants de la porte S7, et elle se rouvre à chaque phrase
qu'on écrit. *Le contrôle a fait en deux secondes ce qu'un relecteur n'aurait pas fait.*

### Sans déconvocation, une campagne convoquée était INDESTRUCTIBLE (18/09/2026)

**Sixième défaut en cinq jours trouvé au navigateur sur la recette**, et le plus profond des
six : il ne vivait dans aucune couche, mais dans la rencontre de trois décisions justes.

1. La clé `fk_campagne_filiales_campagne` est en **`restrict`** — le §18.2 refuse qu'une
   suppression de niveau Groupe détruise la donnée des filiales. **Juste.**
2. La couche d'entités ne sert à une session **que les lignes de sa filiale active** — c'est
   le cloisonnement du chargement initial. **Juste.**
3. L'écran des campagnes savait **convoquer**. Il ne savait pas **déconvoquer**.

**Conséquence, mesurée** : supprimer une campagne rendait **trois `409` « l'enregistrement
est encore référencé ailleurs »**, et la campagne restait en base alors que l'écran l'avait
retirée. La part qui bloquait appartenait à *Dedienne Aerospace Deutschland* — une filiale
que la session ne charge pas —, si bien qu'aucun écran ne pouvait la nommer. *Le message du
refus disait la vérité sans dire QUI tenait encore une part.*

⚠️ **ET MON PREMIER CORRECTIF ÉTAIT FAUX, CE QUI VAUT D'ÊTRE ÉCRIT.** J'ai cru à un défaut
d'ordre et ajouté `suppressions.reverse()` dans `calculerDifferentiel()` — sans voir que
`appliquer()` inversait **déjà** les suppressions vingt lignes plus loin. Les deux
inversions se sont annulées, remettant l'ordre fautif : mon correctif **introduisait** le
défaut qu'il prétendait fermer. Retiré. *On ne corrige pas un ordre sans avoir lu les deux
endroits qui l'établissent.*

**Ce qui ferme vraiment le sujet** : `POST /api/campagnes/:id/deconvoquer`, symétrique de
`convoquer` — mêmes trois barrières, même refus indistinguable de « n'existe pas » —, et un
bouton **« Déconvoquer »** par part, offert à l'administration Groupe. ⚠️ La réponse de
`/api/campagnes/etat` porte désormais l'**identifiant de filiale** de chaque part : sans lui,
l'écran ne pourrait nommer que ce qu'il charge, c'est-à-dire la seule filiale active. Le
motif est écrit dans la route, parce que la règle générale dit l'inverse.

⚠️ **Et ce que déconvoquer NE détruit pas** : le travail. L'avancement vit dans
`evaluations`, que la part ne porte pas — un essai le mesure plutôt que de le promettre.

**Deux essais neufs, et le second a demandé trois rédactions :**

- `test/campagnes/` couvre la déconvocation, son idempotence, son droit et son oracle ;
- `test/navigateur/campagnes.test.mjs` §3 bis joue le **cycle de vie complet** — déconvoquer
  par le bouton, puis supprimer — et vérifie **dans la base**, pas en mémoire.
  ⚠️ Sa première rédaction ne regardait que l'état final : elle passait **aussi** sans le
  correctif, parce qu'un repassage finit par réussir. Elle écoute désormais ce que le
  navigateur **reçoit** et exige **zéro 409** : la mutation qui retire l'inversion de
  `appliquer()` la fait rougir, ce qui veut dire qu'elle garde enfin une propriété que
  personne ne mesurait.

**Le nettoyage de la recette a été fait PAR LE PRODUIT** — déconvoquer, puis supprimer, sans
un refus. C'est la meilleure preuve que la capacité existe : elle a servi.

### Le bloc de création était invisible pour le seul compte qui en a le droit (18/09/2026)

**Cinquième défaut en cinq jours trouvé AU NAVIGATEUR SUR LA RECETTE**, et celui-ci est le
plus net de la série. L'écran des campagnes décidait d'afficher son bloc « Ouvrir une
campagne » en lisant `Session.perimetre` — **qui n'existe pas**. La forme juste est
`Session.courante()`, celle qu'emploient `socle.js` et `mapping.js` depuis des semaines.

Conséquence mesurée en se connectant comme `admin.grc` : **le bloc de création n'apparaissait
pas pour le seul compte qui en a le droit.** L'écran s'affichait parfaitement, la console ne
disait rien, et la capacité était injoignable. *Une capacité qu'aucun écran n'appelle est une
capacité absente* — `docs/REPRISE.md` §4, cinquième occurrence.

⚠️ **L'ESSAI QUI LE FERME A DEMANDÉ TROIS TENTATIVES, ET LES DEUX ÉCHECS SONT LA LEÇON :**

| Tentative | Pourquoi elle ne mesurait rien |
|---|---|
| remplacer `Session.courante` **dans la page** | mesure la branche, pas le produit |
| basculer `API_ADMINISTRATION_GROUPE_PROVISOIRE` puis **recharger** | ⚠️ **essayé et mesuré FAUX** : le résolveur provisoire met son périmètre en cache **soixante secondes**, si bien que la seconde mesure rendait la première. L'essai aurait mesuré deux fois le même cas en croyant en mesurer deux |
| **deux montages, deux résolveurs** | ✅ chacun dit ce qu'il est, et le cache de l'un n'atteint pas l'autre |

Et **les deux moitiés sont nécessaires** : sans la positive, l'essai consacrerait l'absence
du bloc comme une propriété désirable — le défaut même qu'il vient de trouver ; sans la
négative, il serait vrai d'un écran qui proposerait la création à tout le monde. La mutation
le prouve : remettre `Session.perimetre` fait rougir cet essai, et lui seul.

⚠️ **ET LE GARDE-FOU AMÉLIORÉ CE MATIN M'A RATTRAPÉ SUR LA MÊME FAUTE.** En réancrant les
chiffres, j'ai rallongé les deux premières lignes du tableau d'environnement du §8 — et les
cinq contrôles d'environnement ont rougi. Cette fois, le message disait la vraie cause :
*« la ligne existe encore, mais elle est REPOUSSÉE hors de la fenêtre de 2 000 caractères ;
raccourcissez-les, le récit va au CHANGELOG. »* Il a fallu dix minutes ce matin pour
comprendre, dix secondes cet après-midi. *Un contrôle qui nomme la cause fait gagner le temps
qu'un contrôle qui accuse à tort fait perdre.*

### L24 — les campagnes descendantes : le Groupe demande, la filiale répond (18/09/2026)

**Vague C, second lot — et la vague est close.** Migrations `044` et `045`. Le motif était écrit au `PLAN_PRODUIT` :
*« le socle Groupe/Filiale est le meilleur atout architectural du produit, et rien ne permet
au Groupe de lancer quoi que ce soit vers ses filiales. La consolidation regarde ; elle ne
demande pas. »* Migration `044`, schéma `data` en **v21**.

| Action | Ce qui la porte |
|---|---|
| **24.1** campagne d'évaluation | Le Groupe ouvre une campagne sur un référentiel, vers N filiales, avec échéance. ⚠️ **Une filiale ne voit QUE sa part** — ni celle de la voisine, ni leur nombre : la liste des convoquées est une information de Groupe |
| **24.2** suivi d'avancement consolidé | Par filiale, par répondant. L'avancement se **COMPTE** dans `evaluations` sur le référentiel demandé, à l'instant où on regarde |
| **24.3** relances | **L12 réutilisé, pas réécrit** : l'échéance d'une campagne devient la **9ᵉ source** de l'échéancier, et la tâche de relance l'y trouve comme les huit autres. **Aucune route d'envoi neuve** |
| **24.4** accès contributeur restreint | **Migration `045`** : un neuvième profil de socle, « répondant de campagne », **trois domaines ouverts et vingt-sept fermés NOMMÉMENT**. ⚠️ Il existe parce que la mesure a démenti l'hypothèse : le contributeur porte quatre domaines — `actifs`, `actions`, `incidents`, `mco` — et **aucun** ne se projette sur `conformite`. Un contributeur ne pouvait donc pas répondre à la campagne qu'on lui adresse, et élargir `CONTRIB` aurait accordé la conformité entière à tous les contributeurs de toutes les filiales |

⚠️ **ET 24.4 A FAILLI ÊTRE ANNONCÉE SANS ÊTRE FAITE.** La première rédaction de cette
entrée écrivait *« le modèle à trois axes suffit : les deux entités relèvent du domaine
conformite »* — ce qui décrit un **rangement**, pas un accès restreint. Ranger le domaine ne
crée aucun profil, et le critère de l'action dit « c'est un PROFIL ». La mesure a tranché :
`CONTRIB` porte `actifs, actions, incidents, mco`, et la table de projection
(`src/droits/passerelle-api.ts`) n'envoie **aucun** de ces quatre sur `conformite`. Un
contributeur ne pouvait pas répondre. **La migration `045` existe pour cela**, et le socle
des profils passe de huit à neuf — ce qui a fait rougir le garde-fou qui les épingle, comme
il devait.

⚠️ **DEUX TABLES, DEUX RÉGIMES, ET LA FRONTIÈRE EST CELLE DU SENS.** `campagnes` ne porte
**aucun `filiale_id`** : l'intitulé, le référentiel et l'échéance sont les mêmes vus de
Toulouse et vus de Hambourg. `campagne_filiales` porte la part — qui répond, où elle en est —
et reste cloisonnée. L'arbitrage est écrit au `CONVENTIONS.md` **§24.1**, et la table est
déclarée aux **deux listes** que ce paragraphe impose.

⚠️ **TROIS GARDE-FOUS ONT REFUSÉ LA MIGRATION, ET C'ÉTAIT LEUR OFFICE.** Le §24 l'annonce en
toutes lettres — *« une migration qui ajoute une table sans `filiale_id` casse ces deux
contrôles, et c'est NORMAL »*. Ils ont dit, mot pour mot : « toutes les filiales se lisent
entre elles », « une filiale peut écrire chez une autre », « rien ne dit QUI l'écrit ». Les
trois questions sont justes ; les réponses sont écrites, et aucune n'est contournée.

⚠️ **ET LE CONTRÔLE C82 A REFUSÉ UNE CLÉ EN `cascade`.** La première rédaction faisait
disparaître les parts avec la campagne — commode, et faux : le §18.2 interdit qu'une clé
d'une table cloisonnée vers une table de niveau Groupe porte `cascade` ou `set null`, parce
que supprimer **une** ligne de Groupe détruirait alors le travail de vingt filiales, dont
celles que l'auteur du geste ne peut pas lire. La clé est en `restrict` : **déconvoquer
d'abord est un geste explicite.**

⚠️ **ET L'INTERDIT QUE J'AI ÉCRIT A DÛ ÊTRE RETIRÉ — c'est la leçon du jour.** « La
déconvocation est un geste de Groupe ; une filiale ne se retire pas elle-même d'une
campagne » : un déclencheur le tenait, avec son message et son SQLSTATE. **Le banc a montré
qu'il rendait la reprise « remplacer » impossible** — `purgerFiliale()` vide les tables
cloisonnées de la filiale active, sans élever de drapeau d'administration, et c'est ainsi
qu'on restaure une sauvegarde. C'est **mot pour mot la classe des trois conflits de la
migration `041`** (l'ajout seul contre un balayage qui supprime), et l'arbitrage est le
même : *la capacité de restaurer une sauvegarde gagne.*

Ce qui protège le Groupe à la place, dit sans enjolivure : le **journal** (une suppression
est tracée, inaltérable, trois ans), la **reconvocation** qui coûte un geste, et le fait que
l'avancement vit dans `evaluations` — retirer sa part n'efface **aucune réponse**. Reste vrai
et écrit : *une filiale peut se retirer d'une campagne, et le Groupe ne le verra qu'au
journal.* Le garde-fou `f_verifier_campagnes()` garde désormais **l'inverse de ce qu'on
croirait** : que la suppression reste ouverte à la filiale.

**Six mutations jouées, six morsures**, et elles ne mordent pas au même endroit :

| Mutation | Ce qui rougit |
|---|---|
| `pol_campagne_filiales_lecture` ramenée à `using (true)` | **la migration ne s'applique plus** : `f_verifier_couverture_rls()` refuse une lecture non cloisonnée. La famille entière s'arrête à l'ouverture de sa base — un refus plus net qu'un échec |
| « close » cesse d'être la première branche de l'état | le garde-fou de la `044`, qui **éprouve** les deux dérivations sur neuf cas témoins |
| la **route** inverse l'ordre des arguments de `f_etat_part_campagne()` | **un** essai, et un seul — la base reste juste, le schéma vert : c'est la leçon du constat **Q-325** |
| le compte d'avancement cesse d'exclure les évaluations VIDES | un essai : une exigence ouverte n'est pas une exigence répondue |
| l'échéancier cesse d'exclure les **brouillons** du Groupe | l'essai navigateur : un brouillon ne demande rien à personne |
| l'écran cesse de **diviser** | l'essai navigateur : le serveur rend un compte, l'écran rend un taux, et c'est l'écran qui a le catalogue |

### Le navigateur trouve ce que le banc ne voit pas — la cascade des tiers (18/09/2026)

**Parcours joué à la main sur la recette**, connecté comme `admin.grc` : créer un tiers,
saisir ses trois dates contractuelles, préparer un questionnaire, consigner son envoi,
regarder l'échéancier, supprimer le tiers. Tout tenait — sauf la dernière étape.

⚠️ **Après suppression du tiers, l'échéancier annonçait encore l'échéance de son
questionnaire**, et le badge de la barre latérale la comptait. Les trois tables de L21
pendent au prestataire par une clé `on delete cascade` : la base les emporte — un essai le
mesure —, mais `DataStore.deletePrestataire()` ne retirait que le prestataire. *Le défaut ne
vivait ni dans la base, ni dans la route : il vivait dans l'écart entre les deux cascades.*
Classe **Q-201 / Q-207**, et **quatrième fois en trois jours** que la vérification au
navigateur trouve ce que deux mille essais ne voient pas.

Ce qui a été vérifié dans le même parcours, et qui tient : les trois dates contractuelles
arrivent à l'échéancier avec les bons décomptes (**+25 j, +4 j, −6 j**) ; `evalue_le`
(−120 j) **n'en produit aucune** ; un questionnaire créé est **Brouillon** et n'entre pas,
puis passe **En retard** dès que l'envoi est consigné ; les boutons de filtre de
l'échéancier **apparaissent d'eux-mêmes** ; et zéro erreur de console ou de page.

⚠️ **Et deux textes étaient devenus faux le matin même** : la note pédagogique de
l'échéancier énumérait **six** sources, le `GUIDE_UTILISATEUR` décrivait l'échéancier sans
les questionnaires ni les contrats. *Une passe de documentation se fait en cherchant ce que
le correctif du jour a rendu faux, pas en relisant ce qu'on vient d'écrire.*

⚠️ **UN PIÈGE PAYÉ SUR SON PROPRE AVERTISSEMENT, ET C'EST LE PLUS INSTRUCTIF.** Le §8 du
`README` prévient, en toutes lettres, que le contrôle d'environnement **borne sa lecture à
une fenêtre courte** sous « Révision mesurée », et qu'allonger les lignes du haut repousse
« Base » et « Node » hors de sa portée. En réancrant les chiffres, j'ai rallongé ces deux
lignes — et les **cinq** contrôles d'environnement ont rougi. Deux corrections, pas une :

- le bloc de mesure redevient **terse** (le récit vit ici, pas là-bas) ;
- **le message du garde-fou nommait mal la cause** : il annonçait *« la ligne Base a
  disparu »* alors qu'elle était seulement repoussée. Il distingue désormais les deux cas et
  dit lequel s'applique. *Un contrôle qui nomme mal la cause fait chercher au mauvais
  endroit* — celui-là venait d'y envoyer sa propre session.

### L21 — le registre DORA, la chaîne de sous-traitance et le questionnaire fournisseur (17–18/09/2026)

**Vague C, premier lot.** C'était le domaine le plus faible du produit — *une fonctionnalité
sur six* au `docs/COMPARATIF_MARCHE.md` — et le besoin le plus tendu du marché français :
DORA s'applique depuis le 17 janvier 2025, et le **registre d'information** est la pièce que
l'autorité réclame en premier. Quatre actions sur quatre, deux migrations.

| Action | Migration | Ce qui la porte |
|---|---|---|
| **21.1** registre d'information DORA | `042` | LEI, pays, fonction supportée et son caractère critique, contrat, substituabilité — et la **chaîne de sous-traitance** comme une **arête**, jamais comme un rang stocké : le rang se **dérive**, l'anti-cycle est **en base** (critère d'acceptation), et la route rend le **chemin** et non un rang à croire |
| **21.2** questionnaire fournisseur | `043` | l'**envoi** et les **réponses**, sans le texte des questions : `(ref_id, code)` fait la jointure avec les catalogues, comme `evaluations` depuis le premier chantier. Le produit **n'envoie rien** — `envoye_le` est un fait consigné, pas un ordre ; le questionnaire s'exporte en XLSX, se remplit hors ligne, se réimporte |
| **21.3** suivi contractuel et plan de sortie | `042` | fin de contrat, revue des clauses, réversibilité, plan de sortie daté — **et ils alimentent l'échéancier existant**, ce qui est le critère d'acceptation lui-même |
| **21.4** score de risque fournisseur | `042` | composite et **dérivé** : criticité × accès × substituabilité × ancienneté de la dernière évaluation. Le **barème est SERVI** (`GET /api/tiers/bareme`), il n'est plus recopié dans le navigateur |

⚠️ **CE QUE LE 18/09 A AJOUTÉ, ET POURQUOI C'ÉTAIT LE PLUS UTILE DE LA JOURNÉE.** La `043`
avait été livrée avec ses tables, son état dérivé, ses politiques et son garde-fou — et
**mordue par rien**. Les balayages génériques la voyaient comme *une table de plus* : ils
vérifiaient qu'elle est cloisonnée, qu'elle entre dans le modèle, que ses pièces suivent leur
porteur. Aucun ne mesurait ce qu'elle **promet**. C'est la classe du constat **Q-69** —
*« écrit, lu, et mordu par rien »*.

`test/tiers/questionnaire-fournisseur.test.mjs` (23 essais) la mord en huit points, et
**cinq mutations ont été jouées pour le démontrer** :

| Mutation | Ce qui rougit |
|---|---|
| « reçu » cesse d'être la **première** branche de `f_etat_questionnaire()` | le garde-fou de la `043` refuse la migration — il **éprouve** la dérivation sur dix cas témoins, il ne lit pas son texte (§39.1) |
| la règle « on ne relance pas ce qu'on n'a pas envoyé » devient `check (true)` | deux essais |
| `reponse in (…) **or true**` — la forme exacte du 8ᵉ passage de la porte S8 | un essai. ⚠️ **Et aucun garde-fou ne la voit** : les `check` de la `043` ne sont pas au registre des contraintes éprouvées de la migration `029`. L'essai est le seul filet, et c'est consigné plutôt que tu |
| l'unicité qui rend le réimport idempotent s'élargit d'une colonne | un essai |
| la **route** passe les dates dans le mauvais ordre, la base restant juste | un essai — et **rien d'autre**. C'est la leçon du constat **Q-325** : un garde en base ne voit pas une faute de route |

⚠️ **ET LE CRITÈRE DE 21.3 N'ÉTAIT PAS TENU : l'échéancier ne connaissait ni les contrats,
ni les questionnaires.** La migration `043` l'écrivait pourtant dans le commentaire de sa
propre colonne `echeance` — *« elle alimente l'échéancier existant »* —, et ce n'était vrai
nulle part. Deux sources sont donc ajoutées à `js/services/echeances.js`, **et les deux
exclusions portent tout le sens** : un questionnaire **reçu** n'est plus une obligation (même
reçu en retard — relancer qui a déjà répondu est le plus sûr moyen de faire ignorer les
relances), et un **brouillon** n'en est pas encore une. `evalue_le`, lui, **n'y entre pas** :
c'est la date de la dernière évaluation, un fait passé, et la ranger là inverserait son sens.

⚠️ **Trois conséquences que le banc a trouvées, et pas moi :**

1. **Le garde-fou des notifications a rougi aussitôt.** `test/notifications/echeances.test.mjs`
   **découvre** les sources dans `js/services/echeances.js` et exige que le serveur les
   connaisse : deux sources de plus à l'écran et le courriel de relance ne les aurait pas
   comptées. Les huit sources sont désormais des deux côtés — *c'est exactement ce qu'un
   garde-fou découvert, plutôt que recopié, existe pour faire.*
2. **Aucune de ces échéances n'a de destinataire résoluble, et c'est une décision.**
   `prestataires.email` est l'adresse du **fournisseur** : s'en servir enverrait le bilan
   interne du groupe à l'extérieur. Elles sont donc comptées dans `sansDestinataire`, comme
   les déclarations d'incident — *comptées à part plutôt que tues.*
3. **La liste des types de l'échéancier était écrite à la main**, et deux sources de plus
   l'auraient laissée incomplète **sans rien faire échouer** : les lignes s'affichaient, mais
   aucun bouton ne permettait de les isoler. Les types se **découvrent** désormais dans ce que
   l'agrégateur rend (règle du `CLAUDE.md` §3, colonne « réussit en silence »).

**Reste de la vague C** : **L24**, les campagnes descendantes — le Groupe ouvre une campagne
d'évaluation vers N filiales et en suit l'avancement. Et à la clôture de la vague,
`docs/COMPARATIF_MARCHE.md` se rejoue **en entier** : le rejeu du 16/09 était partiel, onze
lignes sur quatre-vingt-six.

### « Les docs sont à jour ? » — la deuxième fois, et deux chiffres que personne ne gardait (16/09/2026)

**Le contrôle mécanique rendait 87/87.** Il ne couvre pas la prose, et la prose portait
**huit fautes** — dont deux chiffres qu'**aucun garde-fou ne regardait**, et dont l'un avait
été écrit deux heures plus tôt, par moi, sans être mesuré.

| Ce qui était faux | Le réel | Où |
|---|---|---|
| « **331 décisions** au registre » | **329** | `backend/README.md` §8 |
| « publication → **86 fichiers** » | **89** | `backend/README.md` §8, même ligne |
| « **L19 → L26** ⬜ planifiés » | **L19 entier, L20 sauf 20.2** | `CLAUDE.md` §8 |
| « le prochain geste : le **10ᵉ passage de la porte S8** » | les passages sont **arrêtés** depuis le 14/09 | `CLAUDE.md` |
| « 35 garde-fous, 31 migrations, 52 tables, 206 décisions » | 45 · 41 · 61 · 329 | `CLAUDE.md`, bloc « mesuré » |
| « `SCHEMA_VERSION = 12` », 21 entités | **18**, 26 collections | `CLAUDE.md` §4 |
| l'indicateur à « 35 ✅ » | **44 ✅ · 12 🟡 · 30 ❌** | `PLAN_ACHEVEMENT`, `REPRISE`, `PLAN_EXECUTION` |
| « **206 colonnes décidées** » | **329** | `GUIDE_EXPLOITATION.md` |

⚠️ **LA PLUS GRAVE N'EST PAS UN CHIFFRE.** `CLAUDE.md` annonçait *« L19 → L26 : planifiés »*
et *« le prochain geste : le 10ᵉ passage de la porte S8 »*. Un lecteur qui reprend le
chantier sur ce fichier aurait refait 19.1 à 20.5, ou consacré sa journée à une porte que
l'utilisateur a arrêtée le 14/09. **Une phrase périmée coûte plus cher qu'un chiffre
périmé** : le chiffre se vérifie en une commande, la phrase se croit.

⚠️ **ET LE MOTIF DES DEUX CHIFFRES, QUI EST LE CŒUR DE CETTE PASSE.** Le garde
`chiffres-du-schema` couvre sept grandeurs — tables, politiques, migrations, clés,
déclencheurs, contrôles, traçabilité. Il ne couvrait **ni le registre de l'article 30, ni le
compte de fichiers publiés**. Ces deux-là vieillissaient donc **au rythme où on les
écrivait**, et c'est la forme la plus discrète du constat **Q-219** : *un chiffre qu'aucun
garde ne regarde n'est pas un chiffre mesuré, c'est un chiffre souvenu.*

Les deux entrent dans le dispositif :

- le **registre de l'article 30** rejoint les sept grandeurs de `chiffres-du-schema` ;
- **`test/documentation/fichiers-publies.test.mjs`** confronte le compte annoncé au dépôt,
  en **lisant la liste des types publiables dans `deploy/install.sh`** — jamais en la
  recopiant : c'est la règle du constat **Q-31**, celle qui fait que la liste blanche de
  l'installateur et le `<FilesMatch>` du vhost vont par paire.

⚠️ **Le second garde a lui-même accusé à tort à sa première rédaction**, et la leçon vaut :
son motif exigeait une espace entre le chiffre et le mot « fichiers », alors que le §8 est
**enrobé à 90 colonnes** et que le saut de ligne tombe précisément là. Il rendait « ce
contrôle n'a plus de sujet » sur un document parfaitement lisible. *Un contrôle qui accuse à
tort finit désarmé* — c'est pour cela qu'il est corrigé et que le motif est écrit dans le
fichier.

ℹ️ **Le guide d'exploitation portait « 206 colonnes décidées » depuis six jours** — dans le
document que l'exploitant lit, et c'est exactement la faute que le constat **Q-331** avait
fermée ailleurs le 14/09. Elle n'a pas été refaite : elle n'avait simplement jamais été
suivie. Le garde neuf la suit désormais.

### La vague B est close — l'indicateur REJOUÉ, pas estimé (16/09/2026)

**Les lots L19 et L20 sont entiers.** Le `docs/PLAN_ACHEVEMENT.md` §4 impose de rejouer
l'indicateur à la clôture d'une vague : *« il se rejoue, il ne s'estime pas »*.

**35 ✅ · 17 🟡 · 34 ❌ au 08/09 → 44 ✅ · 12 🟡 · 30 ❌.** Le chiffre est **recompté sur la
grille**, ligne par ligne, jamais additionné de tête — c'est le constat **Q-219** appliqué
à l'instrument qui sert à mesurer le reste.

Onze lignes ont bougé, et chacune a été **remesurée dans le dépôt** — schéma, routes,
écrans — plutôt que lue dans le journal des livraisons : les dérogations datées et
l'attestation de lecture passent de **absentes** à couvertes ; les contrôles périodiques,
l'efficacité distincte de la maturité, la réutilisation d'une preuve, le lien politique ↔
contrôle, les délais réglementaires, la main courante et l'AIPD passent de **partiels** à
couverts ; la recherche et la palette passent d'absentes à **partielles** — la palette est
là, l'index plein texte non.

⚠️ **Et le rejeu n'est PAS complet, ce qui fait partie de la mesure.** Seules les lignes
que les vagues A et B pouvaient déplacer ont été remesurées ; les **soixante-quinze autres
gardent leur verdict du 08/09**, et l'une d'elles pourrait avoir bougé sans qu'on le sache.
Un rejeu intégral est dû à la clôture de la vague C. *Un indicateur qui tairait sa propre
incomplétude serait pire qu'un indicateur en retard.*

⚠️ **Une ligne reste PARTIELLE alors qu'elle aurait pu passer, et c'est délibéré** : la
**78 — DSAR, consentements, violations**. Le DSAR est livré, les violations passent par les
incidents et l'horloge 20.1, mais **les consentements sont absents** — ni recueil, ni
preuve, ni retrait tracé. Seul le retrait qui *arrive par une demande* est enregistré. La
ligne le dit, plutôt que de compter une couverture qui n'existe pas.

### 20.5 — la main courante de crise, en ajout seul (16/09/2026)

**Pendant une crise, on note.** Qui a été prévenu, à quelle heure, ce qui a été décidé, ce
qu'on a constaté. Cette main courante est la pièce centrale du retour d'expérience, et
celle qu'un assureur, un client ou l'ANSSI demandent après.

**Migration `041`**, table `main_courante`. Le critère de l'action est **négatif** :
*« ajout seul comme le journal d'audit ; elle réutilise les quatre couches du §12, elle ne
les réinvente pas »*. Une main courante qu'on peut relire à froid et corriger « pour que ce
soit plus clair » est un document rédigé **après** — donc sans valeur probante.

Ce qui est **réutilisé tel quel** : `f_interdit_modification()` (migration `001`), les
quatre couches d'ajout seul, la discipline de chaînage par empreinte, et la règle du §17.8
— *tout ce qui fait la valeur probante d'une trace vient du serveur, jamais de l'appelant*.

Ce qui est **propre, et c'est une décision** : la chaîne est **par incident**. Ce qu'on
produit en fin de crise est la main courante d'UNE crise ; une chaîne globale obligerait, pour
prouver qu'il ne manque rien, à exporter les entrées de toutes les crises de la filiale — y
compris celles qui ne regardent pas le destinataire.

⚠️ **LE BANC A REFUSÉ LA PREMIÈRE RÉDACTION DANS L'HEURE, ET IL AVAIT RAISON.** Elle posait
une clé étrangère composite vers `incidents`, en `restrict` — « supprimer un incident dont
la main courante existe effacerait le récit de la crise ». Juste en soi, et **incompatible
avec le reste** : l'ajout seul interdit de supprimer une entrée, si bien que
`POST /api/reprise` en mode « remplacer » ne pouvait plus purger une filiale ayant connu une
crise. **Restaurer une sauvegarde y devenait impossible, définitivement.** C'est la forme
exacte du constat **Q-284**, où l'irréversibilité d'une décision d'approbation rendait toute
suppression en cascade impossible.

Le §12 portait la réponse depuis le premier jour, point 3 : *« aucune clé étrangère vers la
cible — le journal doit survivre à la suppression de ce qu'il décrit »*. La main courante
**désigne** l'incident, elle ne le référence pas. Le prix est une main courante qui peut
devenir orpheline ; c'est le prix que le journal paie déjà, et c'est le bon. Un garde-fou
refuse désormais qu'une telle clé réapparaisse, **avec le motif écrit dans son message**.

⚠️ **ET UNE SECONDE LEÇON, D'ESSAI CETTE FOIS.** Le §4 de la famille exigeait d'un seul
geste les DEUX anomalies que le §12 distingue — `empreinte_invalide` et `chainage_rompu`. Il
a rougi : retoucher un texte sans toucher à l'empreinte ne rompt aucun chaînage, puisque
l'empreinte stockée de l'entrée précédente n'a pas bougé. **L'essai affirmait une propriété
que le mécanisme ne promet pas**, et la pente naturelle était de « corriger » le mécanisme
pour qu'il la tienne. C'est le geste qu'on ne fait pas. Le §4 joue désormais les **deux
adversaires** : celui qui retouche, et celui qui a lu le schéma et **recalcule l'empreinte**
— trahi, lui, par l'entrée suivante.

⚠️ **ET UNE TROISIÈME FOIS, DANS LA MÊME LIVRAISON.** La table portait une colonne
`provenance`, comme toute table métier depuis la `032`. Or `purgerJeu()` — le jeu de
découverte, L18 bis — balaie **toute table qui en porte une** et y fait un `delete`. Sur une
table en ajout seul, ce `delete` est refusé **même quand il ne toucherait aucune ligne**,
puisque le déclencheur est posé « for each statement » : c'est précisément ce que cette
forme garantit. **La purge du jeu de découverte devenait impossible**, et sa cinquième
condition constitutive tombait.

Deux remèdes, l'un pour l'instance et l'autre pour la classe : la colonne n'est pas là — la
provenance d'une entrée de main courante est dite par sa nature, comme pour le journal
d'audit — et **`purgerJeu()` ne balaie plus que les tables où le rôle applicatif PEUT
supprimer**, mesuré par `has_table_privilege`, jamais par une liste de noms. Une table en
ajout seul créée demain sort du balayage toute seule, au lieu de le casser. Un garde-fou
refuse par ailleurs que `provenance` réapparaisse sur celle-ci, **avec le motif écrit**.

*Trois conflits entre un invariant d'ajout seul et un balayage qui supprime, dans une seule
migration.* Ce n'est pas un défaut de conception : c'est ce que coûte une table qui refuse
d'oublier, dans un produit qui sait purger. Les trois ont été trouvés par le banc, aucun par
relecture.

**Côté écran** : un encart sur la fiche de l'incident, parce qu'une crise EST un incident
escaladé — la détection, les déclarations réglementaires (20.1) et le récit se lisent
ensemble. **Aucun bouton « modifier » ni « supprimer »**, et un essai l'exige : un bouton
qui mènerait à un refus technique apprendrait à l'utilisateur que le produit se contredit.
L'heure ne se saisit pas non plus — elle vient du serveur, ce qui est précisément ce qui
empêche d'antidater une décision.

**Le bandeau « Chaîne intacte » est affiché en permanence**, pas seulement en cas de
problème : un indicateur qui n'apparaît qu'au moment du défaut n'apprend à personne qu'il
existe, et le jour où il parle, personne ne sait s'il est fiable. ⚠️ Et il dit ce qu'il **ne**
prouve pas — l'administrateur de la base peut agir, le chaînage ne l'en empêche pas, il rend
son passage **détectable**.

### 20.4 — la demande d'exercice de droits, et l'horloge d'un mois (16/09/2026)

**Les articles 15 à 22 du RGPD donnent à toute personne un droit d'accès, de rectification,
d'effacement, de limitation, d'opposition et de portabilité. L'article 12 §3 laisse UN MOIS
pour répondre.** Le produit n'en savait rien : une demande reçue par courriel vivait dans
une boîte aux lettres, et le délai dans la tête de quelqu'un.

**Migration `040`**, schéma **v18**, table `demandes_droits` et deux fonctions dérivées :

- `f_echeance_droits()` — un mois (art. 12 §3), trois mois quand la prorogation de deux mois
  a été notifiée. **Le mécanisme de 20.1, repris et non réinventé** : l'échéance ne se
  stocke pas, elle se calcule à partir de son origine, à un seul endroit, **avec sa
  référence au texte** ;
- `f_etat_demande_droits()` — quatre états. Le troisième porte l'action : une demande dont
  le mois est écoulé passe **« en retard » toute seule**, au changement de jour.

⚠️ **TROIS RÈGLES DU TEXTE SONT POSÉES DANS LE SCHÉMA, pas laissées à la vigilance :**

| Ce que la base refuse | Pourquoi |
|---|---|
| un **refus** sans motif **ni date** | l'article 12 §4 impose d'informer la personne *dans le même délai*, avec les voies de recours. Une fin de non-recevoir silencieuse est ce que le texte proscrit |
| une **prorogation** non notifiée ou non motivée | l'article 12 §3 second alinéa exige les deux. Une prorogation qu'on s'accorde après coup fabrique un délai qu'on croit avoir et qu'on n'a pas |
| une demande **« répondue »** sans date | la preuve du respect du délai disparaîtrait avec elle |

⚠️ **Ce que le produit NE FAIT PAS.** Il ne répond pas à la personne, n'extrait pas ses
données et ne juge pas si la demande est fondée. Il **tient le registre** et **arme
l'horloge**. Toute autre lecture serait une prise de responsabilité qu'un logiciel ne peut
pas porter — c'est l'arbitrage rendu en 20.2 pour les notifications aux autorités.

⚠️ **ET UNE DIFFICULTÉ PROPRE À CETTE TABLE : elle contient les données personnelles d'une
personne qui n'est PAS un utilisateur.** Le registre de l'article 30 du produit lui-même les
range, et **les deux colonnes n'ont pas le même sort** : le **nom se conserve** — l'anonymiser
détruirait la preuve d'avoir répondu à quelqu'un, c'est-à-dire la seule pièce qui protège le
responsable de traitement — et le **contact s'anonymise**, le canal ne servant plus la
finalité une fois la réponse faite et le délai de réclamation écoulé.

**Côté écran** : un quatrième onglet du registre RGPD (`/rgpd-demandes`). Le retard s'y dit
**en jours** — « en retard de douze jours » se défend devant une autorité, « bientôt » ne se
défend pas — et la date de réception est modifiable, parce que c'est la date d'**arrivée**
et non celle de la saisie.

⚠️ **Un défaut latent trouvé en chemin, et il touchait un lot livré la veille.** Le pilote
`pg` rend un objet `Date` pour une colonne `date` : `String(unDate)` donnait
« Sun Feb 15 2026 00:00:00 GMT+0000 (…) » sur le fil — une chaîne dépendante de la locale,
du fuseau et de la version de Node. `GET /api/derogations/etat` la servait ainsi depuis
19.2, sur la valeur qui dit **jusqu'à quand un écart de conformité est couvert**. Notre
propre écran la reparsait sans broncher ; un export, un tableur ou un autre outil ne
l'auraient pas fait. Les dates sortent désormais en **ISO `AAAA-MM-JJ`**, castées par la
BASE, et l'essai des dérogations le garde.

### L'écran affichait « aucune analyse » juste après en avoir créé une (16/09/2026)

**Trouvé sur la recette, en vérifiant 20.3 dans un vrai navigateur.** Le banc était vert —
2 048 essais —, et le produit déployé affichait, à travers Apache et TLS, l'inverse de ce
qui venait de se passer.

La cause tient en deux phrases. Les panneaux dont l'état vient du **serveur** — les
dérogations (19.2), les analyses d'impact (20.3) — le relisent après chaque écriture, et
ils ont raison : l'état s'y **dérive**, et le recomposer depuis `data` afficherait une
ligne sans état. Mais `DataStore.addX()` n'écrit qu'**en mémoire** ; la poussée vers le
serveur est asynchrone, et relire tout de suite interroge un serveur qui n'a encore rien
reçu.

⚠️ **Le banc ne pouvait pas le voir, et ce n'est pas un oubli d'essai** : il monte le
serveur dans le même processus, où la poussée aboutit dans la même milliseconde. La course
n'a pas le temps de se produire. C'est la classe du constat **Q-325** prise par l'autre
bout — *l'essai prouve que le mécanisme fonctionne ; personne ne mesure ce que
l'utilisateur reçoit* — et c'est la deuxième fois en deux jours qu'une vérification au
navigateur sur l'instance déployée trouve ce que 2 000 essais ne voyaient pas.

⚠️ **Et le défaut n'était pas dans le lot du jour** : `derogations.js`, livré la veille,
l'avait à l'identique. Fermé à la CLASSE :

- **`UI.apresEcriture()`** attend `Sync.pousser()` puis rappelle. Un échec de poussée ne
  bloque PAS le rappel : c'est le bandeau de `sync.js` qui porte l'incident, et un écran
  figé par-dessus n'ajouterait qu'une seconde panne ;
- **`test/depot/relecture-apres-ecriture.test.mjs`** — tout module qui écrit par
  `DataStore` *et* **appelle** `Api` doit y passer. La découverte est mécanique ; la
  dispense est écrite à la main **avec son motif**, et se fige aux deux bouts — une
  dispense qui ne correspond plus à aucun module rougit, faute de quoi elle excuserait le
  prochain sans que personne ait rien décidé ;
- **le §6** de l'essai navigateur mesure l'**ORDRE**, pas un délai : il tient la poussée à
  la main et compte les lectures. Un essai qui courserait une horloge se figerait un matin
  sur une machine chargée — et il se figerait **au vert** (leçon Q-251).

⚠️ **`Api.` APPELÉ, jamais `Api.` LU.** La première rédaction du garde réclamait une
attente à `preuves.js`, qui ne référence qu'une **constante** (`Api.CONTRAT_AUTH.niveaux`)
et n'émet rien. La pente naturelle aurait été de l'ajouter aux dispenses — c'est-à-dire
d'user la liste jusqu'à ce qu'elle ne dise plus rien. Le discriminant est une **forme**,
pas un nom : une parenthèse derrière le membre.

⚠️ **Et l'essai a d'abord passé POUR LA MAUVAISE RAISON.** Son compteur cherchait
`/api/aipd/etat` alors que `js/core/api.js` construit ses adresses en **relatif**
(`api/aipd/etat`) : il ne comptait rien, et l'assertion « aucune lecture n'est partie »
était vraie par vacuité. Trois mutations jouées ensuite, trois morsures.

### 20.3 — l'analyse d'impact POINTE le registre, elle ne le recopie pas (16/09/2026)

**L'article 35 du RGPD impose une analyse d'impact dès qu'un traitement est susceptible
d'engendrer un risque élevé.** Le produit tenait le registre de l'article 30 depuis le lot
RGPD ; il ne savait rien dire de l'article 35 — ni qu'une AIPD est due, ni où elle en est,
ni quand la revoir.

**Migration `039`**, schéma **v17**, deux tables et deux fonctions dérivées :

- `analyses_impact` — MIXTE comme `traitements`, avec la barrière de portée N-10 (une AIPD
  locale analyse un traitement du Groupe ; l'inverse est fermé) ;
- `analyse_mesures` — les contrôles du pivot que l'analyse **prévoit**. ⚠️ Distincte de
  `traitement_mesures`, et délibérément : celle-ci dit ce qui est PRÉVU, l'autre ce qui
  protège le traitement AUJOURD'HUI. Les confondre effacerait l'écart entre le prévu et le
  fait — ce qu'un contrôle vient précisément mesurer ;
- `f_etat_aipd()` — cinq états, **dérivés**. Le quatrième porte l'action : une analyse
  **validée** dont la date de revue est passée redevient « à revoir » **toute seule**,
  sans qu'aucun traitement ait à repasser. Même arbitrage qu'aux dérogations (19.2) ;
- `f_aipd_presumee_requise()` — une **présomption**, et le mot est dans le nom.

⚠️ **LE CRITÈRE D'ACCEPTATION EST NÉGATIF, et c'est lui qui a piloté la conception** :
*« le registre art. 30 n'est pas dupliqué : l'AIPD POINTE le traitement. »* `traitement_id`
est donc `not null` — une AIPD sans son traitement n'est pas une AIPD, c'est le doublon
qu'on refuse —, et **aucune** colonne de `traitements` n'a de jumelle dans
`analyses_impact`. Un essai le mesure **dans le catalogue** plutôt que de le relire : il
compare les deux listes de colonnes et n'en admet aucune en commun hors traçabilité.

⚠️ **CE QUE LE PRODUIT REFUSE DE FAIRE, et le dire est la moitié du travail.** Il ne décide
pas qu'une AIPD est requise. Les trois cas de l'article 35 §3 — profilage systématique,
catégories particulières à grande échelle, surveillance systématique d'un lieu public — ne
sont pas tous représentables avec ce que le registre porte. Le produit rend donc une
présomption sur le seul critère qu'il sait mesurer, l'écran écrit le mot, et **la liste
n'est pas filtrée** : un traitement non présumé requis reste affiché. Un logiciel qui
trancherait « AIPD non requise » sur une donnée qu'il ne détient pas rendrait un service
pire que rien.

**`GET /api/aipd/etat` rend DEUX listes, et la seconde est celle qui compte** : les
analyses avec leur état dérivé, **et les traitements qui n'en ont aucune**. Un registre des
AIPD qui ne montrerait que les analyses faites serait un registre rassurant ; la question
d'un contrôle CNIL est l'inverse.

**Côté écran** — un encart sur la fiche du traitement, et un **onglet** du registre RGPD
(`/rgpd-aipd`), pas une entrée de menu : c'est une vue du sujet, et l'ajouter au menu
rendrait à celui-ci ce qu'on venait de lui retirer.

⚠️ **Et l'essai navigateur a fait apparaître une nuance d'écran que personne n'avait vue.**
Sur une analyse à revoir, le sélecteur du formulaire affiche « Validée » — c'est la
DÉCISION enregistrée, et elle ne s'efface pas — pendant que le badge affiche « À revoir » —
c'est l'ÉTAT dérivé. Les deux sont justes ; côte à côte et sans un mot, ils apprennent au
lecteur que l'un des deux ment. L'écran **réconcilie** désormais les deux en une phrase,
et l'essai l'exige. Classe des constats **Q-201 / Q-207**.

**Deux défauts trouvés par des essais existants, aucun par relecture :**

1. **Renommer une contrainte casse la mutation qui l'éprouve.** La première rédaction du
   §1 recréait `type_entite_check` sous le nom `ck_type_entite` ; le contrôle de morsure de
   `gardes-eprouves.test.mjs` — qui **vide** le domaine pour vérifier que le garde le voit —
   ne la trouvait plus, et la mutation ne mutait plus rien. *Un essai qui ne peut plus
   casser ce qu'il éprouve passe au vert sans rien mesurer* (motif **Q-210**).
2. **Un essai de migration-sur-données ne doit PAS employer le semis partagé.** Celui-ci
   écrit dans toutes les tables du schéma, y compris celles qu'une migration postérieure
   n'a pas encore créées : `migrations-sur-donnees.test.mjs`, écrit le matin même, a rougi
   à l'arrivée de la `039` pour cette raison — et pas pour celle qu'il mesure. Son semis
   est désormais **minimal**, et le fichier dit pourquoi.

### Le banc migre des bases VIDES — et c'est le déploiement qui l'a dit (16/09/2026)

**Un déploiement refusé sur la recette, après un banc de 2 031 essais entièrement vert.**
C'est la démonstration la plus nette qu'ait produite ce chantier de *« un banc vert mesure
ce qu'il regarde, jamais ce qu'il ne regarde pas »*.

La migration `038` porte un §2 de **reprise** — un rattachement par pièce déjà déposée. Son
§0 posait le périmètre de lecture par `set_config('grc.filiales_lecture', …)`, **un réglage
qui n'existe pas** : le nom est `grc.filiales`. `install.sh --maj` a rendu `GRC04` dans la
minute. Et une seconde faute se cachait derrière : la reprise insérait **pour toutes les
filiales d'un seul `insert`**, alors que la politique d'ajout n'admet que la filiale
**active**, et qu'il n'y en a qu'une à la fois.

⚠️ **Le banc ne pouvait voir ni l'une ni l'autre, et ce n'est pas un oubli d'auteur : c'est
une propriété du montage.** `test/aide/base.mjs` applique toutes les migrations sur une base
**vide**, puis sème. Une migration de reprise n'y rencontre donc jamais de données — les
politiques RLS sont évaluées **par le scan**, `add constraint` valide zéro ligne, et une
boucle sur `filiales` ne tourne pas. **Tout le §2 d'une migration de reprise échappait au
banc, et cela valait pour les trente-huit.**

La classe est fermée : `base.migrer()` applique les migrations **restantes** sur une base
déjà ouverte, et `test/base/migrations-sur-donnees.test.mjs` monte une base **arrêtée à la
`037`**, la sème — donc des pièces dans **deux filiales** —, puis joue la `038` par le vrai
`db/migrate.mjs`. **Les deux fautes d'origine ont été remises une par une : l'essai rougit
trois fois sur quatre à chaque coup.**

La règle vit au `backend/db/CONVENTIONS.md` **§42** : *le périmètre de LECTURE se pose pour
le groupe entier ; le périmètre d'ÉCRITURE ne peut PAS l'être — une reprise boucle sur les
filiales, et passe par la même porte que le produit.* Retirer `force row level security` le
temps de la reprise est **refusé** : une migration qui désarme le cloisonnement pour se
simplifier la vie est exactement ce qu'un auditeur cherche.

### 19.4 — une preuve sert plusieurs contrôles, et le fichier ne part qu'au dernier (16/09/2026)

**Le point dur du lot L19, et il l'était pour une raison précise.** Un auditeur ISO 27001
demande la même procédure devant cinq contrôles. Le produit obligeait à la **déposer cinq
fois** : cinq lignes, cinq fichiers, cinq empreintes du même contenu, cinq quotas — et,
le jour où la procédure change, **quatre chances d'en oublier une**.

Or la migration `017` avait fermé les constats **Q-232 / Q-233** en supprimant la pièce
**avec** son porteur, sur tous les chemins de disparition. Réutiliser met cette garantie en
tension avec elle-même : si la pièce suit son porteur et qu'elle en a cinq, le premier
porteur supprimé emporte la preuve des quatre autres. **« Zéro orpheline » ne bouge pas —
c'est la définition d'être orpheline qui change.**

**Migration `038`**, table `piece_rattachements`, et **l'invariant est POSÉ, pas
surveillé** :

- `pieces_jointes.(entite_type, entite_id)` reste **l'adresse de délivrance** — celle de
  l'URL, celle de l'unicité « une seule pièce en vigueur par porteur », celle du relais de
  version du document. La casser aurait touché six mécanismes livrés ;
- `piece_rattachements` porte **l'ensemble des porteurs servis**, et une clé étrangère
  **différée** (`fk_pieces_jointes_adresse`) impose que l'adresse soit toujours l'un
  d'eux — y compris depuis `psql` ;
- deux déclencheurs rendent cet invariant tenable : le rattachement d'origine se pose
  **tout seul** à l'insertion (une route ne voit que son chemin, `CONVENTIONS.md` §8.1), et
  le retrait de celui qui sert d'adresse **réadresse** la pièce vers un survivant — en lui
  retirant son « en vigueur », qui est une propriété du **couple** pièce-porteur ;
- `f_pieces_suivent_leur_porteur()` est réécrite : elle retire les **rattachements** du
  porteur, et ne supprime que les pièces qui n'en ont plus aucun. La ceinture `GRC05` est
  intacte.

**La route `DELETE` détache au lieu de détruire** quand la preuve sert ailleurs, et le
journal l'inscrit **pour ce que c'est** — écrire « suppression » sur un détachement serait
une fausse accusation de plus dans un registre qui ne s'efface pas (classe **Q-301**).
`POST /api/pieces/<entite>/<id>/rattachements` réutilise une preuve, et c'est **la seule
route du produit qui met en jeu deux domaines fonctionnels** : le crochet d'accès tranche
celui de l'URL, la route vérifie elle-même le droit de LIRE le porteur d'origine — sans
quoi un profil privé du domaine « documents » lirait la PSSI par la bande.

**Côté écran** — et c'est la moitié que trois lots d'affilée avaient oubliée : le panneau
des pièces jointes **arrive sur la fiche d'un contrôle**. Il ne vivait que sur les
documents et les incidents, si bien que *« montrez-moi la preuve de CE contrôle »*, la
première question d'un auditeur, n'avait aucun écran. L'encart « Réutiliser une preuve
existante » part du **registre documentaire** — et non d'une liste de toutes les pièces de
la filiale, qui aurait traversé les domaines d'un coup, c'est-à-dire un oracle. La ligne
dit « **Sert aussi N fiches** », les fiches sont **nommées** dans l'infobulle, et le bouton
dit **« Détacher »** tant que la preuve sert ailleurs, **« Supprimer »** sur la dernière.

⚠️ **Trois choses trouvées en travaillant, et aucune par relecture :**

1. **Une mutation qui ne mord pas, mesurée avant d'être crue.** La clause
   `not exists (… piece_rattachements …)` du déclencheur a été retirée : **banc vert**.
   Elle n'est jamais le filtre discriminant, la réadresse sortant la pièce du champ avant
   qu'on y arrive — motif exact du constat **Q-210**. Elle n'est pas morte pour autant :
   c'est la barrière **fail-closed**, celle qui fait *refuser* la suppression le jour où la
   réadresse manque, au lieu de laisser détruire une preuve que quatre contrôles invoquent.
   Un essai la fait désormais **décider**, en retirant la première barrière.
2. **Un garde-fou de schéma ne lit aucune ligne d'une table cloisonnée.** La première
   rédaction du garde comptait les pièces mal adressées. Elle mesurait juste — et levait
   `GRC04` chez `install.sh`, qui appelle `f_verifier_schema()` **sans périmètre**. *Un
   garde-fou qui exige un contexte d'application ne peut pas garder un déploiement.* La
   propriété a été déplacée dans le schéma, et la règle est écrite :
   `backend/db/CONVENTIONS.md` **§41** — *un garde qui doit lire des lignes est souvent le
   signe qu'une contrainte manque.*
3. **Un essai qui laisse un état partagé derrière lui accuse le suivant.** Le contrôle du
   cloisonnement changeait la filiale active de la session d'essai et échouait avant de la
   remettre : deux essais sans rapport rougissaient ensuite, pour une raison qui n'était pas
   la leur. `try` / `finally`, et le motif inscrit dans le fichier.

**Les six chemins de cascade sont éprouvés un par un**, et **découverts dans
`pg_constraint`** — le prédicat est partagé avec `orphelines.test.mjs` pour que les deux
familles balaient exactement les mêmes : une preuve réutilisée **change d'adresse** au lieu
de mourir, puis le **dernier** porteur libère la ligne, le fichier et la file de purge.
Quatre mutations jouées, **quatre morsures**.

### 19.5 / 19.6 et la passe de documentation — « les docs sont à jour ? » (16/09/2026)

**UN CONTRÔLE SE REJOUE, ET SON EFFICACITÉ N'EST PAS SA MATURITÉ — migration `037`.**

- **19.6** : une sauvegarde peut être documentée, planifiée, supervisée — maturité 4 — et
  **ne pas se restaurer**. Le produit ne savait pas représenter cette ligne ; il la
  représente. ⚠️ **Trois verdicts, pas une note de 0 à 5** : un second barème du même
  format inviterait à le moyenner avec la maturité, et le tableau de bord afficherait un
  chiffre qui mélange « à quel point c'est institutionnalisé » avec « est-ce que ça
  marche ». C'est le défaut classique des tableaux de bord GRC, et le garde-fou mesure
  l'efficacité **sur son type** pour l'empêcher de revenir.
- **19.5** : fréquence et dernier passage. Sans eux, un statut de 2024 s'affichait
  exactement comme un statut d'hier. ⚠️ La **prochaine échéance est dérivée**
  (`f_prochain_controle`), motif de l'action 19.2 ; et elle sait **ne rien rendre** — un
  contrôle jamais joué n'a pas d'échéance, un contrôle ponctuel non plus.
- Le vocabulaire des fréquences est **lu dans la contrainte appliquée** de `mco_actions`,
  jamais recopié. ⚠️ La première rédaction cherchait la forme telle qu'elle est ÉCRITE
  (`in (…)`) ; PostgreSQL la normalise en `= ANY (ARRAY[…])`, et la migration a **refusé
  de s'appliquer** plutôt que d'agir de travers. C'est son office.

**ET LA PASSE DE DOCUMENTATION, déclenchée par une question de l'utilisateur** — *« les
docs sont à jour ? »*. Réponse mesurée : **non**, et le banc ne pouvait pas le dire.

| | Faute | Classe |
|---|---|---|
| 1 | `DATA_MODEL.md` annonçait `SCHEMA_VERSION = 12` — **quatre versions de retard**, du 04/09 au 16/09 | Q-219 |
| 2-4 | Le guide envoyait vers « le bas de l'écran `/rgpd` », « Socle de risques », « Référentiels applicables » — trois portes **déplacées le matin même** | **Q-265** |
| 5-6 | Il nommait « Risques (EBIOS) » et « Conformité », qui ne sont plus des entrées | **Q-265** |
| 7 | Il annonçait « 31 entrées de menu » ; il y en a **28** | Q-4 |
| 8 | **`index.html` portait les anciens libellés en repli** : si l'i18n n'a pas pris, l'utilisateur voit les noms d'hier | — |
| 9 | ⚠️ `docs/PLAN_INTERFACE.md`, écrit le jour même, annonçait « 32 → 26 » quand c'est **28** | Q-4 |

⚠️ **DEUX CLASSES SONT FERMÉES MÉCANIQUEMENT, pas deux instances :**

- `test/reprise/versions-concordantes.test.mjs` confronte un **quatrième** endroit —
  `DATA_MODEL.md`. La faute n° 1 ne peut plus durer douze jours.
- `test/documentation/guides-nomment-le-reel.test.mjs` est **neuf** : il lit les libellés
  dans `index.html` et dans le contrat d'onglets — jamais dans une liste recopiée — et
  exige que **chaque destination citée par un guide existe**. C'est la classe des constats
  **Q-265 / Q-266**, deux bloquants de la porte S7, et elle s'est rouverte **en une
  journée** dès qu'on a rangé le menu. ⚠️ Il a trouvé **trois fautes que je n'avais pas
  vues**, dont celle du repli `index.html`, qui n'était écrite dans aucun document.

*Il reste une limite, et elle se dit : le banc sait désormais qu'un guide nomme une porte
inexistante ; il ne sait toujours pas qu'une EXPLICATION est devenue fausse.*

### Interface et preuve — sept sections, et le document qui prouve la mesure (16/09/2026)

**L'ARCHITECTURE DES SECTIONS**, sur demande de l'utilisateur : *« elles étaient prévues
pour une utilisation sans conservation de données et maintenant sont prévues pour une
conformité RGPD […] éviter les redondances et les répétitions, rendre l'interface
professionnelle, comme dans les grands logiciels de GRC »*. Diagnostic mesuré au
`docs/PLAN_INTERFACE.md`.

- **278 `font-size` en dur, 42 valeurs distinctes**, et l'échelle typographique employée
  par **zéro** module sur 36. Il en reste **zéro en dur**, dans les modules comme dans la
  feuille de style. Mesuré à l'écran : le tableau de bord rendait **21 tailles**, il en
  rend **9** — huit pas d'échelle plus une correction optique sur la chasse fixe.
- **Sept sections** au lieu de six : un prestataire était rangé sous *Continuité* parce
  qu'il avait été écrit en même temps que le PRA.
- **Les vues deviennent des onglets** — Risques (registre, matrice, socle) et Référentiels
  (catalogue, applicables, couverture). 32 entrées → 28, et **plus aucun écran sans
  porte** : la couverture croisée n'en avait aucune.
- **Le fil d'Ariane déduit sa section du menu**. Il portait sa propre taxonomie, et elle
  était **incomplète** — sept écrans n'y figuraient pas, et le fil disparaissait alors sans
  un mot.
- **Un écran, un nom** : sur le registre des risques, l'utilisateur lisait *trois* noms à
  quelques centimètres les uns des autres.
- **Le registre RGPD se lit en trois vues** — Traitements · Documents · L'outil lui-même —
  au lieu d'empiler trois sujets sur une page qu'il fallait faire défiler. ⚠️ Trois
  **onglets**, pas trois entrées : c'est là que l'AIPD (20.3) et les demandes de droits
  (20.4) entreront.

**LE DOCUMENT PROUVE LA MESURE (L19, action 19.3) — migration `036`.** Un auditeur ouvre
un contrôle et pose une seule question : *« montrez-moi la procédure »*. Le produit reliait
une mesure à une exigence, une mesure à une action, un document à un référentiel — et
**pas** un document à une mesure. Le chaînon manquant était celui qui transforme une
déclaration en preuve, et il manquait **dans les deux sens**.

- La barrière de portée est **asymétrique**, et l'asymétrie est le sujet : un document
  local prouve un contrôle du socle Groupe (le cas fréquent) ; une politique de **portée
  Groupe** ne peut pas s'appuyer sur un contrôle **local** — elle dépendrait d'une ligne
  qu'une seule filiale peut effacer (constat N-10).
- `restrict` du côté du CONTRÔLE, `cascade` du côté du DOCUMENT : supprimer un document
  emporte ses liens, supprimer un contrôle est **refusé**. Le §17.6 le dit — *un contrôle
  s'archive, il ne se supprime pas* —, et une cascade aurait fait disparaître la preuve.
- ⚠️ **Trois défauts trouvés par les garde-fous, aucun par relecture** : la table MIXTE
  sans déclencheur de portée figée, la traçabilité d'insertion que j'avais déclarée
  inutile *par raisonnement* (le critère n'est pas « se modifie-t-elle » mais « porte-t-elle
  `cree_par` »), et le déclencheur posé sans être **armé** — `f_poser_portee_figee()` ne
  l'arme pas, son propre commentaire le dit.
- Le garde-fou nomme ses **neuf** pièces une par une : quatre clés étrangères, deux miroirs
  de portée, la barrière, et les deux unicités qui rendent la référence exprimable.

Schéma **v14 → v15** : `documents[].mesures_ids[]`, un champ et non une collection.

### Vague B, suite — les dérogations datées, et deux capacités qui cessent d'être injoignables (16/09/2026)

**Les dérogations datées (L19, action 19.2) — migration `035`.** Toute organisation réelle
porte des écarts assumés : un serveur qu'on ne peut pas mettre à jour avant le
renouvellement de la ligne, un compte partagé que l'automate du fournisseur exige. L'ISO
27001 ne l'interdit pas — elle demande que l'écart soit **décidé, motivé, porté par
quelqu'un et borné dans le temps**.

- ⚠️ **On n'écrit JAMAIS dans `exigences`, et c'est toute la conception.** La pente
  naturelle était de poser « non applicable » pendant la dérogation et de le remettre à
  l'échéance. Elle est refusée : *il faudrait que quelque chose repasse*, et le jour où ce
  quelque chose ne repasse pas, le produit affirme **en silence** une conformité qui
  n'existe plus. L'état est **dérivé à la lecture** (`f_etat_derogation()`) : une dérogation
  échue cesse de couvrir à l'instant où le jour change, sans qu'aucun code ne s'exécute —
  donc sans qu'aucun code ne puisse l'oublier. *L'absence de traitement n'est pas une
  économie : c'est la garantie.*
- ⚠️ **Une dérogation SAISIE ne couvre rien.** Elle passe par le circuit d'approbation du
  lot **L8**, inchangé : un quatrième `objet_type`, et rien d'autre. Ses deux étapes sont
  celles du risque résiduel — *accepter une dérogation EST accepter un risque résiduel,
  nommément et pour une durée*.
- ⚠️ **La rallonger sans la faire réapprouver ne la rallonge pas** : modifier l'échéance
  périme l'empreinte figée par la décision, et l'état retombe à « non accordée ». C'est la
  propriété qui empêche l'écart assumé de devenir l'écart oublié, et elle vient
  **gratuitement** du lot L8.
- Elle entre dans la **couche générique** plutôt que dans un greffon à elle : verrouillage
  optimiste, journal, cloisonnement, import et round-trip `grc-backup` lui viennent tels
  quels. Schéma **v13 → v14**, un palier de reprise qui ne transforme rien.
- **Trois défauts trouvés par les garde-fous, aucun par moi.** *(1)* Le domaine
  `type_entite` n'admettait pas « derogations » : toute création écrivant au journal, la
  table était **incréable** — c'est le piège que la migration `013` documente en toutes
  lettres, retendu vingt-deux migrations plus tard. *(2)* Une fois le domaine élargi, la
  table devenait **porteuse de pièces jointes** et n'avait pas son déclencheur : le garde de
  la `017` a refusé le déploiement. *(3)* Et la pose, placée avant les politiques, ne voyait
  pas la table — le prédicat de découverte exige une politique de suppression cloisonnée.
  La `017` faisait cette pose dans un bloc anonyme que **rien ne rejouait** ; elle devient
  `f_poser_declencheurs_pieces()`, qu'une migration APPELLE comme elle appelle déjà
  `f_poser_tracabilite_insertion()`.
- Le garde-fou **ÉPROUVE** la dérivation sur quatre cas témoins, et refuse tout déclencheur
  de `derogations` qui écrirait dans `exigences`.

**Les deux capacités du 16/09 cessent d'être injoignables.** L'attestation de lecture et
l'horloge réglementaire étaient livrées, éprouvées, vertes — et **aucun écran ne les
appelait**. Pire : `documents.attestation_requise`, seule chose qui déclenche toute la
chaîne de l'action 19.1, **n'était posable par aucun formulaire**. C'est la faute que la
vague 6 avait fermée, refaite un lot plus tard.

- **Panneau « Attestation de lecture » sur la fiche Document** — taux de couverture, qui a
  attesté dans quelle version, et le geste lui-même. ⚠️ Le corps de la requête ne porte
  **que le commentaire** : ni la personne, ni la version. L'essai le mesure **sur le corps
  HTTP réellement émis**, pas sur le code source.
- **Bloc « Politiques à lire » sur le tableau de bord**, qui distingue *jamais lue* de
  *révisée depuis* — deux situations qui n'appellent pas la même réaction.
- **Panneau « Horloge réglementaire » sur la fiche Incident**, avec les **quatre** paliers,
  leur référence au texte, et l'**origine** du compte. ⚠️ Il **REMPLACE** un bandeau qui
  recopiait les délais dans le navigateur (« alerte 24 h · notification 72 h », depuis le
  dictionnaire i18n) et comptait les heures avec l'horloge du poste : deux rédactions de la
  même obligation réglementaire, dont la seconde ignorait le rapport final à un mois.
- **Panneau « Dérogations » sur la fiche Exigence**, avec le bandeau qui répond à la seule
  question qui compte — *cet écart est-il couvert, et jusqu'à quand ?* —, le circuit
  d'approbation déplié en place, et un badge sur la liste des exigences.

⚠️ **« Non accordée » s'affiche en ROUGE**, ce qui surprend et qui est le seul ton juste :
une dérogation saisie mais non approuvée laisse l'écart **entièrement** découvert. L'orange
laisserait croire à une couverture partielle — c'est ce malentendu qui fait qu'un écart
traîne un an.

**Dix-sept essais neufs**, dont deux familles navigateur qui mesurent **ce que l'écran
dit**, pas ce que le serveur rend. Quatre mutations jouées, quatre morsures.

### Vague B — la chaîne de preuve et l'horloge réglementaire (15–16/09/2026)

**L'attestation de lecture (L19, action 19.1) — migration `033`.** Le produit savait dire
qu'une politique existe, qu'elle est en vigueur, et qui l'a approuvée. Il ne savait pas dire
**qui l'a lue** — la seule chose qu'un auditeur demande au chapitre **ISO 27001 A.5.1**.

- ⚠️ **On n'atteste que pour soi** : la personne est déduite de la session, jamais reçue du
  client. *Une preuve d'audit qu'un tiers peut fabriquer ne prouve rien.* Et la **version**
  vient du serveur — sans quoi on attesterait d'une version qu'on a choisie.
- ⚠️ **Une politique révisée redevient « à lire »**, et le produit dit **pourquoi** :
  `version_perimee` et non `jamais_atteste`. Ne compter que « jamais attesté » ferait dire
  « tout le monde est à jour » le lendemain d'une refonte de la PSSI.
- La **barrière de portée** reprend à l'identique le dispositif audité de la `030` : une
  personne de Toulouse atteste la PSSI du Groupe ou une procédure locale, **jamais** le
  document local de l'Allemagne. Symétrique pour la personne — sans son miroir, un RSSI de
  portée Groupe n'aurait **jamais** pu attester.
- Le taux de couverture compte la **version en vigueur** et se calcule sur le personnel de
  **la filiale active** : une PSSI lue par dix-huit Toulousains ne dit rien de l'Allemagne.

**L'horloge réglementaire (L20, action 20.1) — migration `034`.** Trois paliers NIS2 — alerte
précoce **24 h**, notification **72 h**, rapport final **1 mois** — et le **72 h** du RGPD,
chacun rendu **avec sa référence au texte**.

- ⚠️ **Un défaut du produit trouvé en l'écrivant** : `incidents.date_detection` est une date
  **nue**. Une horloge de 24 h qui en part peut se tromper de 24 h — *le premier palier tout
  entier*. `detecte_le` est ajouté, **facultatif**, et son absence est un fait que la route
  **DIT** (`origine: 'date_seule'`). *Une imprécision affichée vaut mieux qu'une précision
  inventée.* `date_detection` n'est pas touchée : elle entre dans le round-trip `grc-backup`.
- **Aucune échéance n'est stockée** : elles sont dérivées par `f_echeances_reglementaires()`,
  à un seul endroit. Stockées, une date de détection corrigée aurait laissé derrière elle
  des échéances calculées sur l'ancienne, sans que personne le sache.
- La table ne retient que **ce qui a été fait**, avec le **récépissé de l'autorité** — la
  pièce qu'un auditeur demande en premier. ⚠️ **Le produit ne transmet rien** : il prépare
  et consigne, l'humain envoie.
- Le garde-fou **ÉPROUVE** les quatre délais sur un instant témoin au lieu de lire le texte
  de la fonction : un délai changé par mégarde est visible là, et nulle part ailleurs.

**Quinze essais neufs**, tous par la route — leçon du constat **Q-325**, où un refus soigné
en base arrivait à l'utilisateur en 500 avec pile d'appel.

### Vague A, suite — le menu et la recherche (15/09/2026)

⚠️ **Arbitrage de l'utilisateur : le frontend sera REFAIT.** Le poids va donc côté serveur
— c'est la couche que le frontend neuf consommera. Ce qui est présentation est livré
utilisable, pas fini.

**A2 — le menu se replie.** 32 entrées à plat, dont **dix-sept** sous un seul intertitre,
deviennent **six sections repliables**. L'appartenance d'une entrée à sa section est
**déduite du balisage** : une liste écrite dans le code aurait un jour oublié une entrée, et
l'oubli l'aurait **fait disparaître** au premier repli, en silence.

⚠️ **Le défaut qui a coûté le plus** : la première rédaction repliait par l'attribut
`hidden` — or `appliquerDroitsAuMenu()` l'écrit sur chaque entrée à **chaque navigation**.
Les deux couches se disputaient le même attribut, et la dernière gagnait : mesuré, **31
entrées visibles sur 31** pendant que cinq sections sur six s'annonçaient repliées. Le repli
passe par une **classe**, et les deux couches se composent.

**A3 — la recherche globale et la palette `Ctrl+K`.** Repoussée deux vagues durant, avec un
motif écrit : *« une recherche est un oracle, c'est la surface la plus propice à une fuite
entre filiales »*. Quatre décisions la ferment :

1. **C'est la RLS qui borne, jamais un filtre** — aucune requête ne nomme de filiale, et un
   contrôle de forme le vérifie dans la source ;
2. **les droits bornent aussi** : on ne cherche que dans les domaines que la session lit ;
3. **elle ne va pas au-delà du LIBELLÉ** — balayer le texte libre ferait de l'outil un
   moteur de recherche sur des commentaires dont le registre de l'article 30 dit qu'une
   partie porte des personnes ;
4. **elle consomme le MÊME budget de trace que le sondage** — ce qui ferme la réserve
   laissée ouverte par Q-279 : *« paginer en fenêtres étroites échappe encore »*.

**Quinze essais neufs**, dont les contrôles de fuite **par paires** : chaque refus a son
témoin positif sur le même terme, sinon une recherche qui ne rend jamais rien passerait au
vert (motif Q-210).

### Vague A — on arrête les passages, on construit (14/09/2026)

**Arbitrage de l'utilisateur** : *« cette énorme quantité de passages ne fait que perdre du
temps […] il me faut le logiciel fonctionnel et complet »*. Mesuré avant d'en décider :
**zéro nouvel écran dans la SPA en dix jours**, 80 % du travail hors SPA, 34 rapports de
porte pour **28 690 lignes** — presque toute la SPA —, et **rien en classe 1 ou 2** aux
trois derniers passages. Le plan est au [`docs/PLAN_ACHEVEMENT.md`](docs/PLAN_ACHEVEMENT.md).

**A1 — le jeu de découverte (lot L18 bis) est LIVRÉ**, avec ses **cinq conditions
constitutives** éprouvées une par une.

- **Migration `032` — la marque de provenance.** Toute entité métier — **découverte au
  catalogue** par « porte `filiale_id` ET porte `cree_par` », 29 tables, trois écarts
  déclarés avec leur motif — porte `provenance` : `saisie`, `decouverte` ou `reprise`,
  domaine clos.
- ⚠️ **La marque est posée PAR LA BASE**, depuis le réglage de transaction
  `grc.provenance`, exactement comme `cree_par`. La valeur de l'appelant est **écrasée** :
  *une marque que le client choisit ne prouve rien*, et le contrôle « la base porte-t-elle
  des données réelles ? » s'appuie dessus. Mesuré : un `insert` déclarant `decouverte`
  ressort en `saisie`.
- ⚠️ **Le nom `origine` que le plan prescrivait était DÉJÀ PRIS**, avec deux sens
  différents (`referentiels_actifs`, `risque_catalogue`). C'est le garde-fou neuf qui l'a
  trouvé, à sa première exécution — et le `add column if not exists` aurait silencieusement
  ne rien fait sur ces deux tables, y laissant des lignes de démonstration indiscernables
  des réelles. *Le nom cède, la propriété non.*
- ⚠️ **Et le domaine ne porte pas `not null`** : il faisait rougir quinze anomalies sur
  trois tables sans rapport, parce que `f_contrainte_accepte()` construit sa ligne témoin
  par `jsonb_populate_record(null::<table>, …)`. *Une colonne ajoutée ailleurs aurait rendu
  aveugle le garde le plus récent du dépôt.*
- ✅ **Fermé à la CLASSE, pas à l'instance** : `f_verifier_domaines_eprouves()` **découvre
  désormais les domaines dans le catalogue** et rend `domaine_sans_temoin` pour tout domaine
  que personne n'éprouve. Trouvé en mutant la migration qu'on venait d'écrire —
  `provenance_ligne` se vidait par « … or true » sous **zéro anomalie**, faute d'un témoin.
  C'est le constat A-2 du 10ᵉ passage, fermé pour de bon.
- **`GET /api/decouverte/etat`, `POST …/semer`, `POST …/purger`**, et le panneau des
  Paramètres. Le semis est refusé hors profil découverte (**403, journalisé**), refusé si la
  base porte **la moindre ligne non marquée**, et la purge emprunte le déclencheur `017`
  pour que les pièces jointes suivent.
- **Huit essais neufs**, un par condition et par refus.

### Après le 9ᵉ passage — ce que personne n'avait pu auditer (14/09/2026)

**Question posée : « les docs sont à jour ? »** Le contrôle mécanique — la famille
`test/documentation/` — rendait **79/79**. Il ne couvre pas la prose, et la prose portait deux
fautes, dont l'une a fait sortir un défaut du **produit**.

- **Q-335 — l'écran du journal faisait disparaître les deux blocs « valeurs avant / après »
  SANS UN MOT.** Le correctif de Q-330, livré après l'audit, retire le contenu des
  enregistrements aux comptes sans droit d'export ; `journal.js` rend une chaîne vide quand la
  valeur est nulle, si bien que **rien ne distinguait « cette entrée n'a pas de différentiel »
  — une connexion, un démarrage — de « on vous le cache »**. Classe Q-201 / Q-207.
  ⚠️ **Le serveur envoyait déjà `differentiel_masque: true` : il était écrit, et lu par
  personne** — troisième fois ce mois-ci. L'écran affiche désormais le motif.
  ⚠️ **Et les auditeurs ne pouvaient pas le voir : le correctif qui l'introduit est postérieur
  à leur passage.** *Un correctif accepté hors passage de porte n'a été soumis à personne.*
- **Le guide d'exploitation annonçait « 197 colonnes décidées »** quand le registre en compte
  **206** depuis que la migration `031` a franchi la frontière du texte. Le chiffre était juste
  le jour où il a été écrit et faux le lendemain — et c'est **exactement la faute que le
  constat Q-331 venait de fermer** : la correction avait porté sur les documents que l'équipe
  relit, pas sur celui que l'exploitant lit.
- **La règle de Q-330 n'était écrite nulle part.** Elle l'est maintenant aux trois endroits qui
  la servent : le guide de l'utilisateur (ce qu'il voit et pourquoi), le guide d'exploitation
  (un tableau « qui voit quoi »), et le contrat HTTP du `CONVENTIONS.md` §29.8 — *le droit
  d'export ne peut pas dépendre du FORMAT dans lequel on demande la même chose.*

### Porte S8, 9ᵉ passage — vingt-trois constats, et les deux qui portent le refus visent les gardes de la veille

**Deux auditeurs indépendants, périmètres exclusifs. Verdict : refusée** — 0 bloquant,
12 majeurs, 11 mineurs, **0 fuite entre filiales**. Un seul contrôle en échec de chaque côté :
**S16** (les garde-fous branchés) et **S12** (les erreurs ne renseignent pas l'attaquant).

⚠️ **Et le motif ne change pas** — quatrième porte de suite : *les deux constats qui portent
le refus visent les gardes écrits pour fermer le passage d'avant.*

- **Q-312** — `f_domaine_accepte()`, livrée la veille par la migration `028` et inscrite en
  règle au `CONVENTIONS.md` §39.1, **n'est appelée par personne**. Deux fichiers la
  mentionnent : celui qui la crée, et celui qui promet qu'on s'en sert. Les domaines
  `id_metier` et `type_entite` se vidaient donc par « … or true » sous `f_verifier_schema()`
  à **zéro anomalie**, et `insert into risques (id) values ('')` passait — **Q-310, donc
  Q-194, rouverts par la migration écrite le même jour pour les fermer**.
- **Q-313** — les cinq pièces de la migration `030` se retiraient **une par une** sous zéro
  anomalie, et l'auditeur a joué les conséquences : la PSSI de portée Groupe désignant le
  traitement local d'une filiale (**N-10 rouvert**), un document de Toulouse désignant le
  traitement allemand (**lien inter-filiales**). La cause :
  `f_verifier_references_portee()` — renforcé la veille **pour cette classe précise** —
  reconnaissait une colonne **nommée** `filiale_id`, quand la `030` a nommé la sienne
  `traitement_filiale_id`. *Reconnaître un NOM au lieu de mesurer ce qu'une chose FAIT* — la
  règle que le §39 venait d'écrire, retournée contre lui.

Le garde regarde désormais ce qu'une colonne **RÉFÉRENCE** (`confkey`), et il **apparie par
la colonne locale** : sans la seconde moitié, la propriété du constat Q-297 se perdait, deux
clés d'une même table vers la même cible référençant toutes deux `<cible>.id`. *Les deux
moitiés sont nécessaires, et chacune a coûté un passage de porte.*

#### Ce que le reste corrige

- **Q-325** — le refus `GRC07` de la migration `030` **n'arrivait jamais à l'utilisateur** :
  il devenait un **500 avec pile d'appel**, parce que le traducteur d'erreurs ne connaissait
  pas ce code. Une faute de saisie classée incident serveur. ⚠️ **Le banc ne pouvait pas le
  voir** : `GRC07` ÉTAIT éprouvé — **en SQL direct**, jamais par la route.
- **Q-326** — le même correctif nommait au client `filiale_id` et `traitement_filiale_id`,
  deux colonnes que `/api/modele` ne sert pas, en justifiant par *« ce sont les noms que
  l'appelant a lui-même envoyés »*. Les champs connus du client sont désormais **découverts**
  de `decrire()`.
- **Q-314** — le renversement du registre RGPD s'arrêtait à la **frontière du texte** : huit
  colonnes `jsonb` et une `inet` n'étaient réclamées par personne, dont
  `journal_audit.valeurs_avant`, qui recopie **par construction** toutes les colonnes
  déclarées personnelles. La preuve du défaut était dans le registre lui-même —
  `journal_audit.adresse_ip` y figurait, **inscrite à la main**, et sa jumelle
  `sessions.adresse_ip` n'était pas décidée.
- **Q-315** — un garde-fou **exécutait ce qu'il inspectait**, sous l'identité du
  propriétaire. ⚠️ **Revérifié, et le mécanisme n'était pas celui que le rapport annonçait** :
  `stable` bloque l'écriture *directe* ; c'est un appel de profondeur un qui passe. On refuse
  désormais d'évaluer tout prédicat référençant une fonction **non native** — mesuré : aucune
  des 150 contraintes du schéma n'en référence une.
- **Q-327** — le plafond de matière annoncé la veille avait été posé **à un endroit et oublié
  à l'autre, dans le fichier écrit pour le poser** : contre la mutation, le banc ne rendait
  jamais la main. Il rougit maintenant en 0,7 ms.
- **Q-329** — le compteur cumulé se **réarmait à chaque bascule de filiale** : ≈ 480 lignes
  extractibles sans trace par un compte de portée Groupe. *Un budget qui se réarme n'est pas
  un budget.*
- **Q-330** — `GET /api/journal` rendait le **contenu** des enregistrements sous le droit
  `lire`, quand la même matière en CSV exigeait `exporter` : *le droit d'export ne peut pas
  dépendre du format dans lequel on demande la même chose.*
- **Q-333** — le verrouillage se distinguait **au chronomètre** (18 ms contre 55 ms) quand le
  message était identique à l'octet près. Plancher de 80 ms sur les deux chemins qui refusent
  sans interroger l'annuaire. ⚠️ **Ce n'est pas une égalisation parfaite, et la limite de la
  mesure est dite** : le cas négatif n'a pas été éprouvé sur un compte réel de l'annuaire.
- **Q-331** — « douze sujets » restait faux dans **les trois documents que l'exploitant lit**,
  et le commit de la veille n'avait touché que les documents internes. *La même faute, d'un
  cran plus loin.*
- **Q-332** — le guide affirmait que l'unité de notification est « la seule qui ouvre une
  connexion vers l'extérieur ». C'est faux, et l'oubli **empêche toute connexion** : le
  service principal doit joindre l'annuaire en LDAPS. ⚠️ *Ce qui a protégé le produit n'est
  pas ce document, c'est un contrôle bloquant d'`install.sh`.*
- **Q-321** — 81 bases d'essai orphelines sur la grappe qui sert la recette (1 124 Mio), et le
  seul nettoyage documenté était sous interdit. **L'interdit portait sur les mots de passe des
  rôles, pas sur cette option** — c'est désormais imposé plutôt que raisonné, et la grappe
  passe à **52 Mio**.

#### Ce qui tient, et qu'il faut lire

**Le contrôle S7 cesse d'être en échec pour la première fois en quatre portes.** Q-301 et
Q-302 sont mesurés fermés **dans le journal de la recette** — un sondage au repos écrit
**zéro** entrée, contre trois en soixante-dix secondes au passage précédent — et les
**quatorze routes `GET`** ont été balayées sous un compte sans droit d'export : aucune
quatrième route ne rend le jeu sans trace. Cloisonnement **110/110** sous `grc_app`, **34
sondes hostiles** sans une percée, **0 fuite entre filiales**, et le parcours complet — créer,
classer, étiqueter, enregistrer, **recharger par F5**, filtrer, imprimer — **ne détruit rien**.

### Porte S8, 8ᵉ passage — les dix-neuf constats traités, et le dispositif refait

Le 8ᵉ passage a rendu **un chiffre qui condamnait le dispositif plutôt que le produit** :
*sur 41 mutations, 14 ne mordent pas — et treize visent des gardes posés dans les trois
jours précédents.* Troisième porte de suite où ce motif domine. Ce qui suit corrige le
produit là où il fallait, et **refait le dispositif qui le mesure** partout ailleurs.

#### 🛑 Le bloquant — le journal inscrivait de fausses accusations, indélébiles trois ans

**Q-301.** `GET /api/rafraichir` comptait `charge.volumes` — **l'inventaire de la
filiale**, indépendant de `depuis` — au lieu de `charge.modifications`, ce qui sort
réellement. Conséquence mesurée dans le journal de la recette : une SPA **ouverte sans un
geste** inscrivait « Extraction du jeu de données par le sondage (30 lignes rendues) » à
côté de `collections: 0` — **l'entrée portait sa propre réfutation** —, à raison de trois
en soixante-dix secondes, soit ≈ 3 750 par jour et par onglet, dans le registre qui sert de
preuve en audit.

Le correctif tient en une variable. ⚠️ **Ce qui compte est la morsure, et l'essai existant
ne pouvait pas la voir** : il semait trente lignes fraîches, si bien que l'inventaire et le
delta valaient tous deux trente. Deux contrôles neufs : le journal doit inscrire **le
nombre de lignes SORTIES**, et **un sondage au repos n'écrit RIEN** — celui-là mord, la
filiale portant alors plus que le seuil.

**Q-302**, dans la foulée : le seuil absolu était devenu une propriété de la **taille de la
filiale**. Dix-huit lignes *sont* le jeu entier d'une filiale qui vient d'être acquise, et
dix-huit est sous le seuil — donc zéro trace, pour un compte dont `GET /api/export` rend
403. Un **compteur cumulé par appelant** le referme. ⚠️ Il est **en mémoire**, et le coût
est écrit plutôt que caché : un redémarrage le remet à zéro — le porter en base exigerait
d'ouvrir `sessions` à toute transaction, c'est-à-dire de rouvrir la condition **E1**.

#### Les garde-fous ÉPROUVENT, au lieu de reconnaître un mot — migrations `028` à `030`

Cinq constats — **Q-291, Q-292, Q-295, Q-297, Q-299** — étaient la même faute prise sous
cinq angles : *un garde qui reconnaît au lieu de mesurer, ou une liste écrite à la main
dont l'incomplétude réussit en silence*. La mesure qui condamne, jouée par l'auditeur :

```sql
check (confidentialite in ('public','interne','confidentiel','restreint') or true)
→ f_verifier_classification_documents() : 0 anomalie
→ f_verifier_schema()                   : 0 anomalie
→ insert … confidentialite = 'diffusion libre'  : ACCEPTÉ
```

C'est **le constat Q-281 rouvert par les gardes écrits pour le fermer**.

- **`f_contrainte_accepte()`** (`028`) **évalue le prédicat réel** — `pg_get_expr` sur une
  ligne construite par `jsonb_populate_record` — et rend ce que la base répondrait.
  **`f_verifier_contraintes_eprouvees()`** lui soumet **dix-neuf lignes témoins** sur six
  contraintes qui portent une barrière. ⚠️ Les cinq gardes qui lisent le TEXTE restent :
  ils attrapent les mutations franches et les attrapent bien. Celui-ci attrape celle qu'ils
  laissaient tous passer. *Un garde qui envoie et constate ne peut pas être trompé par un
  « or true ».*
- **Q-291** — la migration `026` écrivait **deux fois** que le rôle applicatif n'avait que
  `select` sur `colonnes_personnelles`, et ce rôle pouvait **vider le registre de l'article
  30 du produit**, sous un `f_verifier_schema()` au vert. Le `revoke` est posé ; et le
  remède de classe est **`f_verifier_registres_techniques()`**, qui part du **catalogue** —
  toute table sans `filiale_id` doit être rangée « registre » ou « écrite par
  l'application » — au lieu de la liste `v_registres` qui vieillissait sans bruit. *Une
  migration avait AFFIRMÉ une propriété au lieu de la POSER.*
- **Q-295** — le balayage du registre est **renversé**, comme `f_verifier_couverture_rls()`
  l'avait été au constat Q-5 : **toute** colonne textuelle est candidate. Le semis passe de
  **58 à 197 décisions**, en quatre familles — vocabulaire clos ; saisie libre dont le sujet
  est un objet, régime **`signaler`** ; attribut d'une personne morale ; donnée personnelle.
- **Q-296** — « colonne textuelle » ne se dit plus qu'à un endroit
  (`f_colonnes_textuelles()`). ⚠️ **Et le défaut était plus large que le constat** :
  `format_type()` rend « character varying(**120**) » pour une colonne bornée, si bien
  qu'`in ('text','character varying')` ne voyait **aucun** `varchar(n)`. Aucune des trois
  moitiés du dispositif ne l'aurait vu. Trouvé en **fabriquant la matière** — le banc était
  vert des deux côtés du correctif.
- **Q-297** — la compagne de portée doit protéger **la même colonne** ; **Q-299** — le
  verrou d'approbation **découvre** ses colonnes (`to_jsonb(new) - <ce qui a le droit de
  bouger>`), si bien qu'une colonne ajoutée demain est protégée d'office ; **Q-300** — le
  registre impose la **cohérence de type**, une déclaration booléenne avortant la purge de
  toutes les filiales.

#### Un document local relève enfin du traitement que le Groupe opère pour lui

**Q-294.** La règle de la `027` était **symétrique** ; le danger ne l'est pas. Le produit
servait le traitement de Groupe, l'**offrait** dans le formulaire, et le **refusait en
409** — en disant à l'utilisateur que l'élément « n'existe pas dans votre périmètre » alors
qu'il était affiché sous ses yeux. **Dix-neuf filiales ne pouvaient rattacher aucune de
leurs procédures au traitement que le Groupe opère pour elles.**

C'est **l'arbitrage** qui a été corrigé, pas l'écran (migration `030`). Le sens inverse —
document de portée Groupe vers traitement local — reste **fermé** : c'est le constat N-10.
« Même filiale **OU** cible de portée Groupe » n'étant pas une clé étrangère mais une
**disjonction**, la filiale visée est matérialisée dans une colonne **posée par un
déclencheur** — jamais crue sur parole, ce serait un oracle d'existence — et deux clés
composites plus deux `check` font le reste.

#### Le circuit d'approbation d'un document qu'on vient de créer — Q-303

Le serveur réattribue l'identifiant à la création ; l'encart interrogeait le serveur avec
l'identifiant provisoire du navigateur, recevait 404, et affichait *« Cet enregistrement
est introuvable. Il a peut-être été supprimé, ou **il appartient à une autre filiale** »*
sur un document créé dans sa propre filiale. Le geste nominal ne se terminait pas sans
rechargement, et le produit mentait **sur le cloisonnement**.

⚠️ **Le correctif évident ne suffisait pas.** Inverser la préséance dans `brancherEncart`
était nécessaire et insuffisant : à la création, l'attribut du conteneur est écrit depuis
le *même* identifiant local, et l'encart a déjà reçu son 404 quand le recalage le réécrit.
`js/core/sync.js` **annonce** désormais le recalage (`grc:identifiant-recale`), et
`approbations.js` s'y rebranche. *Le défaut ne vivait dans aucun fichier : le recalage avait
raison, l'encart avait raison, et personne ne les présentait l'un à l'autre.*

#### Le banc rattrape ce qu'il ne regardait pas

- **Q-304** — les sept bornes de `BORNES`, remède du constat Q-214 d, n'étaient mordues par
  **aucun** essai : `elementsParLiaison` porté de 1 000 à 100 000 000 laissait **53 essais
  verts**. `test/api/bornes.test.mjs` les éprouve, en **lisant les bornes** au lieu d'en
  recopier les valeurs. ⚠️ **Et un plafond de matière a été posé après l'avoir payé** : la
  première rédaction fabriquait `borne + 1` éléments et, contre cette mutation-là, **s'est
  figée au lieu de rougir** — leçon du constat Q-251. Elle rend désormais rouge en 1,2 ms.
- **Q-305** — l'échappement de l'étiquette n'était **jamais décidé** : la famille n'employait
  que des valeurs inoffensives. L'essai sème désormais la valeur hostile **par la base** et
  exige zéro exécution, zéro balise interprétée, **et la valeur affichée telle quelle**.
- **Q-306** — le composant à puces avait été réécrit, et son **consommateur préexistant** —
  les participants d'une revue de direction — n'était mesuré par personne.
- **Q-293** — le régime `signaler` n'existait **que dans la base** : `crise.notes` le
  portait, et la purge le traitait en « anomalie », c'est-à-dire en défaut. Le rapport se
  trompait **dans les deux sens à la fois**. La règle se lit désormais au registre, et
  `incidents` n'en est plus qu'une conséquence.

#### Deux constats trouvés en travaillant, et ils sont de la même classe

- **Q-310** — `risque_catalogue.id` et `filiale_id` étaient de type `text` **nu**, quand
  toute autre colonne d'identifiant porte le domaine `id_metier` : la chaîne vide et les
  identifiants non rognés y entraient. C'est **mot pour mot le constat Q-194**, sur la table
  que la même migration `012` avait créée — la correction avait porté sur l'instance, pas
  sur la classe. Un garde de classe l'empêche de revenir.
- **Q-311** — le garde-fou du §29.5 (« aucun `resume:` n'interpole une valeur ») examinait
  **une ligne à la fois**, et le produit écrivait son interpolation sur la ligne *suivante*,
  dans une ternaire : le contrôle était vert depuis le 7ᵉ passage. *Un garde qui se
  contourne par un retour à la ligne ne tient pas une règle, il tient une mise en forme.*

#### Ce qui a été ARBITRÉ et NON fermé, parce que le dire vaut mieux

- **Q-307** — la route du registre produit **laisse désormais une trace**, et c'est tout :
  le droit d'accès n'est pas resserré et le registre n'est pas amputé de ses colonnes
  d'authentification. L'amputer serait Q-295 rouvert, et un DPO a le droit de savoir que
  l'outil détient une empreinte de mot de passe.
- **Q-309** confirme **Q-286** au lieu de le contredire : le limiteur de rythme par session
  se fait **en une fois pour toutes les routes coûteuses**, jamais route par route.
- **Q-301** — ⚠️ **les entrées déjà écrites ne s'effacent pas.** C'est le dessein du journal,
  et c'est ce qui rend ce défaut bloquant. La seule chose qu'un registre inaltérable
  autorise est une **contre-déclaration datée** inscrite à côté : elle est proposée à
  l'utilisateur, elle n'est pas posée d'office.

### RGPD — le logiciel qui gère la conformité devient lui-même conforme

Demandé le 10/09/2026, et le motif vaut d'être cité : *« je ne peux pas proposer un
logiciel pour gérer la cyber alors que le logiciel même n'est pas conforme, à la base, au
RGPD. Il faut que les documents puissent être tagués et classifiés, c'est la base. »*

Le lot compte **quatre pièces**, livrées en deux temps — migrations `026` et `027`.

#### 1. Le produit sait ce qu'il détient — et il ne le savait pas

**La mesure qui a tout déclenché.** La purge RGPD était bien conçue : elle **découvre** les
colonnes dans `pg_catalog` au lieu d'en tenir une liste. Mais elle n'anonymisait que celles
dont le **nom** figurait dans une liste écrite à la main de **cinq entrées**. Relevé dans
le schéma : **quarante** colonnes portent un nom qui désigne une personne — et
`utilisateurs` en porte **quatre de plus qu'aucun motif ne devine** (`identifiant`, `upn`,
`sid_ad`, `nom_affichage`). **La purge annonçait « terminé » en laissant le nom en place
presque partout.**

`colonnes_personnelles` (migration `026`) est le registre qui manquait : **une décision par
colonne**, avec sa finalité, sa base légale, sa durée et ce qu'on en fait à l'expiration.
**56 colonnes décidées** — 37 personnelles (26 *anonymiser*, 8 *supprimer*, 2 *conserver*,
1 *signaler*) et 19 non personnelles. C'est, littéralement, **le registre de l'article 30 du
produit lui-même** : celui qu'on présente au DPO d'un client.

⚠️ **Le garde-fou a payé dès sa première application** : il a rendu **huit colonnes que le
semis avait manquées** — dont `crise.notes` et `utilisateurs.mot_de_passe_hash`. J'avais
bâti ce semis sur un balayage par motif de nom, c'est-à-dire exactement le travers que ce
registre existe pour corriger.

⚠️ **Un quatrième régime, trouvé par un essai.** `crise.notes` était déclarée
« anonymiser » ; le nom y a survécu à la purge, parce qu'il est **au milieu d'une phrase**
et que le remplacer détruirait la note. Régime **« signaler »** : le produit désigne
l'emplacement à un humain au lieu d'effacer.

#### 2. Q-284 est résolu, et autrement que proposé

Irréversibilité d'une approbation contre droit à l'effacement : les deux invariants
semblaient inconciliables, et le remède de style D2 avait été **mesuré impossible**
(`GRC02`). La bonne réponse n'était pas de supprimer, c'était de **distinguer** : ce qui
doit être indélébile est la **décision** (étape, ordre, verdict, date), pas le **nom**. Le
verrou compare désormais les colonnes une à une et n'admet que l'écriture qui **retire
l'acteur** — une anonymisation ne peut pas s'en servir pour réécrire un verdict.

#### 3. Les documents se classent (migration `027`)

`documents` reçoit **`confidentialite`** (`public` / `interne` / `confidentiel` /
`restreint`), **`donnees_personnelles`**, des **étiquettes libres** et le **rattachement au
registre de l'article 30**.

⚠️ **Le défaut de `confidentialite` est `interne`, jamais `public`** : un document dont
personne n'a tranché la diffusion ne doit pas être réputé diffusable. C'est aussi ce que
devient un document repris d'un export antérieur à `027`.

⚠️ **Les étiquettes vivent dans une TABLE, pas dans une colonne tableau** : ce schéma est
strictement relationnel, et la table donne le comptage, le filtrage et l'index qu'un
`text[]` ne donne pas. Elles sont normalisées **dans la base** — l'import, la reprise et
`psql` écrivent aussi dans cette table, et *une route ne voit que son chemin*.

⚠️ **Aucune contrainte ne refuse « public + données personnelles ».** C'est pourtant le
signal le plus utile du lot — mais il a des cas légitimes : un document public nomme son
DPO, et l'article 13 l'exige. Le produit le **signale** à l'écran au lieu de l'interdire.
*Une alerte qu'on peut lever vaut mieux qu'une barrière qu'on contourne.*

#### 4. `traitements` s'ouvre à la portée Groupe — un prérequis, pas un supplément

`traitements.filiale_id` était `not null` : **un document de portée Groupe — la PSSI, la
charte informatique — n'aurait pu se rattacher à AUCUN traitement**, la clé de portée
exigeant les deux extrémités du même côté de la frontière. La table devient donc mixte,
comme `documents`, et `traitement_mesures` suit son parent.

#### Le garde-fou de ce lot est de CLASSE, et il l'a prouvé en naissant

`f_verifier_references_portee()` ne vérifie pas les trois références que la migration
ajoute : il vérifie **la règle dont elles sont trois instances** — toute clé étrangère
composite visant une table mixte par un `filiale_id` nullable doit avoir sa compagne sur
`portee_groupe`, sans quoi la règle *match simple* la neutralise pour **toute ligne de
portée Groupe** (constat **N-10**, porte S1, resté sept mois à l'état de vigilance dans un
commentaire). **Écrit avant que `fk_traitement_mesures_portee` existe, il l'a réclamée.**
Règle posée au `CONVENTIONS.md` **§38**.

#### Trois choses trouvées en construisant, et qui valent plus que le code

- **`on delete set null` est impossible sur une clé contenant une colonne engendrée**, et
  la forme à liste de colonnes de PostgreSQL 15 **ne sauve pas** — le contrôle porte sur la
  présence de la colonne, pas sur ce que l'action toucherait. La barrière est donc
  `restrict`, le déliage vit dans la couche applicative à la filiale près, et c'est le
  dispositif déjà arbitré au bloquant **B-1** de la porte S1.
- **Le garde-fou du registre d'entités a refusé le démarrage**, en toutes lettres, parce
  que `traitements.portee_groupe` n'était pas déclarée réservée. Ce n'est pas moi qui l'ai
  vue : c'est exactement l'office qu'on lui demande.
- **`C76` du script d'audit a rougi**, « attendu 11 sur 11, obtenu 14 sur 14 » : trois
  tables devenues mixtes, trois déclencheurs de portée de plus. Une liste écrite à la main
  dont l'incomplétude **échoue bruyamment** — le bon usage de la règle du `CLAUDE.md` §3.

### Les quatre bloquants des guides sont fermés — et l'un l'a été en changeant le produit

Constats **Q-264 à Q-267** de la porte S7. Trois étaient des descriptions fausses ; le
quatrième était une **promesse de sécurité** que le produit ne tenait pas, et celui-là ne
pouvait pas se corriger en réécrivant une phrase.

**Q-267 — on a rendu la phrase vraie plutôt que de l'affaiblir.** Le guide donnait à
l'exploitant, comme réponse à faire à un RSSI : *« STARTTLS est exigé : sans lui, l'envoi est
refusé — il n'y a aucun repli en clair »*. `SMTP_CHIFFREMENT=aucun` était pourtant une valeur
acceptée, qui ne produisait qu'un avertissement. Les deux issues honnêtes étaient celles du
constat Q-243 — ancrer la promesse, ou corriger le texte. **On ancre** : en production, un
relais actif sans chiffrement **refuse le démarrage**, en nommant la variable et la
correction. Le motif est mesuré et il est décisif : le relais du client est **Microsoft 365**,
donc un relais **externe**. La borne est `production` — le développement et la recette gardent
`aucun`, sans quoi on ne pourrait plus éprouver un relais local ; ce qui est refusé, c'est de
le **livrer**.

⚠️ **Le vrai enseignement de Q-267 est ailleurs, et il vaut au-delà du cas : le banc était
vert des DEUX côtés du correctif.** Six familles d'essais éprouvaient le **protocole** SMTP
jusqu'à l'octet — STARTTLS réellement négocié et constaté des deux bouts, `AUTH` jamais émis
en clair, injection CVE-2011-0411 détectée — et **aucune ne demandait quelles valeurs le
produit accepte de livrer**. La porte d'entrée n'était pas éprouvée du tout. Famille §7
ajoutée, avec sa garde §0 ; **mordue** : l'avertissement remis à la place du refus fait
rougir. ⚠️ Et la garde §0 a servi tout de suite — la première rédaction écrivait `SMTP_AUTH`
au lieu de `SMTP_MODE_AUTH`, rendant l'environnement invalide pour une raison étrangère au
sujet. C'est Q-210, attrapé cette fois par le dispositif prévu pour lui.

**Q-266 — le guide donne le chemin réel, et il a été joué avant d'être écrit.** Les deux
guides envoyaient l'administrateur sur un écran « Administration » qui n'existe pas, pour la
seule opération que le client qualifie de décisive : intégrer une société rachetée. Un encadré
donne désormais la procédure par l'API — session, `POST /api/filiales`, `POST
/api/cycle/sortie-filiale`, effacement du fichier de cookies qui vaut une session
d'administration Groupe. **Éprouvée sur la recette, à travers Apache** : connexion → 200 ;
création avec un corps vide → 400 « *Le champ « code » est obligatoire* » ; sortie → 400 ; et
**la même requête sans cookie → 401**, sans quoi les deux 400 n'auraient rien prouvé. Aucune
filiale n'a été créée — la recette n'en porte volontairement aucune de plus (Q-155). ⚠️ **Ce
qui reste n'est plus un défaut de documentation mais un manque produit** : l'écran relève de
L17, donc d'après les portes. Le guide ne promet plus ce qui n'existe pas.

**Q-265 — le groupe d'annuaire, et pourquoi ce n'était pas une faute de frappe.** Le guide
titrait « Administrateur — `GRC-GROUPE-ADMIN` », un groupe qui n'existe nulle part ailleurs
que dans cette ligne. `GRC-ADMIN` et `GRC-EXPORT` sont les **deux seules exceptions** à la
règle `GRC-<PÉRIMÈTRE>-<PROFIL>` : ils sont transversaux, sans segment de périmètre. Un guide
qui déroule les profils produit donc le nom fautif **par analogie**. Le §8 explique désormais
l'exception et rappelle que la résolution **cherche** les noms au lieu de les décomposer — un
groupe absent n'accorde rien **et ne se plaint de rien**.

**Q-264 — le produit n'a pas été changé, et c'était le bon choix.** Le guide promettait au
DPO que « les suppressions conservent le différentiel, pas l'enregistrement entier ». C'est
l'inverse : une *modification* ne laisse que le différentiel, une *suppression* conserve
l'enregistrement entier — c'est l'objet même d'un journal d'audit. Corriger le journal pour
coller au guide aurait détruit la propriété que le lot L5 existe pour tenir. C'est donc la
phrase qui change, et elle porte maintenant ce qu'un DPO doit savoir : *supprimer une fiche la
retire de l'application, pas du journal*, avec la rétention de trois ans.

⚠️ **Les quatre corrections disent, chacune, qu'elles disaient l'inverse jusqu'au 09/09.**
C'est délibéré : un guide qui se corrige en silence ne donne aucune raison de le croire la
fois suivante.

### Arbitrage du 09/09/2026 — on assume le vocabulaire normatif ISO

**Tranché par l'utilisateur** après la porte S7, sur les constats Q-252 et Q-253. **Ne pas
re-débattre : appliquer.** Pour les **intitulés** des catalogues ISO, le produit emploie la
terminologie de la norme. Le motif est bon et il est de métier : un auditeur lit
« Segregation of duties », pas une périphrase, et un outil qui invente ses propres mots lui
coûte du temps sur chaque ligne.

**Le `PLAN_SERVEUR` §4.2 est amendé en conséquence**, le texte d'origine conservé **barré** —
la porte S7 s'est appuyée sur lui, et le retirer rendrait ses constats illisibles. Et il
distingue désormais **trois régimes là où il n'en voyait qu'un**, ce que la porte avait
justement reproché au cadrage lui-même :

- **ISO 27001 / 27002** — vocabulaire normatif assumé pour les **intitulés seulement**. ⚠️ La
  limite ne bouge pas, et c'est ce qui rend l'arbitrage tenable : le **texte normatif** des
  mesures ne se reproduit en aucune langue, et le catalogue **français reste une
  reformulation** — il ne faut surtout pas le « rattraper » par symétrie.
- **NIS2, DORA et tout acte de l'Union** — aucune contrainte de paraphrase. Le §4.2 ne
  prévoyait pas l'exception ; c'était le **cadrage** qui avait tort, pas le lot.
- **ANSSI** — Licence Ouverte Etalab. La reformulation y reste un choix de qualité, pas une
  obligation.

**Deux conséquences que l'arbitrage rend obligatoires, et non facultatives :**

**Q-254 est fermé, et il ne pouvait plus rester ouvert.** Le produit affichait en anglais
« *Titles are reworded* » : assumer le vocabulaire normatif, c'est aussi cesser de prétendre
le contraire à l'écran. Les deux aides anglaises disent désormais que les intitulés suivent
la terminologie de la norme et que le texte normatif n'est pas reproduit. ⚠️ **La mention
française « Intitulés reformulés » n'a PAS été touchée : elle est vraie.** Les deux
catalogues ne suivent plus la même règle, et le §4.2 amendé l'écrit — sans quoi la prochaine
session corrigerait le français par symétrie.

**Q-253 ne se ferme qu'à moitié**, et la moitié qui reste n'a rien de juridique. Sur huit
chapitres d'ISO 27001, L11 a réduit l'exigence à un substantif nu : « Resources »,
« Competence », « Awareness », « Internal audit ». **Une exigence réduite à un substantif est
inutilisable dans une grille d'évaluation** — elle ne dit pas à l'évaluateur ce qu'on lui
demande de coter, là où le français le dit. Le constat passe de 🛑 à 🟠 et reste ouvert : il
faut rendre le verbe en gardant la tête normative (« Provide the resources needed for the
ISMS »), et non revenir à une périphrase.

⚠️ **AirCyber n'est pas couvert par cet arbitrage** et reste le seul point bloquant du sujet :
voir Q-255. Ce n'est pas une question de formulation — c'est l'absence, dans le dépôt, de
toute trace de licence sur un questionnaire de consortium privé dont le catalogue français
est un export CSV verbatim.

### ❌ La porte S7 est jouée pour la première fois, et refusée

Elle restait due depuis le 05/09. Deux auditeurs indépendants, aux **périmètres exclusifs** —
L11 les catalogues traduits, L14 la documentation —, dont aucun n'avait écrit les lignes
qu'il examinait. **27 constats : Q-252 → Q-263 et Q-264 → Q-278. 🛑 7 bloquants · 🟠 11
majeurs · 🔵 9 mineurs. Aucun de la classe « fuite ou perte de données ».**

⚠️ **Ce que cette porte démontre avant tout, c'est qu'elle aurait dû être jouée le 05/09.**
*Aucun* de ces 27 constats ne fait rougir quoi que ce soit : le banc était vert, et l'est
resté pendant quatre jours pendant que le produit portait une exposition juridique et que
ses guides envoyaient l'exploitant vers un groupe d'annuaire et un écran **qui n'existent
pas**. Le `CLAUDE.md` l'annonçait — *« aucun échec ne la signale, c'est le point le plus
facile à manquer »* — et c'est maintenant vérifié plutôt que craint.

**L11 — le droit d'auteur.** Le `PLAN_SERVEUR` §4.2, cadrage clos avec le client, impose de
*« traduire en paraphrasant délibérément, jamais littéralement »*, parce qu'une reformulation
fidèle d'un intitulé de l'Annexe A converge vers le titre officiel ISO, qui est le texte
protégé. `js/data/en/ref_iso27002.js` fait **l'inverse, et l'écrit dans son propre en-tête** :
« les intitulés ont été vérifiés contre plusieurs sources concordantes plutôt que devinés ».
La forme le confirme sans qu'on ait besoin du texte de la norme — 7.2 « Contrôle des accès
physiques » devient « **Physical entry** », plus court que le français ; 8.20 devient
« **Networks security** », pluriel agrammatical conservé tel quel. Le défaut n'est pas
d'abord juridique : **une décision de cadrage close a été renversée par un agent
d'implémentation, en toutes lettres, sans que rien ni personne n'arbitre.**

Deux constats vont plus loin. Sur les **chapitres 4 à 10 d'ISO 27001**, L11 a *supprimé* la
reformulation française : « Fournir les ressources nécessaires au SMSI » est devenu
« **Resources** » — convergence vers le texte protégé, **et** une exigence réduite à un
substantif nu dans une grille d'évaluation. Et la **prémisse même du §4.2** — « les textes
français sont des reformulations originales, ce qui protège le produit » — est **fausse pour
AirCyber**, 55 % du volume : `ref_aircyber.js` déclare « généré depuis l'export CSV du
questionnaire », et la mesure le confirme (titres de 164 signes de moyenne contre 28 à 46
ailleurs, 188 doubles espaces, une question commençant au milieu d'un mot). Le verbatim
français est **préexistant** ; l'œuvre dérivée anglaise est **introduite par L11**.

**L14 — les guides décrivent un produit qui n'est pas celui qui tourne**, à quatre endroits
mesurables. `GRC-GROUPE-ADMIN` n'existe nulle part ailleurs que dans le guide : un
administrateur d'annuaire qui le suit crée le groupe, y place le compte d'administration, et
**ce compte entre sans aucun droit** — `resolution.ts` ne décompose pas les noms, il les
cherche en base. L'écran « Administration » n'existe pas non plus, alors qu'il est le **seul
chemin donné** pour intégrer une société rachetée — le cas d'usage que le client qualifie de
décisif ; les routes existent côté serveur, sans interface, et le guide ne dit pas comment
les appeler. Le guide promet au DPO que « les suppressions conservent le différentiel, pas
l'enregistrement entier » : `CONVENTIONS.md` §29.4 dit l'inverse, et la base stocke **13
clés sur 16 colonnes**. Enfin « STARTTLS est exigé, aucun repli en clair » est donné comme
la réponse à faire à un RSSI, alors que `SMTP_CHIFFREMENT=aucun` est une valeur acceptée.

**✅ Ce qui tient, et il faut le dire.** La couverture de traduction est irréprochable —
424/424, zéro chaîne vide, zéro traduction orpheline. **NIS2 et DORA sont conformes au
droit** : ce sont des actes de l'Union, à 24 versions authentiques, et l'écart avec le §4.2
y est *assumé et motivé* — c'est le **cadrage** qui aurait dû prévoir l'exception. **ANSSI
est sous Licence Ouverte v2.0 Etalab**, vérifié, et `en/ref_anssi.js` **refuse explicitement
de recopier les titres officiels en argumentant pourquoi** : *le bon modèle existait déjà
dans le dépôt, à un répertoire des deux fichiers ISO.* Côté guides, le §4 bis (la reprise
« remplacer » détruit les pièces jointes) est écrit, complet et au bon endroit, deux fois ;
le §4 quater sur l'intégrité est exact et a été **vu mordre** sur un écart réel ; et « les 23
entités » est plus juste que le code, qui dit encore « vingt ».

⚠️ **Les rapports nomment ce qu'ils n'ont pas pu mesurer, séparément.** L'auditeur L11 n'a
ni le texte des normes ISO, ni le questionnaire AirCyber officiel : **aucune conclusion ne
repose sur un diff**, seulement sur ce que le dépôt déclare de lui-même et sur la divergence
FR→EN mesurée. L'auditeur L14 a joué **34 commandes** et refusé les destructives, en le
disant ligne par ligne.

**Vérifié par l'orchestrateur, et non repris au mot** : les sept bloquants ont été
recontrôlés un par un — `GRC-GROUPE-ADMIN` absent du dépôt, de `groupes-ad.sh` et de
l'annuaire ; les deux seules occurrences de `api/filiales` dans la SPA sont des
**commentaires**, dont un qui affirme encore que la route « n'existe pas encore » ; `§29.4`
dit bien « l'enregistrement supprimé » ; `SMTP_CHIFFREMENT` accepte bien `aucun`. Une nuance
a été ajoutée au registre contre le rapport (**Q-257**) : l'assertion `assert.ok(faits >= 0)`
qu'il pointe est **délibérée et commentée**, et y mettre un seuil de couverture traiterait le
mauvais défaut — ce qui manque est un garde du **critère**, pas du volume.

### ❌ Porte S8, septième passage — et cette fois le défaut est DANS le dispositif

**0 bloquant, 6 majeurs, 6 mineurs, 0 fuite entre filiales.** Constats **Q-279 → Q-290**,
révision `462a220`. **Trois contrôles en échec sur dix-huit** — S7 (droit d'export), S16
(garde-fous branchés), S18 (le produit fait ce qu'il doit) —, et **aucun « non rejoué »**.

**Sur douze mutations jouées, trois ne mordent pas — et les trois sont des gardes posés la
veille ou l'avant-veille.** C'est le résultat le plus utile de ce passage, et il vise le
dispositif plutôt que le produit.

**Q-281 — les garde-fous reconnaissaient un déclencheur, ils ne mesuraient pas ce qu'il
garde.** `f_verifier_declencheurs_pieces()` et `f_verifier_publication_documents()`
interrogent `pg_trigger` sur le **nom de la fonction** appelée et sur l'armement `always` —
**jamais sur `tgtype`**, qui encode `BEFORE`/`AFTER` et `INSERT`/`UPDATE`/`DELETE`.
L'auditeur a déplacé les événements — les 32 déclencheurs de pièces de `after delete` à
`after insert`, la barrière de publication de `before update` à `before insert` — et
`f_verifier_schema()` a rendu **0 anomalie**, `migrate.mjs` et `--diagnostic` restant au vert
**pendant que les deux barrières étaient mortes**.

C'est le motif que ce chantier traque depuis le premier jour, arrivé au dispositif qui existe
pour l'empêcher : *un garde-fou qui reconnaît au lieu de mesurer est pire qu'absent, parce
qu'il donne à croire que le cas est couvert*. Et il coûtait cher ici : le verdict vert de ces
deux gardes avait été cité comme **preuve que D2 et D5 tenaient**, dans trois documents.

**Corrigé le 10/09 — migration `021`.** Les deux gardes mesurent `tgtype`. ⚠️ **Les bits qui
comptent, pas l'égalité du masque** : exiger `tgtype = 9` interdirait d'ajouter un jour
`after delete or truncate`, et *un garde-fou qui rougit à tort finit par être contourné*.
**Mordu par la mutation exacte de l'auditeur.**

⚠️ **Deux enseignements de la manœuvre elle-même, et le premier est une faute.** J'ai joué la
mutation **sur la recette**, et ma restauration a laissé le déclencheur **non armé en
“always”** : `f_verifier_schema()` est passé à **2 anomalies** avant que je le réarme.
L'auditeur, lui, avait muté sur une copie du dépôt — il avait raison. Second enseignement, à
décharge : le contrôle `declencheur_desarmable` **a rougi le premier**, ce qui montre que le
garde de `019` n'était pas creux — il voyait l'armement, il ne voyait pas l'événement.

**Q-280 — la barrière de publication se contourne en un appel.** `POST /api/reprise` crée une
PSSI **« en vigueur » avec zéro approbation**, le déclencheur étant `before update` seul.
C'est la classe exacte du constat que D2 avait fermée : *une barrière qui ne vit que sur un
chemin ne voit pas le chemin d'à côté, et il y en a toujours un de plus.* **Non corrigé** —
et il ne pouvait pas l'être avant Q-281 : élargir la barrière à l'`insert` n'aurait été
vérifié par rien.

**Q-279 — le contrôle S7 en échec, et une phrase du registre démentie.** Un compte sans droit
d'export (`/api/export` → **403**) obtient `GET /api/rafraichir?depuis=…` en **200** avec un
**delta de journal nul**, quand `/api/donnees` laisse une trace. La ligne qui avait fermé
**Q-242** — « *elle ne se contourne pas en avançant `depuis`* » — est fausse.
⚠️ **Reproduit par l'orchestrateur, avec une nuance inscrite au registre** : le delta nul est
confirmé, mais la charge rendue était **vide** au rejeu — `rafraichir` ne rend que ce qui a
*changé*, et l'auditeur mesurait au lendemain de sa propre campagne d'écritures. **Le
mécanisme reste entier** : après un import ou une reprise, tout porte un `updatedAt` récent
et le jeu entier tombe dans la fenêtre non tracée. Le défaut n'est pas *« rafraichir rend
tout »*, c'est *« rafraichir ne trace rien »* — et la nuance devait être écrite, sans quoi la
prochaine session aurait déclaré le constat faux en ne le reproduisant pas.

**Q-283 vise le garde que j'avais posé la veille** (Q-257) : il mesure la **longueur** des
intitulés, pas leur originalité. Mutation : les 93 intitulés français d'ISO 27002 remplacés
par les 93 titres **officiels** ISO → **11 essais sur 11 au vert**, les titres officiels
faisant 29 signes contre 28 aux reformulations. Le garde attrape la reprise **longue** — un
export CSV — et laisse passer la reprise **courte**, qui est justement le risque que le §4.2
nomme pour l'Annexe A.

**✅ Ce qui tient, et c'est considérable** : banc **1822/1822 joué deux fois** (Q-251 ne
clignote plus), cloisonnement **107/107** sous `grc_app`, **50/50 en force RLS**, **sept
sondes inter-filiales sur les surfaces neuves → 404 sans oracle**, périmètre inforgeable sous
cinq formes, **31 écrans sur 31** dans un Chromium réel derrière l'Apache du dépôt **sans une
seule violation de CSP**, chaîne des pièces jointes rejouée contre ClamAV réel, `npm audit`
0 vulnérabilité, publication 81/81. **Zéro fuite entre filiales, pour le deuxième passage
consécutif.**

### Q-251 — un essai intermittent est un essai qu'on cesse de lire

**Le symptôme.** `test/import/lecture.test.mjs` rougissait une fois sur deux au banc
complet, en passant vert dix fois sur dix joué seul — y compris sous une charge
artificielle. Il mesure que le coût d'une lecture **ne quadruple pas quand l'entrée
double**, c'est-à-dire que le parcours XML est resté linéaire après la porte S6.

**Pourquoi les deux remèdes précédents ne pouvaient pas tenir.** Q-246 lui avait posé « le
meilleur de trois passes » des deux côtés, plus un plancher au dénominateur. Il a rougi le
lendemain. *Le remède traitait la dispersion ; le défaut était l'ÉCHELLE* — on comparait
deux grandeurs de l'ordre de la **milliseconde**, où le quantum de bruit de l'ordonnanceur
est comparable à la mesure. Aucune statistique ne stabilise un rapport de cette taille.

**La première issue proposée est mesurément impossible ici.** Le registre suggérait de
*grossir les tailles*. Mesuré : le lecteur refuse un classeur au-delà d'environ **3,5 Mio
décompressés** — 300 000 balises passent, **400 000 rendent « Ce classeur est trop
volumineux pour être analysé »**. La grande taille franchirait le plafond, et l'essai
mesurerait **un tout autre refus** en croyant mesurer une croissance.

**Ce qui est fait : grossir le TRAVAIL, pas l'entrée.** Chaque côté est joué *R* fois dans
un seul chronométrage, *R* étant **calibré à l'exécution** pour que la petite mesure
atteigne quelques dizaines de millisecondes. Mesuré : **33,6 ms → 58,7 ms** à R = 50, et
cinq rapports d'affilée entre **1,75 et 1,96** — là où la rédaction précédente balayait de
**1,0 à 2,9**. ⚠️ **Le seuil de 2,5 ne bouge pas** : ce qui change est la précision de la
mesure, pas la sévérité du verdict. Le relever à 3,5 aurait fait cesser à l'essai de
distinguer le linéaire du quadratique — c'est-à-dire l'aurait transformé en décor. Et le
calibrage est **calculé, pas écrit en dur** : une constante serait juste aujourd'hui et
fausse **en silence** le jour où le banc change de machine.

**Deux gardes neuves, et chacune a été trouvée en cassant quelque chose :**

1. **Un plancher.** Si la petite mesure retombe sous 15 ms, l'essai rougit **en nommant sa
   cause** au lieu de rendre un verdict sur un rapport de deux poussières.
2. **Un plafond unitaire de 100 ms.** Remis dans son défaut d'origine, le lecteur coûte des
   secondes par passe — et ma première rédaction **se figeait au lieu de rougir** (dix
   passes, six chronométrages). Un essai qui se fige est un essai qu'on finit par retirer.
   C'est la leçon déjà écrite dans `test/depot/cout-expressions.test.mjs` (`PLAFOND_MS`),
   appliquée ici parce qu'elle y manquait.

⚠️ **Le fichier jumeau n'avait pas le même défaut, ni donc le même remède.** Lui peut
élargir l'écart d'entrée — ×9 au lieu de ×3, pour un rapport attendu de ×70 —, ce que le
plafond du lecteur interdit ici. *Même symptôme, cause différente, remède différent* :
recopier le sien aurait été la treizième occurrence de « l'instance, pas la classe », par
l'autre bout.

**Éprouvé** : trois passages isolés verts, **trois bancs complets**, et la morsure vérifiée
en remettant le lecteur dans son défaut quadratique — il rougit désormais **en secondes**,
avec un message qui nomme la cause.

### ⚠️ Le commit `2818fc7` était rouge, et c'est le banc qui l'a dit

Il portait le CHANGELOG à 1812 essais **sans que le banc soit rejoué derrière**. Le
garde-fou du constat **Q-53** — *le même nombre au README §8, au bloc `npm test` du §5 et
au CHANGELOG* — a rougi aux trois bancs complets suivants, 1811/1812, de façon parfaitement
déterministe. Le README §8 est remis au réel, **révision mesurée `e98dc18`**, avec le compte
par famille relevé famille par famille : **api 283** (+11), **navigateur 174** (+7), somme
**1812**.

*« Vert » qualifie une révision, jamais un répertoire de travail* — la leçon du dépôt,
appliquée à ce dépôt par son propre banc. Le §8 le dit désormais lui-même, en dernière
ligne de son tableau de mesure.

### L18.2 b — le profil découverte cesse d'être une affaire d'exploitant

**Le défaut, en une phrase.** `install.sh --assistant` pose un profil **découverte** quand
l'exploitant répond « aucun annuaire » : ni AD, ni relais de messagerie, un certificat
auto-signé, un compte de secours pour toute porte d'entrée. Ce profil s'annonçait dans la
configuration et au `--diagnostic` — **deux endroits que seul l'exploitant regarde**.
L'utilisateur qui saisit ne voyait rien, alors que c'est **lui** qui décide de taper une
donnée réelle dans un outil qui sert de preuve en audit.

**Ce qui est livré.** Le serveur lit `CYBER_GRC_PROFIL` et le sert dans la **charte de
session** — donc dans `GET /api/session` **et** dans `POST /api/connexion`, que le
`CONVENTIONS.md` §26.2 exige identiques à l'octet près. Le champ est **toujours présent**,
jamais omis quand il vaut « production » : un champ absent laisserait le navigateur deviner,
et « je n'en sais rien » finirait par s'afficher comme l'un ou l'autre selon qui écrit le
code. La SPA en tire un bandeau, et **trois propriétés le distinguent des deux autres
bandeaux du produit** :

1. **Aucun bouton ne le ferme.** Les autres signalent un incident qu'on traite et qui passe ;
   celui-ci décrit ce que la machine **est**, et cela ne passe pas. Un bouton « masquer » est
   le geste exact par lequel on oublie un profil dégradé.
2. **Il s'imprime** — pas de classe `no-print`, contrairement à tous les autres. Une fiche de
   risque ou un registre RGPD tiré d'une installation de découverte quitte l'écran et
   circule ; sans la mention, il se présente comme une pièce d'audit ordinaire.
3. **Il est reposé à chaque écran**, et non posé une fois : le changement de langue le
   retraduit, et aucun rendu ne peut l'emporter.

⚠️ **Une valeur inconnue de `CYBER_GRC_PROFIL` REFUSE le démarrage.** C'est le point le
moins évident du lot et le plus important. La pente naturelle était de retomber sur
« production » — et une faute de frappe (`decouvert`, `Découverte`) aurait alors éteint le
bandeau **en silence**, c'est-à-dire produit le défaut exact que ce profil existe pour
empêcher, par le chemin le plus discret qui soit. Le `CLAUDE.md` §3 nomme la règle : une
table de valeurs n'est le bon outil que si son incomplétude **échoue bruyamment**. Une
valeur **absente**, en revanche, vaut « production » : c'est l'état de tout le parc
antérieur à L18, et un bandeau qui crie à tort apprend à ne plus être lu. La variable est
désormais **documentée dans `.env.example`** — elle y manquait, alors qu'`install.sh`
l'écrivait (le pendant du constat m-2 : une variable écrite et non documentée).

⚠️ **Deux leçons de méthode payées en écrivant les essais, et la première est un rejeu de
Q-210.** La première rédaction de `test/api/profil-installation.test.mjs` montait un
environnement **lui-même invalide** (`AUTH_LDAP_ACTIF=non` sans compte de secours) : le §1
« une valeur inconnue refuse le démarrage » passait **au vert en attrapant une erreur qui ne
parlait pas du profil**. Réparé, et **gardé** : un §0 exige que l'environnement de base
charge sans erreur, et le §1 exige qu'il n'y ait **qu'un seul problème**. La seconde : le
premier jet rangeait `DECOUVERTE` parmi les fautes de frappe — la lecture met la valeur en
minuscules, les capitales désignent donc bien le même profil, et c'est l'essai qui avait
tort. Ce qui est refusé, c'est ce qui ne **désigne** pas un profil connu.

**Éprouvé, et par la mutation.** 18 essais neufs — 11 côté serveur (`test/api/profil-
installation.test.mjs`), 7 dans un Chromium réel (`test/navigateur/profil-decouverte.test.mjs`,
qui mesure le **DOM rendu** : texte lisible, zéro bouton, survie à cinq écrans et au passage
en anglais, visibilité sous le **média d'impression émulé**, avec le fil d'Ariane pour
témoin — sans lui, un Chromium n'appliquant pas `@media print` rendrait l'essai vert sans
rien mesurer, c'est Q-108). *Un correctif accepté n'est pas un correctif sûr* : les quatre
propriétés ont été **cassées une à une** — champ retiré de la charte (9 échecs), bouton de
fermeture ajouté (1), `no-print` posé (1), repli silencieux sur « production » (2) — et le
banc a rougi à chaque fois.

**Mesuré à cette révision** : `npm test` → **1812 essais, 1812 passés** ;
`npm run verifier-types` propre ; `install.sh --maj` puis `--verifier-publication` →
**81 fichiers servis identiques au dépôt** ; `--diagnostic` → **12 conformes, 1 réserve**
(`SMTP_ACTIF=non`), **0 bloquant**. Sur la recette, le service annonce
`"profil":"production"` au démarrage **sans que la variable existe dans
`/etc/cyber-grc/env`** : la valeur par défaut tient sur la machine réelle, et le bandeau
reste éteint là où il doit l'être.

⚠️ **Ce n'est pas un passage de porte.** 18.2 b touche `src/` et la SPA : c'est la
**onzième livraison** à déclarer au **7ᵉ passage de S8**, qu'aucun auditeur indépendant n'a
encore vue.

### Les trois arbitrages du plan produit sont tranchés — deux lots neufs, L27 et L28

**A1 — l'IA : locale par défaut, externe possible et encadrée.** J'avais recommandé « un
modèle local ou rien ». L'utilisateur a tranché plus finement, et il a eu raison : refuser
tout appel externe, c'est décider à la place d'un client dont le DPO a peut-être déjà validé
un contrat cadre. La possibilité est donc conservée — **et le garde-fou est mis dans la
mécanique, pas seulement dans le texte.**

⚠️ **Un panneau d'avertissement seul ne suffit pas, et il faut le dire.** Un avertissement se
lit une fois, se coche, et se transmet à des gens qui n'étaient pas là. Ce qui sortirait ici,
ce sont des scénarios de risque, des écarts de conformité, des constats d'audit et des
incidents — **exactement l'inventaire qu'un attaquant voudrait**. Le lot **L27** pose donc
**six barrières**, dont l'avertissement est la **sixième** :

1. **désactivé par défaut, et impossible à activer depuis l'interface** — cela se fait dans
   `/etc/cyber-grc/env`, en root : la décision d'exporter la gouvernance d'un groupe
   n'appartient pas à l'utilisateur qui a la fiche sous les yeux ;
2. **`IPAddressDeny=any` ferme la sortie réseau** tant que l'exploitant n'ajoute pas le
   réseau du fournisseur. *Une barrière physique, pas une promesse* — et c'est le constat
   **Q-199** retourné en protection : là il avait livré L12 incapable d'envoyer, ici il
   empêche d'envoyer par accident ;
3. **destination déclarée**, certificat vérifié, **aucune redirection suivie** ;
4. **ce qui part est minimisé et MONTRÉ avant de partir** ; ne partent jamais le contenu des
   pièces jointes, le journal d'audit, l'annuaire des personnes, ni **rien d'une autre
   filiale que l'active** — liste appliquée **par découverte dans le catalogue**, jamais
   énumérée : une colonne ajoutée demain doit être exclue par défaut, pas incluse par oubli ;
5. **chaque appel journalisé** (`ia_externe`) — *une porte dérobée dont personne ne sait
   qu'elle a servi n'est pas une porte de secours* ;
6. **l'avertissement**, permanent tant que le mode est actif, repris en réserve au
   `--diagnostic`.

Plus : **activation par filiale, jamais pour le groupe entier** — vingt filiales dans
plusieurs pays n'ont pas un régime unique ; et quatre champs obligatoires disant **ce que
« de confiance » veut dire** (fournisseur, contrat, lieu d'hébergement, engagement de
non-réentraînement, qui a validé et quand), sur lesquels le `--diagnostic` rougit s'ils sont
vides. ⚠️ Ces champs **ne protègent rien techniquement**, et c'est assumé : ils existent pour
qu'au jour de l'audit, la question ait une réponse écrite **avant** d'être posée.

**A3 — le portail fournisseur exposé est VALIDÉ**, avec consigne de le pousser aussi loin que
possible. Lot **L28** : accès par **lien signé, daté, révocable, sans compte** — un compte,
c'est un mot de passe à réinitialiser, une énumération possible et une surface qui survit à
la campagne ; un lien expire tout seul. Un lien expiré rend **404, jamais 403** : *un 403
confirmerait que la cible existe*. Dépôt de preuve par **la** chaîne L6, ClamAV compris,
**sans variante simplifiée** — c'est ainsi qu'on se retrouve avec deux chaînes dont une seule
est éprouvée. Vhost, borne de corps et limiteur propres. Attestation rendue au fournisseur,
parce que c'est ce qui le fait répondre sérieusement : il y gagne quelque chose.

⚠️ **L28 est le premier composant du produit exposé hors VPN.** Il ne se joue **ni avant S8,
ni en même temps qu'un autre lot**, et sa porte **S15 rejoue la grille §4 entière sur ce seul
lot** — *en cas de doute sur ce lot, on ne livre pas*. L'export / réimport de L21.2 **reste
la voie de repli permanente**, pas un état transitoire : un fournisseur qui refuse un accès
en ligne doit pouvoir répondre quand même.

**Ce que je n'ai pas fait, et qu'il faut savoir** : je n'ai **pas** élargi A1 aux « services
tiers » en général. L'utilisateur a autorisé une **IA** externe. La notation externe de
fournisseurs (#33) deviendrait techniquement atteignable par la même mécanique — c'est écrit
au §6 comme une **question à reposer**, pas comme une permission acquise.

**Cible de la grille marché recalculée : 76 ✅ · 2 🟡 · 8 ❌** après les douze lots, contre
71 · 5 · 10 avant ces deux arbitrages. Les huit non-objectifs sont désormais **nommés un par
un** au `PLAN_PRODUIT.md` §9 — sans quoi « non-objectif » n'est qu'un mot pour « oublié ».

### L18.1 / L18.2 a — `install.sh --assistant` : six questions, et un profil découverte qui crie

**Le mode non interactif n'est pas remplacé, il est alimenté** : l'assistant écrit exactement
ce qu'un exploitant aurait écrit à la main, et l'installation qui suit est la même — aucun
chemin de code particulier.

Il **exige un terminal** et échoue sans, plutôt que de lire des réponses vides sur une entrée
fermée : une invite qu'on ne voit pas devient un `yes |` dans un script d'exploitant, et ces
réponses décident de qui entrera dans le produit. Il **n'écrit rien avant le récapitulatif** —
on relit, on confirme, puis on écrit.

**Le profil découverte** (répondre « non » à l'annuaire) pose une installation sans AD, sans
courriel, avec un **compte de secours** et un **certificat auto-signé** — sans lui, Apache
refuse de démarrer et la promesse « voir le produit en dix minutes » ne tiendrait pas.
⚠️ Il s'annonce partout où il peut : `CYBER_GRC_PROFIL=decouverte` dans la configuration, une
réserve au `--diagnostic`, et un bandeau dans le produit (**18.2 b**, à venir — seul sous-lot
de L18 qui touche `src/`). *Un profil dégradé qu'on ne voit pas devient une production par
oubli.*

**L'empreinte du compte de secours est calculée par `dist/auth/secours.js`**, c'est-à-dire par
le code du produit, et le mot de passe y arrive par l'**entrée standard** — un argument de
commande est lisible par `ps` de tout compte de la machine. Recalculer le format
`scrypt$N$r$p$sel$empreinte` en shell aurait donné une seconde écriture, et **deux écritures
d'un format finissent toujours par ne plus dire la même chose** : le jour où les paramètres
changent, la copie reste en arrière et le compte de secours cesse de fonctionner sans un mot.

**Éprouvé par pseudo-terminal**, dans les deux branches, avec des saisies invalides — URL sans
schéma, mot de passe de moins de douze caractères, code de filiale « GROUPE » : les trois refus
bouclent. Refus final → **aucun fichier écrit**, vérifié.

`test/deploiement/assistant.test.mjs`, 4 essais, **les quatre mordus**. Le bloc d'écriture est
borné par des ancres de banc (`# >>> banc: assistant-ecriture <<<`) : l'installation ne peut pas
être jouée par un essai, mais **la décision « quelle variable prend quelle valeur dans quelle
branche » est de la logique pure**, et c'est elle qui décide si un profil découverte peut passer
pour une production.

⚠️ **Le mécanisme de substitution comptée du banc a attrapé ma propre erreur** : j'avais déclaré
7 occurrences de `/etc/ssl/cyber-grc` dans le bloc, il y en a 9, et l'essai a refusé de jouer
contre autre chose que ce qu'il annonçait.

### L18.4 — déjà livré : `groupes-ad.sh --powershell` existait, et le défaut était ailleurs

Le plan prévoyait d'écrire le script PowerShell des groupes AD. **Mesuré : il existe déjà**, il
est idempotent, il ne supprime jamais rien — joué sur la recette, 23 groupes pour 2 filiales et
8 profils, avec un en-tête qui nomme chacune de ses sources.

**Le défaut réel était de découvrabilité**, et il était de mon fait : `filiales.conf.exemple`
documentait `--powershell` depuis toujours, mais le `docs/INSTALLER.md` que je venais d'écrire
renvoyait vers `--csv`, moins utile. Corrigé — le guide passe de sept commandes à **cinq**.

⚠️ **Troisième fois dans ce seul lot que la mesure contredit le plan** : 18.4 déjà livré, 18.5
déjà atteint, et le chiffre de 74 variables faux. *Un plan écrit sans mesurer ne se trompe pas
au hasard : il fait travailler sur des problèmes qui n'existent pas, et il le fait avec
conviction.*

### Q-251 — Q-246 est ROUVERT : le correctif du 07/09 n'a pas tenu

`test/import/lecture.test.mjs:297` a de nouveau rougi au banc complet : *« 2× d'entrée doit
coûter ~2×, pas ~4× (1,02 ms → 2,94 ms) »*, rapport **2,88 contre un seuil de 2,5**. Le fichier
porte pourtant déjà le meilleur de trois passes des deux côtés, posé la veille et déclaré fermé.

**Mesuré** : 10 passages isolés → 10 verts, *y compris sous une charge artificielle de quatre
boucles concurrentes* ; **2 bancs complets → 1 rouge, 1 vert** (1793/1794 puis **1794/1794**).

⚠️ **Pourquoi le remède ne pouvait pas suffire** : le meilleur de trois passes retire la
dispersion, mais **on mesure un rapport sur des grandeurs de l'ordre de la milliseconde**, où le
quantum de bruit est comparable à la mesure. *Le remède traitait la dispersion ; le défaut est
l'échelle.* Et il ne faut **pas** relever le seuil : à 3,5 l'essai cesserait de distinguer le
linéaire du quadratique — il deviendrait le décor qu'il a été écrit pour ne pas être.

Inscrit au `docs/PLAN_EXECUTION.md` §7 avec ses deux issues honnêtes. **Rien de tout cela ne
vient du lot L18** : le fichier n'a pas été touché.

### L18.3 — `install.sh --diagnostic` : douze sujets, une commande, et chaque ligne dit quoi faire

**Premier livrable du `PLAN_PRODUIT.md`.** Vérifier une installation demandait de connaître
et de jouer dans le bon ordre : `systemctl is-active` sur quatre unités,
`--verifier-publication`, une requête sur `f_verifier_schema()`, une autre sur la propriété
de la base, un `openssl x509 -checkend`, deux `df` — et de savoir que le contrôle de
publication **n'est pas joué par l'installation** (constat **Q-103**). Autrement dit : *la
vérification supposait de savoir déjà ce qui casse*, ce qui est le contraire d'un
diagnostic.

`--diagnostic` **ne modifie rien** — ni `apt`, ni `systemctl start`, ni DDL — et rend
**0** (conforme), **1** (réserves) ou **2** (bloquant), pour une supervision. Mesuré sur la
recette réelle : douze sujets, `SMTP_ACTIF=non` en unique réserve, code **1**.

**Trois règles qu'il s'impose, et une seule est évidente :**

- il ne modifie rien — donc il est jouable sur une production qu'on n'ose pas toucher,
  c'est-à-dire dans la situation même où l'on en a besoin ;
- **chaque ligne dit QUOI FAIRE** — un diagnostic qui énonce un symptôme sans sa réparation
  déplace le travail au lieu de le faire. Un essai l'exige de **tout** verdict bloquant ;
- **il va jusqu'au bout.** ⚠️ **Et ce n'est pas théorique : le premier jet appelait
  `valider_identifiant` pour éprouver `BASE_NOM` — laquelle appelle `echec`, donc
  `exit 1`.** Le diagnostic serait sorti au cinquième contrôle sur douze, en taisant les
  sept suivants **et en rendant « réserve » sur ce qui est un bloquant**. Le défaut a été
  trouvé en jouant le mode, pas en le relisant.

**Ce qui est réutilisé plutôt que recopié**, et c'est l'essentiel de ce lot :

- le contrôle de publication est **extrait en fonction** `controle_publication()` :
  `--verifier-publication` et `--diagnostic` posent la même question, et deux copies de la
  liste blanche des types publiables divergeraient en silence — le motif exact du constat
  **Q-31**, où cette liste et le `<FilesMatch>` du vhost sont tenus d'aller par paire ;
- les garde-fous du schéma passent par **le seul** `f_verifier_schema()` (§18.4) : les
  énumérer ici rouvrirait la liste écrite à la main que ce point d'appel existe pour
  supprimer ;
- l'URL contrôlée est **« / »**, le chemin que l'utilisateur emprunte — constat **Q-36** :
  la vérification prescrite interrogeait `/index.html` et est restée **au vert** pendant que
  « / » rendait 403 ;
- la chaîne du journal applique, au-delà de 200 000 entrées, le **contrôle rapide que le
  §12 prescrit**, et `chaine_tronquee` n'y compte pas (constat **Q-123** : un garde-fou qui
  crie sur le cas nominal est un garde-fou qu'on apprend à ignorer) ;
- l'annuaire est éprouvé **joignable**, jamais authentifié : le verrouillage est à cinq
  tentatives, et un diagnostic qui verrouille un compte réel serait pire que pas de
  diagnostic.

**Un défaut d'affichage corrigé, et il n'est pas cosmétique dans ce lot-ci** : `printf`
compte des **octets**, et « schéma » comme « url d'entrée » portent des accents à deux
octets — les colonnes sortaient désalignées. Dans un mode dont l'objet est de rendre l'état
lisible **d'un coup d'œil**, c'est un défaut du mode. On compte en caractères.

**`test/deploiement/diagnostic.test.mjs`, 4 essais — et les quatre ont été MORDUS** :
option retirée de l'analyse, liste des types recopiée, `echec` glissé dans un contrôle,
bloquant privé de sa réparation. La deuxième morsure a d'abord été **mal choisie** — elle
créait `TYPES2=`, que le contrôle n'a aucune raison d'attraper — et l'essai est resté vert :
rejouée avec une vraie duplication, elle rougit. *Un essai qu'on n'a pas su casser n'est pas
un essai qu'on a prouvé.*

**Banc : 1790 essais, 1790 passés** (1786 avant).

⚠️ **Un diagnostic vert NE VAUT PAS passage de porte**, et le mode le dit lui-même en
dernière ligne : il constate une machine, il n'éprouve ni le cloisonnement sous sondes
hostiles, ni la paraphrase des catalogues. S7 et S8 restent dues.

### L18.5 — le chiffre du plan était faux, et le corriger a changé le travail

Le `PLAN_PRODUIT.md` annonçait « **74 variables d'environnement** » et bâtissait un sous-lot
entier sur ce chiffre : *réduire la surface de configuration*, objectif « moins de 12 ».
**Mesuré le 08/09/2026** : `src/config/index.ts` en lit **68**, et surtout `install.sh` n'en
réclame que **SIX** à l'exploitant — `SERVEUR_URL_PUBLIQUE`, quatre valeurs d'annuaire si
l'annuaire est actif, `SMTP_HOTE` si les relances le sont. Deux sont engendrées, quatre sont
exigées par le serveur, **toutes les autres portent un défaut sûr**.

L'objectif était donc **déjà atteint**, et le défaut n'était pas le nombre : c'est que
**rien ne dit lesquelles**. 18.5 devient « documenter les six », et c'est ce que
[`docs/INSTALLER.md`](docs/INSTALLER.md) fait en tête de page.

⚠️ *Un plan bâti sur un chiffre supposé fait travailler sur le mauvais problème, et il le
fait avec conviction.* C'est le §0 du `CLAUDE.md` appliqué à un plan plutôt qu'à un
environnement.

### L18.6 — `docs/INSTALLER.md` : installer en dix minutes, sans ouvrir un autre fichier

Une page : le prérequis, les six valeurs, dix commandes, les trois pannes de démarrage avec
leur réparation, la mise à jour, la désinstallation, et **ce que l'installateur ne fera pas
à votre place** (il n'écrit pas dans l'Active Directory, il ne charge aucune donnée de
démonstration, il ne bricole pas une base existante en silence). `GUIDE_EXPLOITATION.md` §1
y renvoie et remplace ses trois commandes de vérification par `--diagnostic`.

### Le produit est comparé au marché, et la suite est planifiée — `PLAN_PRODUIT.md`

**La question « où sommes-nous par rapport à ce qui se fait de mieux ? » n'avait jamais été
posée avec des chiffres.** Elle l'est le 08/09/2026, contre les plateformes de référence
(Tenacy, Egerie, CISO Assistant, Make IT Safe ; Vanta, Drata, OneTrust, ServiceNow IRM,
Archer, MetricStream, AuditBoard, Hyperproof, LogicGate, Centraleyes).

Deux documents neufs, aucune ligne de code :

- **[`docs/COMPARATIF_MARCHE.md`](docs/COMPARATIF_MARCHE.md)** — les **86 fonctionnalités**
  de l'état de l'art, chacune **mesurée dans le dépôt** et non lue dans la documentation :
  **35 ✅ · 17 🟡 · 34 ❌**. ⚠️ Trois pièges de mesure y sont consignés, dont celui-ci : les
  mots « MFA », « vulnérabilité » et « sensibilisation » **existent** dans le dépôt, mais
  uniquement comme **contenu des référentiels** — des choses *à évaluer*, jamais des
  fonctions du produit. Comptés absents.
- **[`docs/PLAN_PRODUIT.md`](docs/PLAN_PRODUIT.md)** — dix lots (**L17 → L26**), leurs
  critères d'acceptation mesurables, cinq portes neuves (**S10 → S14**), huit non-objectifs
  **écrits avec leur motif**, et trois arbitrages laissés à l'utilisateur (IA locale ou
  rien ; jeu de découverte ; portail fournisseur exposé).

**Ce que le chiffre brut cache, et qui est le point central** : les 34 absences ne sont pas
réparties — **19 tiennent dans quatre blocs entiers** (intégrations, tiers, vulnérabilités,
IA). Hors ces quatre domaines, la couverture est de **~70 %**, et sur **sept points mesurés
le produit dépasse le marché** — dont le cloisonnement par RLS forcée et le journal chaîné
en ajout seul, deux garanties que la majorité des plateformes SaaS ne peuvent pas offrir.

⚠️ **Et l'ordonnancement prime sur l'envie d'avancer.** Le §0 bis du plan l'écrit : **aucun
lot L17+ ne se joue avant que S7 et S8 soient franchies**. Six passages de S8, six refus ;
S7 jamais jouée ; sept livraisons non auditées. Un plan produit qui empilerait dix lots
par-dessus ferait exactement ce que le chantier a appris à ne plus faire. Seul **L18
(installation)** échappe à la règle, et uniquement parce qu'il ne touche **ni `src/`, ni le
schéma** — il n'ouvre aucune surface d'audit.

**Ce que L18 corrige, mesuré** : installer exige aujourd'hui d'écrire `filiales.conf` à la
main *avant* de lancer quoi que ce soit, de créer 23 groupes Active Directory, puis de
lancer une seconde commande pour vérifier ce qui est servi. `install.sh` s'arrête en code 2
sur une configuration incomplète — ce qui est juste, mais ne dit pas comment la compléter.

### L'empreinte cesse d'être un commentaire : elle s'affiche, et elle est vérifiée

**Une promesse à moitié tenue depuis le lot L6, mesurée le 08/09/2026.**

Le contrôle n° 6 de la chaîne de dépôt calcule le SHA-256 **sur ce qui a été écrit** —
`empreinteDe()` relit le disque plutôt que d'empreinter ce qui a été reçu. Le commentaire de
la colonne en tire la promesse : *« c'est ce qui transforme une pièce jointe en preuve
vérifiable — un auditeur peut s'assurer qu'un rapport n'a pas été remplacé après coup. »*

Mesuré par balayage de `src/` : **`empreinteDe()` n'avait qu'UN SEUL appelant**, le dépôt.
Deux conséquences, et la seconde est la vraie :

- l'empreinte n'était **affichée nulle part**. Le panneau la chargeait en mémoire et ne la
  montrait pas : impossible de la recopier pour la comparer ;
- **rien ne la revérifiait.** La ré-analyse périodique est *antivirale* — elle repasse le
  fichier à ClamAV, elle ne le compare pas à son empreinte. Le produit ne savait pas répondre
  à « le fichier sur le disque est-il encore celui qu'on a empreinté ? », et un écart —
  corruption, restauration partielle, substitution — **n'aurait été vu par personne**.

C'est la définition d'un garde-fou qui n'est qu'un commentaire (`CONVENTIONS.md` §18.4), et
il portait la promesse centrale du coffre documentaire.

**Ce qui est livré** (migration `020`) :

- **l'empreinte s'affiche**, sous le nom du fichier, repliée sur douze caractères et
  **dépliable en place**, en texte sélectionnable. ⚠️ Pas de `navigator.clipboard` : il est
  indisponible hors contexte sécurisé et refusable par l'utilisateur, et un bouton
  « Copier » qui ne copie rien serait pire que pas de bouton ;
- **un bouton « Vérifier »** par pièce délivrable → `GET …/:pieceId/integrite`. Le serveur
  relit le fichier, le hache, et rend `conforme`, `ecart` ou `fichier_absent`, avec les deux
  empreintes. ⚠️ Déclarée **`lire`**, jamais `ecrire` — même arbitrage que le constat Q-158 :
  la ligne de partage est l'ACTE, et priver l'auditeur du seul contrôle qui l'intéresse
  serait absurde. Le coût est **strictement inférieur à celui de la délivrance**, déjà
  ouverte au même appelant : celle-ci lit le fichier *et* l'envoie sur le réseau ;
- **un balayage périodique**, greffé sur le minuteur qui porte déjà la ré-analyse — 30 jours
  et 2 000 pièces par passage, contre 90 et 500 pour l'antivirus : hacher ne demande ni
  démon ni réseau. Il **inscrit** son verdict et sort en code 1 sur un écart, pour que
  `systemctl status` le montre ;
- **une vingt-deuxième action de journal**, `verification_integrite`. Les trois verdicts sont
  tracés, pas seulement les mauvais : un journal qui ne garderait que les mauvaises nouvelles
  ne dirait pas *quand* une pièce a été vérifiée pour la dernière fois.

⚠️ **La route ne persiste rien, et c'est un arbitrage.** Écrire le verdict exigerait la
politique d'écriture de `pieces_jointes` — *la filiale ACTIVE*. Une session de périmètre
Groupe qui vérifie la pièce d'une filiale voisine, qu'elle a le droit de **lire**, verrait
l'`update` toucher zéro ligne : le produit répondrait « vérifiée » sans avoir rien inscrit.
La persistance appartient donc au balayage, qui s'exécute sous le périmètre de chaque filiale.

⚠️ **Ce que le dispositif ne prouve pas, et il faut le dire.** Qui peut écrire dans le magasin
peut aussi mettre le `sha256` à jour en base. Il attrape la corruption, la restauration
partielle et la substitution faite **hors de l'application** — pas un adversaire qui tient les
deux. L'écran ne dit donc jamais « intégrité garantie ».

**Le contrat est écrit, pas seulement le code** : `backend/db/CONVENTIONS.md` **§31.5** —
*« l'empreinte est rapprochée, sinon elle n'est qu'un commentaire »* — et le
`docs/PLAN_SERVEUR.md` §1.6, dont la promesse était à moitié tenue depuis L6, porte
désormais ce qui la tient. Les deux disent aussi ce que le dispositif **ne** prouve pas.

#### Et un défaut de la veille, trouvé en écrivant celui-ci

`normaliserListe()` du panneau **filtre** : elle reconstruit chaque pièce champ par champ, et
tout champ absent de sa liste est jeté. `en_vigueur` et `version_piece` — livrés la veille,
servis par la route, affichés par le gabarit — **y avaient été oubliés**. Le badge « En
vigueur » et la colonne Version seraient restés **vides sur la recette**, sans une erreur. Ni
le banc navigateur, qui façonne ses réponses, ni les essais de module, qui vérifient qu'un
écran se rend, ne pouvaient le voir : le défaut vit **entre la route et le panneau**.

Corrigé, et fermé à la classe : `test/pieces/champs-servis.test.mjs` prend la charge **réelle**
d'une pièce servie par la vraie route, extrait du texte du panneau **les champs qu'il lit**
(`piece.<nom>`), et exige que l'intersection traverse la normalisation. Aucune liste n'est
écrite ; un champ neuf servi *et* affiché est réclamé bruyamment, un champ servi et jamais lu
ne l'est pas.

### Vague 9, actions **D1**, **D4** et **D5** : la gestion documentaire, et la fin d'un champ qui pouvait mentir

Le lot L6 avait livré le **coffre** — dépôt, huit contrôles, ClamAV, empreinte SHA-256,
quarantaine, délivrance par l'application seule. Ce qui manquait n'était pas le stockage,
c'était la **gestion** : savoir laquelle des pièces déposées fait foi, ne pas confondre un
fichier détenu ici avec une référence vers ailleurs, et ne pas publier une politique que
personne n'a validée.

#### D1 — la version en vigueur (migration `018`)

`documents.version_document` était une **saisie libre**. On y tapait « 2.1 » et l'on déposait
le PDF de la 1.4 ; rien ne rapprochait les deux. Dans un outil produit en audit ISO 27001,
c'est la pire forme de faux : il est *plausible*.

Désormais **la version d'un document est celle que porte la pièce marquée « en vigueur »**.
Deux colonnes sur `pieces_jointes`, et pas une de plus : `en_vigueur` (laquelle fait foi) et
`version_piece` (le numéro que le déposant donne **à ce fichier**, au moment du dépôt). Les
autres pièces ne disparaissent pas : elles deviennent l'**historique**, toujours
téléchargeable — c'est justement ce qu'un auditeur demande.

Quatre garanties, et chacune vit à un seul endroit :

- **une seule pièce fait foi** — index unique **partiel** `uq_pieces_jointes_en_vigueur`. Il
  porte `filiale_id`, et ce n'est pas un ornement : `documents` est une table **mixte**, une
  politique de portée Groupe peut recevoir les pièces de plusieurs filiales, et une unicité
  globale ferait qu'une filiale reçoive un doublon **causé par une ligne invisible** d'une
  autre — c'est le constat `Q-2` (`CONVENTIONS.md` §19.1). Conséquence assumée : sur un
  document Groupe, chaque filiale désigne la version en vigueur parmi **ses** dépôts ;
- **rien de non délivrable ne fait foi** — `ck_pieces_jointes_en_vigueur` : un fichier en
  quarantaine ne peut pas être la version officielle d'une PSSI ;
- **une pièce qui CESSE d'être délivrable est démise** — déclencheur
  `trg_pieces_jointes_en_vigueur`. ⚠️ Sans lui, la **ré-analyse antivirale** échouerait sur la
  pièce en vigueur qu'elle veut mettre en quarantaine : on aurait fermé un défaut documentaire
  en bloquant le dispositif antimalware ;
- **la fiche dit la version du fichier** — `POST /api/pieces/:entite/:entiteId/:pieceId/en-vigueur`
  recopie `version_piece` sur la fiche dans la **même transaction**, et **échoue en entier**
  si elle ne peut rien y écrire (politique de portée Groupe vue depuis une filiale). Laisser
  passer donnerait « en vigueur : 2.1 » au panneau des pièces et « version : 1.4 » sur la
  fiche, tous deux sans erreur — deux réponses à la même question.

À l'écran : une colonne **Version**, un badge **En vigueur**, un bouton « **Faire foi** », un
champ de version au dépôt, et le champ « Version » de la fiche qui passe en **lecture** dès
qu'un fichier fait foi — `readOnly` et jamais `disabled`, un champ désactivé n'étant pas
envoyé par le formulaire, ce qui effacerait la version au premier enregistrement.

⚠️ **L'essai attaque la base en direct, et c'est le point qui compte** : la route démet avant
de promouvoir, elle resterait donc verte **l'index retiré**. Deux `update` dans une seule
transaction exigent le `23505` ; la mutation a été jouée, l'essai rougit.

#### D4 — « emplacement » est assumé, et étiqueté pour ce qu'il est

Le champ est **conservé** — le retirer ferait perdre la valeur à la reprise d'un export
antérieur, donc exigerait une colonne de recueil : on l'aurait retiré pour le remettre sous un
autre nom. Ce qu'exigeait D4, c'est qu'il **ne se confonde plus** avec une pièce détenue par
l'application : il devient « **Document resté ailleurs** », avec la note « référence externe —
le fichier n'est pas détenu par l'application », et le commentaire de colonne le dit à qui
écrit une route.

⚠️ **Et la phrase qui mentait est retirée.** « L'application ne stocke pas les fichiers »
figurait à trois endroits de cet écran ; elle était vraie du produit navigateur et **fausse
depuis le lot L6**. C'est elle qui empêchait de chercher le panneau des pièces jointes — ce
qui est arrivé pour de bon. Un essai garde les deux sens.

#### D5 — une politique ne se publie pas toute seule (migration `019`)

Le lot L8 livrait le circuit d'approbation, et il le livrait bien. **Mais rien ne le reliait au
document** : on pouvait laisser le circuit à mi-chemin, ouvrir la fiche, choisir « en vigueur »,
enregistrer. À la question d'audit *« qui a validé cette PSSI ? »*, le produit répondait
« personne, mais elle est en vigueur ».

Statut neuf « **en validation** », et déclencheur `trg_documents_publication` levant **`GRC06`**.
⚠️ **La lettre du critère laissait la porte ouverte** — il suffisait de repasser par
« brouillon » ; la règle posée exige donc une étape `publication` approuvée **dès qu'un circuit
existe**. Le refus est **journalisé** en `refus_autorisation`, avec le *gabarit* de route et
l'identifiant du document : un refus muet ne se distingue pas d'une absence de tentative, et
c'est la tentative qui intéresse un auditeur.

L'**encart du circuit** — livré par L8, et que **personne n'appelait** — est enfin monté sur la
fiche document.

⚠️ **Ce que la barrière ne fait pas, et c'est écrit plutôt que passé sous silence** (constat **`Q-247`**) : elle
ne vérifie pas que l'approbation porte encore sur le **contenu actuel**. C'est `empreinte_objet`,
tenue par L8 et affichée par l'encart ; la refaire dans le déclencheur obligerait à recopier
`COLONNES_HORS_EMPREINTE` en SQL — deux listes d'une même exclusion, qui finiraient par ne plus
dire la même chose.

**Deux garde-fous de schéma neufs**, branchés seuls par la découverte de `f_verifier_schema()` :
`f_verifier_piece_en_vigueur()` et `f_verifier_publication_documents()`. Les sept mutations ont
été jouées une par une — index retiré, index sans `filiale_id`, contrainte retirée, déclencheur
retiré, déclencheur désarmé, statut retiré du `check`, trace débranchée — et chacune fait rougir.

#### Un défaut trouvé en chemin, et fermé à la classe

En relisant l'arborescence après coup : `src/reprise/index.ts` valide chaque champ énuméré
d'un export `grc-backup` contre une liste **écrite à la main**, et cette liste ne connaissait
pas « en validation ». **Rien ne l'aurait dit avant qu'un exploitant restaure un export
parfaitement légitime et se le voie refuser** — c'est-à-dire au moment où l'on a le moins
envie d'un défaut. Le défaut ne vivait ni dans la migration ni dans la reprise : **entre les
deux**, motif rencontré plus de dix fois sur ce chantier.

La liste est corrigée, et surtout **les vingt et une énumérations sont désormais gardées d'un
coup** (`test/reprise/enumerations.test.mjs`) : elles sont confrontées aux `check` du schéma,
**découverts dans `pg_constraint`** — aucune correspondance collection → table → colonne n'est
recopiée, elle serait une troisième liste à tenir dont l'omission serait silencieuse. Le
contrôle porte sa propre morsure : on lui pose une dérive et l'on exige qu'il la voie.

**Reste D3**, la recherche : elle **ne se joue pas avant que la porte S8 soit franchie**. Une
recherche est un **oracle**, c'est la surface la plus propice à une fuite entre filiales.

### Serveur — vague 9, action **D2** : une pièce jointe suit son porteur, quel que soit le chemin

**Constats `Q-232` et `Q-233` fermés — à la CLASSE, pas à l'instance.**

`pieces_jointes` désigne l'enregistrement qu'elle documente par un couple
(`entite_type`, `entite_id`) **sans clé étrangère** : le schéma ne *peut* pas cascader. Le
correctif du constat précédent (`Q-230`) avait pris le relais **dans une route** — celle que
l'URL nomme. Cinq chemins sur six lui échappaient, et la porte S8 les a mesurés : supprimer un
scénario PRA emportait son test et **laissait la pièce du test**, `GET` rendant *200 avec le
contenu du document* ; la reprise « remplacer » vidait **seize collections sans en retirer
une seule**.

⚠️ **Sixième fois sur ce chantier qu'un correctif traite l'instance au lieu de la classe.**
Le remède demandé était explicite — *« un seul endroit que tous les chemins traversent, pas
six correctifs »*. Il y en a deux, de part et d'autre du `commit`, et c'est nécessaire :

- **la base, pour la ligne** — migration `017`, `f_pieces_suivent_leur_porteur()` posée
  `after delete` sur **32 tables porteuses DÉCOUVERTES dans le catalogue**, jamais récitées.
  Elle voit la suppression directe, la cascade du schéma, la purge de la reprise, la purge
  RGPD, et jusqu'à un `delete` tapé dans `psql` ;
- **l'application, pour le fichier** — le déclencheur ne peut pas toucher au disque, et
  l'ordre n'est pas indifférent : *la ligne d'abord, le fichier après le commit*, sans quoi
  une transaction annulée laisserait une ligne pointant dans le vide, c'est-à-dire une preuve
  d'audit perdue. Il inscrit donc le chemin dans `pieces_a_purger`, que le crochet `onSend`
  vide pour **toutes** les routes à la fois, et que le minuteur quotidien rattrape après une
  panne.

**Ce qui est éprouvé, et comment.** Les six chemins ne sont pas écrits à la main : ils sont
**dérivés de `pg_constraint`** — tout `on delete cascade` entre deux tables porteuses —, si
bien qu'une septième cascade entrerait seule dans le balayage. Après chacun : **0 ligne
orpheline, 0 fichier résiduel, `GET /api/pieces/…` → 404**, file de purge vide. Les deux
moitiés sont **mordues** : déclencheur désarmé → la pièce survit ; balayeur neutralisé →
quatre essais rougissent. Le garde-fou `f_verifier_declencheurs_pieces()` vérifie **dans les
deux sens** (toute table porteuse porte son déclencheur ; toute valeur de `type_entite` sans
table est portée en alias) et il est joué par le point d'appel unique.

> ⚠️ **CE QUI CHANGE POUR L'EXPLOITANT.** Reprendre un export `grc-backup` en mode
> **« remplacer »** détruit désormais les pièces jointes des enregistrements remplacés,
> fichiers compris — le fichier `grc-backup` ne les transporte pas et ne les rendra pas.
> **Sauvegardez le répertoire des pièces jointes avant toute reprise « remplacer ».**
> `docs/GUIDE_EXPLOITATION.md` §4 bis. Le mode « fusionner » n'est pas concerné.

Deux règles nouvelles, écrites au `backend/db/CONVENTIONS.md` :

- **§8.1** — *le relais d'une cascade que le schéma ne peut pas exprimer se prend dans la
  base, sur chaque table porteuse, jamais dans les routes. Une route ne voit que son chemin ;
  il y en a toujours un de plus.*
- **§15** — code d'erreur **`GRC05`** : quand une pièce du porteur supprimé appartient à une
  autre filiale, la base **refuse la suppression** plutôt que de laisser une orpheline.

⚠️ **Ce que D2 ne fait PAS, et il faut le dire** : il **arrête l'hémorragie, il ne ramasse
pas ce qui est déjà par terre.** Une installation qui a vécu avec le défaut peut porter des
lignes `pieces_jointes` sans porteur et des fichiers sans ligne ; les recenser demande une
**réconciliation disque ↔ base**, qui est la réserve **R5** de la porte S8 et reste ouverte.
La file `pieces_a_purger` en est la moitié facile — elle recense ce qui est **su** — et rien
de plus.

⚠️ **Mesuré avant d'écrire, et cela a changé la conception** : une politique de suppression
qui appelle `f_filiale_ecriture()` lève `GRC04` **même quand aucune ligne n'est candidate** —
la fonction est évaluée par le scan, pas par la ligne. Un déclencheur posé sur `sessions`
aurait donc fait échouer la purge des sessions expirées. Les tables du **substrat** n'en
portent pas, et le banc compare l'énumération que la route de dépôt accepte aux tables
équipées : c'est la couture entre les deux moitiés de la règle.

#### Et un défaut trouvé **en publiant** — `Q-245`

`install.sh --maj` **s'arrêtait en code 2** au moment de prendre le cliché d'avant-migration :
`pg_dump` s'y connectait comme `grc_proprietaire`, la RLS est **forcée propriétaire compris**,
ce rôle ne porte pas `BYPASSRLS`, et `pg_dump` pose `row_security = off`. Il s'arrêtait donc
net sur la première table cloisonnée.

⚠️ **Ce bloc ne s'exécute que lorsqu'une migration est en attente** — c'est-à-dire au seul
moment où il sert, et presque jamais autrement. Aucune migration n'en avait été en attente
depuis que la RLS est forcée : *un contrôle qui ne s'exécute pas est un contrôle dont on
ignore le verdict.* Le cliché se prend désormais sous le **superutilisateur**, comme la
création de la base.

⚠️ **Et la sortie de secours évidente était un piège** : `--enable-row-security` aurait fait
passer `pg_dump` en lui faisant rendre un cliché **silencieusement amputé** de toutes les
lignes cloisonnées. Une sauvegarde qui perd des lignes sans le dire est pire que pas de
sauvegarde — on lui fait confiance. Le cliché est en outre **ouvert** et non plus seulement
compté : sa ligne de fin est cherchée, faute de quoi il est détruit (même motif que Q-223).

#### Et un essai intermittent, réparé à la classe — `Q-246`

`test/import/lecture.test.mjs` mesure un **rapport** de temps en une seule passe. C'est
exactement ce que les constats `Q-225` et `Q-227` avaient corrigé sur `cout-expressions.test.mjs`
— **et le remède n'avait été posé que sur le fichier qui avait rougi**, pas sur son jumeau.
*L'instance, pas la classe*, pour la septième fois. Il rougit au banc complet et passe seul.

Corrigé par **le meilleur de trois passes, des deux côtés**. ⚠️ Le raisonnement compte plus
que le correctif : sous charge, une mesure de temps ne peut être que **trop grande**, et sur
un rapport c'est doublement traître — un bruit sur la **petite** taille écrase le rapport et
rend l'essai **vert par accident**, c'est-à-dire qu'un quadratique passerait.

### Serveur — vague 7 : L13 cycle de vie, L12 notifications, L10 internationalisation

**Trois lots, et chacun a trouvé dans son sujet un défaut que le contrat n'avait pas prévu.**

#### L13 — sortie de filiale, purge RGPD, rétention du journal

Le schéma portait déjà tout : `statut`, `date_sortie`, la contrainte qui exige la date, et
`f_filiales_actives()` qui exclut d'office une filiale non active de tout périmètre. **Aucune
migration.**

⚠️ **Le constat le plus grave a été trouvé AVANT la livraison** (**Q-187**) : déclarer la
sortie en `administrer` aurait remis **l'export complet d'une filiale** à un profil
Administration **dépourvu de `GRC-EXPORT`** — `deciderAcces` ne vérifie le droit d'export que
si l'action déclarée est `exporter`. C'est la moitié exacte du constat **Q-89** — *lire n'est
pas exporter* — un an après, par un autre chemin.

Trois autres qui touchent la promesse centrale du produit :

- **Q-188** — archiver **tout** le journal produirait une genèse *parfaitement cohérente* :
  `numero` repart à 1, `empreinte_precedente` nulle. La chaîne serait coupée de son passé
  **sans aucune anomalie** — le contrôle serait vert et la preuve de trois ans aurait disparu.
- **Q-189** — `alter table … enable trigger` remet en « origin », pas en « always » : la
  couche 3 de l'ajout seul serait perdue **par le geste censé la préserver**.
- **Q-191** — la trace d'une sortie **ne s'attribue pas à la filiale qui part** : la preuve
  disparaîtrait avec la filiale qu'elle documente.

Et une contrainte devenue propriété (**Q-190**) : `has_column_privilege()` dans la
découverte — **une purge ne peut plus atteindre une colonne qu'elle n'a pas le droit de lire,
par construction**.

#### L12 — notifications

Client SMTP écrit à la main, **STARTTLS exigé sans aucun repli en clair**, destinataires
venant de l'annuaire, tâche `systemd` durcie.

**Le contrôle central a de la matière** : neuf chaînes reconnaissables semées dans les six
sources d'échéances, la chaîne jouée **jusqu'aux octets remis à un vrai serveur SMTP**, puis
recherchées dans ce que le relais a reçu. Zéro occurrence — et la matière est vérifiée
**d'abord**.

⚠️ **Q-186** : `IPAddressDeny=any` doit recevoir le sous-réseau du relais. L'oubli produit un
symptôme **qui ment sur sa cause**. Écrit à **trois** endroits, parce qu'un seul se rate.

#### L10 — internationalisation de l'interface

357 clés, 12 fichiers sur 39, **et la couverture partielle est délibérée** : une clé manquante
rend **la clé elle-même** (**Q-185**).

⚠️ **L'internationalisation s'est révélée être un instrument de sécurité** (**Q-183**) : elle
fait passer sous les yeux chaque chaîne du produit, une par une. Elle a trouvé **deux
injections préexistantes** — `showToast` en `innerHTML` sur **94 sites d'appel**, et six
données utilisateur non échappées dans `actions.js`.

**Banc** : 1652 essais.

### Interface — vague 6 : cinq écrans pour cinq capacités livrées sans interface

**Une fonctionnalité sans écran n'est pas livrée.** Le produit portait cinq capacités
serveur qu'aucune interface n'appelait : la **consolidation Groupe**, le **circuit
d'approbation**, le **socle de risques**, l'**activation des référentiels par filiale** et
l'**import généralisé**. Elles ont maintenant leur écran, leur entrée de menu et leur
domaine de droits.

**Ce que chaque écran garantit**, éprouvé en Chromium réel contre un Fastify réel avec
authentification LDAP :

- **Vision Groupe** — une ligne par filiale du périmètre, plus le total. Un bloc à `null`
  affiche « — », **jamais 0** : dire « aucun risque dans ce groupe » à qui n'a pas le
  domaine serait faux. Sans le domaine `pilotage`, l'écran **explique le refus** et ne
  rend aucun tableau — « le groupe n'a rien » serait le pire mensonge qu'il puisse faire.
- **Approbations** — l'avertissement « l'objet a changé depuis cette décision » passe
  **avant** le tableau. L'interface n'est pas la barrière : l'essai constate l'absence du
  bouton **puis envoie quand même la requête**, et vérifie le 403 du serveur.
- **Socle de risques** — la démonstration est **différentielle** : une entrée du socle est
  vue par une filiale qui n'est pas celle de son auteur, une entrée locale ne l'est pas.
- **Référentiels applicables** — l'écran écrit noir sur blanc la distinction que le
  cadrage range parmi les pièges : l'activation dit *quels référentiels s'appliquent ici*,
  le « non applicable » écarte *un point dans un référentiel pratiqué*.
- **Imports** — aperçu avant validation, rapport ligne par ligne, et les trois propriétés
  du moteur affichées : tout ou rien, idempotent par le fichier, il **crée** sans mettre à
  jour ni supprimer.

**Six constats, dont quatre sur mon propre travail** :

- **Q-175 — la classe `card` de ma couture n'existe pas**, et trois modules l'ont recopiée.
  ⚠️ **Rien ne rougissait** : du CSS mort ne lève aucune erreur et passe tous les essais
  comportementaux. Trouvé par un agent qui a **regardé une capture d'écran** — le seul
  instrument qui pouvait le voir.
- **Q-176 — la portée d'une entrée n'était pas dérivable côté client.** `filiale_id` est
  retiré de tout ce que l'API expose, à juste titre — mais aucun écran ne pouvait donc
  distinguer le socle d'un ajout local. `_porteeGroupe` dit **s'il y a** une filiale,
  jamais **laquelle**.
- **Q-177 — trois écrans ont dû ouvrir chacun leur porte réseau**, faute de méthode dans
  `api.js`. Les trois ont disparu. ⚠️ **Et le retrait m'a coûté deux fois la même erreur** :
  en supprimant un bloc j'ai emporté les fonctions voisines ; `node --check` passait, et le
  module levait une `ReferenceError` au chargement. *Un contrôle de syntaxe ne dit rien
  d'un identifiant manquant.*
- **Q-178** — le relais du banc perdait `content-disposition`, deuxième trou du même relais
  en deux jours après les cookies.
- **Q-180 — un taux de conformité pouvait dépasser 100 %** : le serveur cumule les
  référentiels des vingt filiales, le catalogue en dénombre 42 **par filiale**. Son auteur
  avait écrit le correctif — **et son essai ne l'assertait nulle part**. C'est la mutation
  qui le lui a appris.
- **Q-179, ouvert** : deux chemins d'import coexistent désormais, et l'ancien contredit les
  trois propriétés que L7 existe pour garantir.

**Banc** : 1502 essais, 1502 passés, code de retour 0.

### Base — migration 013, et le socle de risques réellement éprouvé

**Trois erreurs de ma part, toutes attrapées, et chacune vaut sa leçon.**

**1. J'ai failli déclarer le socle fonctionnel sur une mesure fausse** (constat **Q-167**).
Entrée créée par Apache, lue par un RSSI de site, conclusion « ça marche ». La ligne portait
`filiale_id = <sa filiale>` : il la voyait **parce qu'elle était chez lui**. Socle commun et
ajout local rendent exactement la même chose — *« une entrée visible »*.

La bonne mesure est **différentielle**, et c'est la forme de `test/api/socle-risques.test.mjs` :
une entrée de socle est vue par une filiale **qui n'est pas celle de son auteur** ; une
entrée locale ne l'est pas. Prouver la première sans la seconde, c'est prouver qu'on voit
quelque chose, pas qu'on voit ce qu'il faut. Neutraliser la portée fait rougir trois essais.

**2. Une réserve périmée fait renoncer à essayer** (constat **Q-168**). `OptionsCreation.portee`
disait *« le lot L4 ouvrira ce chemin, pas celui-ci »*. L4 était livré depuis la veille et la
route transmettait déjà `portee` — je ne l'avais pas envoyé, sur la foi du commentaire. C'est
la leçon de **Q-156** dans l'autre sens : *« non rejoué » ne vaut pas « impossible »*, et une
réserve écrite hier peut être fausse aujourd'hui.

**3. J'ai modifié une migration déjà appliquée** (constat **Q-169**), et `migrate.mjs` a
refusé. Ce qu'il protège n'est pas une règle de style : la recette n'aurait jamais rejoué la
version corrigée de `012` — deux schémas différents sous le même numéro, et l'écart ne se
voyant qu'à la première création **en production**. `012` restaurée, le delta porté par
**`013`**. Le contrôle compare une **empreinte** : il n'a rien à interpréter.

**Éprouvé à travers Apache, avec l'AD réel** : `/api/modele` rend **23 entités** et
`schemaVersion: 13` ; `admin.grc` crée une entrée de socle (**201**), `rssi.tls` reçoit
**403 `hors_perimetre`** sur la même requête, et voit ensuite le socle **et** son propre
ajout. Les lignes de sonde ont été retirées de la recette.

**Banc** : 1458 essais, 1458 passés, code de retour 0.

### Serveur et interface — schéma v13 : les deux tables mortes deviennent des fonctionnalités

**Une table sans chemin applicatif n'est pas une fonctionnalité, c'est une promesse.** La
migration `012` avait créé `risque_catalogue` sans que rien ne l'expose, et
`referentiels_actifs` attendait depuis `002` (constat **Q-150**). Les deux entrent dans le
registre de la couche générique : elles gagnent d'un coup leur **CRUD**, leur place dans le
**chargement initial**, leur **modèle d'import** et leur **cloisonnement**. Le modèle passe
de **21 à 23 entités**, et l'objet `data` de **v12 à v13**.

Ce que la montée a révélé, et qui vaut plus que la montée :

- **Q-164 — le même numéro de version vit à TROIS endroits**, et rien ne garantissait qu'ils
  concordent : `datastore.js` (ce que le navigateur exporte), `entites/index.ts` (ce que
  l'API annonce), `reprise/index.ts` (ce que le serveur sait relire). Les deux premiers
  montés, le troisième oublié, et **le produit exportait un fichier qu'il refusait de
  relire**. Un essai lit désormais les trois **à leur source** et refuse la divergence — il
  tombe en une milliseconde là où le défaut n'apparaissait qu'au bout d'un aller-retour
  complet.
- **Q-165 — `satisfies` n'est pas un garde-fou d'exhaustivité.** La liste `COLLECTIONS`
  porte `as const satisfies readonly NomCollection[]`, ce qui vérifie que chaque nom est
  *valide*, jamais qu'aucun ne *manque*. Les deux collections neuves y étaient absentes sans
  faire échouer la compilation, et arrivaient à la reprise comme « clé de premier niveau
  inconnue » — **conservées, jamais insérées**. Ce qui l'a fait tomber : un essai qui
  comptait les anomalies d'**information**, gravité qu'on est tenté de ne pas regarder.
- **Q-166 — un essai devenu faux par construction** : *« un export v12 sain traverse la
  chaîne sans être modifié »*. Corrigé **sur le fond, pas sur le nombre** — la question est
  *« un fichier déjà à jour est-il laissé intact ? »*, et elle exige la version **courante**,
  sinon elle se périme à chaque montée de schéma. Le jeu d'essai v12 **reste** : un export
  v12 est un fichier réel, et savoir le reprendre est une propriété distincte.

⚠️ **Le compilateur, lui, a fait son travail** : ajouter une entité sans lui donner de
domaine fonctionnel **fait échouer `tsc`** — pas un essai qu'on pourrait ne pas jouer. Le
socle de risques relève de `risques` et l'activation de `conformite` ; les rattacher à
`administration` aurait interdit le catalogue à tous les RSSI, c'est-à-dire le défaut exact
que **Q-158** venait de coûter sur le logo.

**Un défaut que seul l'usage révèle** : la création d'un risque de catalogue échouait en
`400 « une valeur de l'enregistrement n'est pas admise »` — un message qui ne désigne rien.
La table était juste ; c'est la **trace** qui refusait, `journal_audit.entite_type` portant
un domaine qui n'admettait pas la table neuve. **Toute création écrit au journal** : une
entité absente du domaine est donc *incréable*. Un essai confronte désormais le domaine au
registre applicatif, les deux **découverts**, jamais récités.

**Banc** : 1453 essais, 1453 passés, code de retour 0.

### Base — migration 012 : un socle de risques, et une approbation Groupe qui ne se répète pas

**Deux arbitrages de l'utilisateur, du 04/09/2026**, figés au `CONVENTIONS.md` §34 parce
qu'une décision non consignée se re-débat à la vague suivante.

**1. « Une décision groupe se valide une fois au groupe. »** `approbations.filiale_id` était
`not null` : la PSSI du groupe recevait **un circuit par filiale** — vingt validations pour
un document qui n'en demande qu'une, et vingt réponses possibles à « qui a validé cette
politique ? ». La table devient **mixte**. Trois conséquences qui ne sont pas décoratives :
l'unicité passe en **`nulls not distinct`** (sans quoi deux décisions Groupe de la même étape
passeraient toutes les deux) ; la table reçoit son **déclencheur de portée figée** ; écrire
une décision Groupe exige l'administration Groupe. **Aucune migration de données** — la table
était vide, et une garde **refuse** la migration si elle ne l'est pas, plutôt que de choisir
à la place d'un humain quel circuit de quelle filiale devient celui du Groupe.

**2. « Chaque filiale peut ajouter ses propres risques s'ils ne sont pas déjà présents au
niveau groupe. »** Il n'existait aucun niveau Groupe : « Rançongiciel » était ressaisi vingt
fois, sous vingt libellés, et une consolidation ne pouvait pas répondre à *« combien de nos
filiales sont exposées à CE risque-là ? »*.

⚠️ **La réponse n'est pas de rendre `risques.filiale_id` nullable.** Les clés étrangères
d'`actions` et d'`incidents` sont composites — une action de filiale rattachée à un risque
Groupe ne les satisferait plus — et surtout un risque « Groupe » unique porterait **un seul
couple (F, G, M) pour vingt filiales**, alors que l'exposition est précisément ce qui les
distingue. C'est la **scission** qu'il faut, celle que le `PLAN_SERVEUR` §2.2 impose déjà aux
mesures : **`risque_catalogue`** porte la *définition* (Groupe + ajouts locaux), `risques`
garde l'*évaluation* (Filiale, inchangée). Le lien est **facultatif** : la saisie libre est
conservée, et archiver une entrée du socle **délie** sans rien détruire.

**Les garde-fous du schéma ont corrigé cette migration quatre fois**, et chacun a nommé
exactement ce qui manquait : traçabilité absente à l'insertion, `version` qui cessait de
s'incrémenter (donc le verrouillage optimiste perdu sur la seule table neuve), déclencheurs
armés en « origin » donc désarmables par un réglage de session, et `approbations` devenue
mixte sans sa portée figée. Un cinquième a refusé l'index d'unicité tant qu'il ne portait pas
`filiale_id` — et la bonne réponse n'était pas la dérogation nommée que son homologue
`mesure_catalogue` a obtenue, mais d'**écrire l'index correctement** (constat **Q-163**).

⚠️ **La table est morte tant qu'aucune route ne l'expose** — comme `referentiels_actifs`
(**Q-150**), qui existe depuis `002` et que personne n'écrit ni ne lit. Une table sans chemin
applicatif n'est pas une fonctionnalité, c'est une promesse (**Q-162**).

**Banc** : 1449 essais, 1449 passés. Le semis couvre la table neuve — un balayage de fuite
sur une table vide rend « zéro visible » pour la seule raison qu'il n'y a rien à voir.

### Serveur et interface — lot L9 : l'identité visuelle par filiale

**Une société rachetée ne présente pas un rapport à la marque de sa maison mère.** La
marque Dedienne était écrite en dur dans **dix fichiers**, dont les vues imprimables et
l'export SVG de la matrice des risques — *« précisément les documents qu'un auditeur aura
entre les mains »* (`PLAN_SERVEUR` §6). Mesuré après correction :
`grep -rln "Dedienne" cyber-gouvernance_V4/js/ index.html` ne rend **rien**.

`js/core/identite.js` sert la **raison sociale** et le **logo** de la filiale active. Trois
propriétés, éprouvées en Chromium réel contre un Fastify réel avec authentification AD :

- **deux filiales rendent deux impressions différentes** — et les noms d'essai ont été
  choisis sans rapport avec Dedienne, pour qu'une réapparition de la marque soit sans
  ambiguïté ;
- **un repli visible, jamais silencieux** : sans logo, l'impression montre la raison
  sociale et rien d'autre — jamais celui de la maison mère, qui est le défaut que ce lot
  existe pour corriger ;
- **un SVG déposé comme logo n'est jamais rendu**, script embarqué compris.

⚠️ **Un défaut qui aurait rendu le lot inerte pour presque tout le monde** (constat
**Q-158**) : `GET /api/pieces/logo` déclarait `domaine: 'administration'`, par symétrie
avec le dépôt — or la charge de session réelle d'un RSSI ne porte pas ce domaine, seul
`ADMIN` le porte. **La quasi-totalité des profils n'aurait jamais vu la marque de sa propre
filiale**, sans qu'aucune erreur ne le dise : le repli texte absorbe le 403 en silence, à
dessein. Les deux **lectures** déclarent désormais `domaine: null`, comme `GET
/api/filiales` et pour le même motif — ce sont des routes de *session*. Le dépôt et la
suppression restent `administration` : changer la marque est un acte d'administration, la
regarder ne l'est pas.

⚠️ **Livraison partielle, déclarée** (constat **Q-160**) : les **coordonnées** — adresse,
ville, pays, téléphone, courriel — sont dans la table `filiales` et **aucune route ne les
rend**. L'agent a refusé de les fabriquer, ce qui est le bon réflexe : les inventer les
aurait fait apparaître sur des documents d'audit. Un lot serveur doit les exposer d'abord.

**Deux défauts du BANC, trouvés en construisant le lot :**

- **Q-159 — le relais navigateur partagé ne transportait aucun cookie**, ni en entrée ni en
  sortie. Une connexion réussie rendait 200 avec une session complète, et
  `context.cookies()` restait **vide**. Toute la classe « navigateur réel + authentification
  réelle » était donc intestable, et personne ne l'avait su **faute d'avoir essayé** :
  `droits.test.mjs` emploie l'authentification provisoire, les essais du sélecteur de
  filiale n'ouvrent pas de navigateur. Corrigé à la source, en deux lignes.
- **Le garde-fou du constat Q-43 s'ancrait sur deux lignes du produit** — l'URL du logo
  dans `index.html` et celle que `vault.js` bâtissait à l'exécution. Le lot les a retirées,
  à juste titre, et le garde-fou s'est retrouvé **sans rien à éprouver**. Son commentaire
  l'avait anticipé (*« vérifier que le garde-fou a toujours une raison d'être »*) : il l'a,
  car il vise **toute** référence non versionnée. Ce qui était fautif, c'est qu'il
  **dépendait d'une ligne que le produit avait le droit de supprimer**. Il plante désormais
  son propre décor dans l'arborescence publiée, qu'il possède.

### Serveur — lot L7 : l'import généralisé, un importeur et non vingt

**Le critère décisif du client.** Intégrer une société rachetée en ressaisissant à la main
ses incidents, ses actifs et ses prestataires était hors de question ; l'import existant ne
couvrait **3 entités sur 21** et « ne validait ni le schéma ni les types ».

**Un moteur générique**, dont les colonnes se **dérivent de `Depot.decrire()`** — la forme
du modèle, jamais une liste recopiée. Ce qui ne se dérive pas — le libellé humain d'une
colonne et son ordre — s'écrit, et c'est le bon cas : une omission y est **bruyante**, la
colonne s'affichant sous son nom technique.

Quatre propriétés, chacune mesurée sur des écritures réelles :

- **Tout ou rien.** La morsure n'a pas simulé la coupure : elle l'a **fabriquée par une
  contrainte que PostgreSQL ne peut heurter que si les lignes précédentes ont réellement
  été écrites** — la ligne 201 répète une clé posée par la ligne 6. Le `23505` prouve donc
  que 199 lignes étaient physiquement là ; après le refus, **zéro subsiste**. C'est le
  constat bloquant B-3 de la porte S2 refermé pour de bon : une coupure de VPN au milieu
  d'un import ne laisse plus une filiale à moitié détruite.
- **k erreurs nommées sur N lignes.** 250 lignes dont 27 fausses de trois natures
  différentes → 27 erreurs, chacune avec **son numéro de ligne et la colonne du fichier**,
  et aucun message ne laisse fuir un nom de table, de colonne ou de contrainte.
- **Idempotent par le FICHIER** (empreinte SHA-256 du contenu, pas du nom) : réenvoyer le
  même fichier ne crée rien **et le dit**. La borne est écrite et mordue — un fichier
  modifié d'**un seul octet** est un fichier neuf. L'idempotence est cloisonnée : le même
  fichier s'applique dans chaque filiale.
- **Cloisonné**, sur base non vide, dans les deux sens : une ligne qui désigne
  l'enregistrement d'une **autre filiale** est refusée nommément, et rien n'est écrit d'un
  côté ni de l'autre.

Volumétrie mesurée : **2 000 lignes en 4,3 s, 5 000 en 10,6 s** — ~2,1 ms la ligne, ce qui
tient dans le `ProxyTimeout` de 60 s.

**XLSX écrit à la main, et le motif n'est pas technique.** La voie « CSV serveur +
conversion navigateur » aurait mis la moitié du lot dans le frontend, et surtout elle
aurait déplacé l'empreinte d'idempotence sur le **résultat d'une transformation faite chez
le client** — deux classeurs différents rendant le même CSV seraient devenus « le même
fichier », et la borne cesserait d'être vraie. Un `.xlsx` étant un conteneur OOXML,
`src/pieces/zip.ts` est **importé, pas cloné**. CSV et XLSX sont tous deux acceptés, le
format étant reconnu à la **signature binaire**, jamais à l'extension.

**Le défaut que ce lot existe pour fermer, retrouvé dans le lot lui-même.** Un fichier de
30 incidents **sans colonne obligatoire** rendait **200, zéro erreur, zéro création** :
chaque ligne était écartée, aucune n'émettait d'erreur, et le compte tombait à zéro **en
silence** — « import réussi ». Premier cas du tableau du `CLAUDE.md` §3. Le fait est celui
du **fichier** : il est dit une fois, sur la ligne d'en-tête, et il refuse l'import.

⚠️ **Ce que l'import NE fait pas, et qui est écrit** : il **crée**, il ne met pas à jour et
ne supprime pas. Une colonne « Identifiant » rouvrirait l'oracle d'existence M-3, et une
clé naturelle par entité serait vingt décisions métier fausses chacune dans un cas limite ;
`POST /api/reprise` couvre déjà le remplacement. `lignes_mises_a_jour` vaut donc toujours 0,
et la colonne ne prétend pas le contraire.

**Le contrôle S15 passe** (constat **Q-156**) : `npm audit --omit=dev` rend **`found 0
vulnerabilities`**, là où la porte S4 l'avait consigné « non rejoué ». C'était passager,
comme le supposait le diagnostic — et il a suffi de rejouer.

**Banc** : 74 essais pour L7.

### Serveur — lot L8 : le circuit d'approbation, et lot L4 : créer une filiale

**L8 — « Qui a validé cette politique ? »** Trois circuits du `PLAN_SERVEUR` §3.5 :
documents (rédaction → revue → approbation → publication), acceptation des risques
résiduels (**exigée nommément par l'ISO 27001**), rapports d'audit. Deux routes,
`GET` et `POST /api/approbations/:entite/:entiteId`, et le niveau d'accès
**`validation`** — déclaré depuis L3 et jusqu'ici exercé par aucune route — reçoit
son premier usage.

Trois propriétés valent d'être nommées :

- **L'irréversibilité n'est PAS réécrite en TypeScript.** Elle vit dans la base depuis
  `001_socle.sql` (`f_approbations_verrou_decision`), et la doubler en applicatif aurait
  créé deux versions d'une même garantie — le jour où elles divergent, c'est la faible
  qui l'emporte. Le banc la mord là où elle est : `update` et `delete` directs sous le
  compte applicatif **et sous le propriétaire** rendent `GRC02`, et une **course réelle**
  entre deux transactions la fait lever à travers l'API (409).
- **`empreinte_objet` fait périmer une approbation quand l'objet change.** Approuver puis
  réenregistrer **sans modifier** ne périme rien ; modifier vraiment ramène le circuit à
  sa première étape, et l'ancien tour reste intact avec son empreinte. Sans cela, le
  circuit certifierait un contenu qui a changé depuis — exactement ce qu'un auditeur
  cherche à exclure.
- **Le refus de niveau vient du crochet, pas d'une garde locale**, et il est prononcé
  **avant l'analyse du corps** : un corps JSON illisible envoyé par un profil
  *contribution* rend 403, pas 400.

⚠️ **Le vocabulaire d'accès a gagné un troisième terme, et c'est le banc de L8 qui l'a
exigé.** `NIVEAU_MINIMAL` associe `ecrire` → `contribution`, et **aucune action ne vaut
`validation`** : valider n'est pas une cinquième action, c'est la même écriture faite par
quelqu'un de plus haut placé. Le premier remède fut un crochet propre au greffon, piloté
par un champ que lui seul lisait — et **son propre essai en a dit le danger** : une route
écrite ailleurs qui aurait porté ce champ *aurait paru protégée sans l'être*. Un contrôle
que seul un greffon applique n'est pas un modèle de droits, c'est une garde locale
déguisée. `DeclarationAcces.niveau` vit donc dans le vocabulaire commun, ne peut que
**resserrer** (`deciderAcces` prend le plus exigeant des deux planchers — le vocabulaire
n'offre aucun moyen d'écrire « moins »), et `src/approbations/niveau.ts` a disparu.

**L4 — créer une filiale** (constat **Q-149**). `insert into filiales` n'existait nulle
part dans `src/` : intégrer une société rachetée passait par un administrateur de base
écrivant du SQL. `POST /api/filiales` le fait, sous la déclaration d'accès la plus forte
du produit — **`administration-groupe`**, une exigence neuve du vocabulaire : lire le
groupe entier et pouvoir le changer ne sont pas le même droit, et un profil Direction
porte la première sans la seconde.

⚠️ **Créer la filiale ne suffit pas, et la route le dit** : sans ses groupes d'annuaire
`GRC-<CODE>-<PROFIL>`, personne ne peut y entrer. Ils sont synchronisés **dans la même
transaction** — une morsure le prouve en cassant la seconde écriture et en constatant que
la première a disparu — et la réponse rend la liste de ceux que l'administrateur doit
créer **dans l'annuaire**, ce que le produit ne fait pas et ne doit pas faire.

**Ce que la mesure a démenti, et que le raisonnement avait mal deviné** (constat
**Q-155**) : la route n'emploie **pas** `returning`. Créer une filiale active fait
basculer `f_perimetre_groupe()` à faux *dans la même transaction* — elle est dérivée, et
vaut vrai quand le périmètre couvre toutes les filiales actives. La relecture est donc
refusée alors que l'insertion passe, et PostgreSQL rend le **même message trompeur** dans
les deux cas. Trancher a exigé de rejouer l'insertion sans `returning`. Ce n'est pas un
défaut à contourner : c'est le modèle qui parle — l'administrateur a le droit de créer
une filiale et aucun droit de lire ce qu'elle contiendra, tant que ses groupes n'existent
pas dans l'annuaire.

**Banc** : 60 essais pour L8, 9 pour la création de filiale, 92 passés sur les deux
familles réunies.

### Serveur — lot L4 : la vision Groupe consolidée, qui manquait au lot marqué livré

**La réserve est levée.** Le `PLAN_SERVEUR` §7 range la « consolidation direction » dans le
lot L4 ; la vague 4 avait livré le sélecteur de filiale et **écrit la réserve** dans le
`README` §8 : *« la vision Groupe consolidée du cadrage n'existe pas — `/api/donnees` est
cadré sur la filiale active, donc la Direction voit une filiale à la fois »*. C'était
honnête, et c'est resté une réserve écrite quatre semaines. **Une réserve écrite n'est pas
une réserve traitée.**

**`GET /api/consolidation`** rend, pour **chaque filiale du périmètre résolu par le
serveur**, les indicateurs des sept domaines — conformité par référentiel, risques, actions,
incidents, documents, actifs, audits —, leur **somme**, et séparément ce qui est de **portée
Groupe** (les lignes à `filiale_id` nul : la PSSI du groupe n'est pas comptée vingt fois).

Cinq propriétés, chacune éprouvée :

- ⚠️ **Aucune de ses requêtes ne nomme de filiale.** Pas un paramètre, pas un
  `where filiale_id = $1`, pas une liste dérivée du périmètre : les agrégats lisent les
  tables **nues**, et c'est la RLS qui borne. La garantie est tenue **par la forme** — il
  n'existe aucun endroit où écrire la mauvaise filiale, parce qu'il n'en existe aucun où en
  écrire une. Un essai envoie `?filiale=<voisine>` et constate que la réponse ne bouge pas.
- **Un domaine hors des droits rend `null`, jamais zéro.** Dire « aucun risque dans ce
  groupe » à un profil qui n'a pas le domaine `risques` serait faux, dans un outil qui sert
  de preuve en audit.
- **Le serveur rend des COMPTES, jamais un taux dont il ne possède pas la définition** :
  AirCyber se score Oui/Non/N-A sans CMMI, l'ANSSI en maturité — et ce catalogue vit dans le
  navigateur. Un taux calculé au serveur mélangerait deux définitions **en silence**
  (constat **Q-147**, assumé et écrit).
- **Aucun vocabulaire écrit à la main** : les répartitions se font par `group by`, donc une
  valeur ajoutée demain à une contrainte `check` apparaît toute seule.
- **Transaction en lecture seule, aucune trace au journal** — le §29 réserve
  `consultation_sensible` à la lecture du journal, et tracer chaque rafraîchissement d'un
  tableau de bord noierait la seule question à laquelle il doit répondre vite.

**Un défaut de MA propre route, trouvé par une sonde et non par le banc** (constat
**Q-151**) : `pol_filiales_lecture` ouvre la table `filiales` **entière** dès que
`f_perimetre_groupe()` est vraie — or cette fonction est *dérivée* et ne regarde que les
filiales `active`. Une filiale **cédée**, dans le périmètre de personne, y échappait donc.
Sur `filiales` seule ce n'est pas une fuite ; dans une consolidation, c'eût été **pire
qu'une fuite** : les tables de données restant bornées par `f_filiales_lecture()`, la
filiale cédée serait sortie à **zéro risque, zéro incident, zéro action en retard** — soit
« tout va bien » là où la vérité est « hors de votre périmètre ». La route filtre désormais
sur `f_filiales_lecture()`, un prédicat qui ne **nomme** aucune filiale : il demande à la
base celui qu'elle applique déjà partout ailleurs.

**Banc** : `test/api/consolidation.test.mjs`, 13 essais, **mordus** — trois mutations jouées
(un domaine fermé qui rend des données, la portée Groupe attribuée aux filiales, la portée
Groupe ajoutée au total), plus une quatrième sur le filtre de périmètre — chacune fait
rougir **exactement** l'essai qui nomme la propriété.

**Un défaut du banc trouvé au passage** (constat **Q-148**) : `compilerSiNecessaire()` se
déclarait *« idempotent, et sûr en parallèle »* et ne l'était pas. Trois agents jouant le
banc en même temps lancent trois `tsc` dans le **même `dist/`**, et celle qui finit en
dernier laisse un `dist/` **composite** — mesuré : une source restaurée à l'identique, un
module compilé portant encore la mutation, un essai rouge pour un défaut qui n'était plus
dans le code. Corrigé par un **verrou de fichier**, et par un `dist/` qui n'est réputé frais
que s'il dépasse la source d'une seconde pleine : dans le doute, on recompile.

### Serveur — lot L5 : le journal d'audit, sa couverture, son cloisonnement, sa porte S4

**Ce que le lot livre.** La couverture du journal passe de **4 actions émises sur 20** à
**16 émissibles** : création, modification et suppression avec le **différentiel** (pas le
doublon), export — la moitié restante du constat Q-89 —, import, administration, refus de
droit **par requête**, démarrage et arrêt du service, consultation et vérification. Les
quatre restantes sont reportées **par écrit, avec leur lot** : `purge` et `archivage` à la
procédure d'exploitation, `approbation` au lot L8, `analyse_antivirus` au lot L6.

**La condition d'entrée E6 est fermée** (`008_journal_lecture.sql`) : les deux fonctions du
chaînage passent en `security definer`, et la lecture suit le périmètre. Les deux moitiés
n'ont de sens qu'ensemble — resserrer sans la première ferait échouer **toute** écriture au
journal. ⚠️ La justification qui reportait cette dette, « sans effet tant que le journal est
vide », a été **réfutée par la mesure** : le compte de supervision `grc_lecture` y lisait
**160 entrées**, logins et adresses IP compris ; il reçoit désormais « Périmètre non
positionné ».

**Trois routes de consultation** (`/api/journal`, `/api/journal/export`,
`/api/journal/verification`), un **écran `/journal`**, et un export CSV éprouvé par
aller-retour sur une entrée hostile. Le domaine **`journal`** se détache d'`administration`
— quatorzième domaine de décision : régler l'application et lire trois ans d'identités ne
sont pas le même droit.

**Porte S4 : jouée le 04/09/2026, refusée.** Dix constats (Q-118 → Q-127), dont **un de la
classe « fuite de données »**, tous corrigés ou datés :

- **Q-118** — `verification?depuis=N` était un **oracle exact** : pour tout `N`, le numéro,
  l'identifiant et l'horodatage à la microseconde de l'entrée n° N, et au-delà du dernier
  maillon le volume total du journal du groupe. Depuis une session d'**une seule filiale** :
  11 maillons hors périmètre reconstruits sur 14. La route est réservée au **périmètre
  Groupe** — et l'exigence est **déclarée**, prononcée par `onRequest`, non codée dans la
  route : un essai interdisait à juste titre toute garde `403` locale, et la bonne réponse
  n'était pas de l'assouplir mais d'apprendre au vocabulaire d'accès à exprimer un périmètre.
- **Q-119** — `utilisateur_libelle` portait le **nom d'affichage** pour une connexion
  réussie : chercher par login rendait **0 résultat sur 33**, en silence. Régression
  introduite le jour même en fermant Q-109, avec un commentaire qui **affirmait le
  contraire de la vérité**.
- **Q-120** — l'extrait était **tronqué en silence** au plafond, quand le code promettait un
  refus explicite. Le refus existe désormais — et il ne vise que le plafond *implicite* :
  une borne demandée est honorée, sans quoi le paramètre serait inutilisable.
- **Q-121** — l'extrait CSV était **exécutable par le tableur auquel il est destiné** : cinq
  charges sur cinq (`=cmd|`, `@SUM`, `+HYPERLINK`, `-2+3+`, `=WEBSERVICE`) ressortaient
  intactes, et la valeur vient d'un attaquant **non authentifié**. Désamorcées à l'export,
  sans que la base soit touchée.
- **Q-122 à Q-127** — marqués `V1.1` au registre, avec propriétaire et échéance.

**Ce que l'audit a confirmé, et qui tient** : l'ajout seul survit au `security definer`
(quatre couches mordues, propriétaire compris), le cloisonnement **par ligne** suit le
§29.7, le garde-fou neuf rougit sur quatre mutations distinctes, et le chemin complet a été
parcouru pour la première fois de bout en bout — Chromium réel, Apache réel, Active
Directory réel, PostgreSQL — sans une violation de CSP.

**La leçon de la vague, plus générale que le journal** : *un essai vert qui n'a rien eu à
mesurer rend le même verdict qu'un essai vert qui a tout mesuré.* Deux essais du dépôt
comparaient `0` à `0` et concluaient au vert (Q-108, Q-116) ; un troisième **consacrait**
le défaut de Q-118 comme une propriété désirable. Exiger de la matière — « il devait y
avoir quelque chose à compter » — est ce qui les a fait tomber.


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
3.4.1**, Debian GNU/Linux 13 trixie) : `npm test` → **1747 essais, 1747 passés, 0 échec**
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
