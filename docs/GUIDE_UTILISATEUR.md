# Guide utilisateur — Cyber GRC Édition Groupe

> **Pour qui** : les **neuf** profils du produit — le neuvième, « répondant de campagne »,
> est arrivé avec le lot L24 (action 24.4). Chacun a sa section — lisez la vôtre, le reste
> décrit des écrans que vous ne verrez pas.
>
> **Ce que ce guide ne fait pas** : vous apprendre la gouvernance cyber. Il dit ce que le
> logiciel fait, ce qu'il refuse, et **pourquoi il refuse** — c'est cette dernière partie qui
> évite les tickets.

---

## 0. Ce qui vaut pour tout le monde

### Votre périmètre vient du serveur, jamais de l'écran

Vous ne choisissez pas ce que vous voyez : votre appartenance aux groupes Active Directory
détermine **vos filiales** et **vos domaines**, et le serveur les relit à chaque requête.
Un écran qui vous montre une filiale la montre parce que vous y avez droit.

⚠️ **Corollaire pratique** : si vos droits changent, **reconnectez-vous**. Une session
ouverte porte le périmètre qu'elle avait à l'ouverture.

### Le menu ne montre que ce que vous pouvez lire

Une entrée absente n'est pas un bogue : votre profil n'ouvre pas ce domaine. Et si vous
atteignez malgré tout l'écran par son adresse, il vous **explique le refus** au lieu de
s'afficher vide — « aucun risque » et « vous n'avez pas le droit de les voir » ne veulent
pas dire la même chose.

### Un tiret n'est pas un zéro

Sur les écrans de synthèse, `—` signifie *« ce domaine ne vous est pas ouvert »*. Un `0`
signifie *« il n'y en a réellement aucun »*. La distinction est délibérée : dans un outil
qui sert de preuve en audit, afficher 0 à la place d'un refus serait un mensonge.

### Ce que vous saisissez est tracé

Créations, modifications, suppressions, exports, imports, changements de périmètre et refus
de droit sont écrits au **journal d'audit**, qui ne peut être ni modifié ni effacé.

⚠️ **Ce que le journal conserve n'est pas la même chose selon le geste, et la nuance compte
si l'on vous demande un effacement.** Une **modification** n'y laisse que le **différentiel** :
les seuls champs changés, avant et après. Une **suppression**, elle, y conserve
**l'enregistrement entier**, tel qu'il était au moment de sa disparition — c'est l'objet même
d'un journal d'audit : pouvoir montrer ce qui a été détruit. La rétention est de **trois ans**.

> **Pour le DPO, en une phrase** : supprimer une fiche la retire de l'application, **pas du
> journal**. Une demande d'effacement portant sur des données personnelles doit donc être
> traitée en connaissance de cela, et non sur la foi d'une minimisation qui n'existe pas.
> ⚠️ **Ce paragraphe disait exactement l'inverse jusqu'au 09/09/2026** — constat **Q-264** de
> la porte S7. Il annonçait que les suppressions ne conservaient que le différentiel ; mesuré
> en base, une suppression de risque stocke **13 clés sur 16 colonnes**, nom et description
> compris. Le mot « différentiel » avait été appliqué à la seule action où c'est une copie
> complète.

⚠️ **Et voir ce contenu demande le droit d'EXPORT** (depuis le 11/09/2026). Sur l'écran
`/journal`, tout le monde voit **qui a fait quoi, quand, sur quel objet** — c'est l'objet de
l'écran. Le **contenu de l'enregistrement** — le bloc « valeurs avant / après » — n'apparaît
qu'aux comptes qui portent l'autorisation d'export, et l'écran **dit pourquoi** quand il ne
l'affiche pas. Le motif : les deux routes servaient la même matière, et feuilleter le journal
reconstituait le jeu de données que l'extrait CSV refusait à ce même compte. *Le droit
d'export ne peut pas dépendre du format dans lequel on demande la même chose.*

### Deux personnes sur la même fiche

Si quelqu'un a modifié la fiche depuis que vous l'avez ouverte, l'enregistrement est
**refusé** et vous êtes invité à recharger. Votre saisie n'est pas perdue : elle reste à
l'écran. C'est délibéré — écraser silencieusement le travail d'un collègue est le risque
n° 1 de ce produit.

---

## 1. RSSI de filiale — `GRC-<CODE>-RSSI`

**Votre périmètre** : votre filiale, **tous les domaines métier**, au niveau *validation* —
vous lisez, vous écrivez, et vous **approuvez**. Le **journal d'audit**, les **droits**, les
**paramètres** et la **gestion des filiales** restent à l'administration : vingt-six domaines
sur trente.

> ⚠️ Ce paragraphe écrivait « **tous les domaines** » jusqu'au 09/09/2026, et **se
> contredisait lui-même** au §8, où « lire le journal d'audit » figure parmi ce que
> l'administrateur **seul** peut faire (constat **Q-269**). C'est la seconde phrase qui était
> exacte.

### Ce que vous faites au quotidien

| Écran | Ce qu'il sert |
|---|---|
| **Ma journée** | **l'écran sur lequel le produit s'ouvre.** Ce qui est en retard, ce qui échoit cette semaine, et ce qui vous est attribué — des lignes sur lesquelles cliquer, pas des indicateurs. ⚠️ Le bloc « qui m'est attribué » rapproche sur le **nom affiché** : les responsables sont saisis en texte libre, avec l'annuaire en autocomplétion. Si vos fiches portent une autre orthographe que votre nom de session, elles n'y paraîtront pas — et l'écran vous le dit plutôt que de paraître vide |
| **Tableau de bord** | l'état de votre filiale en un coup d'œil, avec les tendances. ⚠️ Il répond à « où en est le groupe ? » ; « Ma journée » répond à « qu'est-ce que je dois faire ? ». Ce ne sont pas les mêmes questions, et c'est pourquoi ce sont deux écrans |
| **Échéancier** | tout ce qui est daté et qui approche — **neuf sources** : plan d'actions, actions MCO, revues documentaires, déclarations d'incidents, audits, revues de direction, **questionnaires fournisseurs**, **échéances contractuelles des tiers** et **campagnes du Groupe** |
| **Registre des risques** | l'analyse : fréquence × gravité × maîtrise, brut et résiduel |
| **Registre des risques → Ateliers EBIOS RM** | la méthode de l'ANSSI, conduite dans l'outil. ⚠️ Elle **s'ajoute** au registre : vos risques cotés en F × G × M restent valides et lisibles, et rien ici ne les modifie |
| **Référentiels** | l'évaluation des référentiels applicables, et la déclaration d'applicabilité |
| **Approbations** | ce qui attend votre décision |
| **Prestataires → Registre DORA** | le registre de l'article 28 de DORA, **avec ce qui manque à chaque ligne** : c'est cette liste de manques qui en fait un plan de travail, et non le tableau. ⚠️ Il exige le droit d'**export** — un registre complet est la carte des dépendances critiques du groupe |
| **Prestataires** | sur la fiche d'un tiers, le bloc « Questionnaires de sécurité » : le questionnaire que vous adressez à ce fournisseur **s'exporte** en classeur, se remplit hors ligne, et **se réimporte**. ⚠️ Le produit **n'envoie rien** : « consigner l'envoi » enregistre ce que *vous* avez fait. ⚠️ Ce n'est pas un écran à part — un questionnaire appartient à un tiers, et le chercher ailleurs serait le chercher deux fois |
| **Référentiels → Campagnes du Groupe** | ce que le Groupe demande à votre filiale, et où vous en êtes. Vous y prenez connaissance et déclarez terminé ; l'avancement, lui, **se compte** dans vos évaluations |
| **Plan d'actions** | ⚠️ Et sa bascule **Kanban**, en haut de l'écran : la même liste, en colonnes par statut. On y déplace une action **au glisser-déposer ou aux deux boutons de la carte** — ⚠️ les boutons ne sont pas un ornement : au pavé tactile, au clavier ou au lecteur d'écran, le glisser est inutilisable. ⚠️ Une action dont le statut n'est aucun des trois est **montrée** dans une colonne qui le dit, jamais masquée : une action invisible est une action oubliée |
| **Documents** | ⚠️ Le champ de recherche, en tête de la liste : une recherche **plein texte** sur le titre, le type et les annotations de vos documents. Les accents et le pluriel sont ignorés, et « chiffrer » trouve « chiffrement ». ⚠️ Elle ne montre que les documents de **votre périmètre**, et elle vous dit **où** la correspondance a eu lieu — jamais la phrase elle-même. ⚠️ Elle ne va **pas encore** dans le contenu des fichiers joints |
| **Incidents** | ⚠️ Sur la fiche d'un incident, le bouton « Préparer une notification » : un formulaire pré-rempli pour l'**ANSSI** (NIS2, article 23) ou la **CNIL** (RGPD, article 33), à imprimer. ⚠️ **Le produit ne transmet rien à aucune autorité** : vous relisez, vous complétez, vous déposez vous-même. ⚠️ Et le document **dit ce qui lui manque**, rubrique par rubrique, avec ce que le texte attend à cet endroit — *un formulaire à moitié rempli est plus dangereux qu'un formulaire vide : vide, on le remplit ; à moitié rempli, on l'envoie* |

### Trois choses qui surprennent la première fois

1. **Le socle de risques est commun au groupe, et vous ne l'écrivez pas.** Vous voyez les
   risques définis au niveau Groupe — « Rançongiciel », « Défaillance d'un fournisseur
   unique » — et vous **ajoutez les vôtres** s'ils n'y sont pas. C'est ce qui rend les
   filiales comparables : sans socle, le même risque porterait vingt noms.
   ⚠️ Vous **cotez** chez vous. La définition est commune, **l'exposition ne l'est pas** :
   un risque critique à Hambourg peut être négligeable à Toulouse.
2. **Approuver fige une version.** Si l'objet change après votre décision, le circuit le
   signale et **repart du début**. Ce n'est pas une régression : c'est ce qui empêche une
   approbation de certifier un contenu qui a changé depuis.
3. **Une décision franchie ne se défait pas.** Ni par l'écran, ni autrement. Pour revenir
   dessus, on produit une nouvelle version, qui repart du premier tour.

### Conduire une analyse EBIOS RM

L'onglet **Ateliers EBIOS RM**, à côté de la *Matrice F×G*, porte les deux premiers ateliers
de la méthode : le **cadrage** avec ses valeurs métier et ses événements redoutés, puis les
**sources de risque** et leurs objectifs visés.

Une **étude** est un périmètre et un exercice — « chaîne de production, 2026 ». C'est elle
qui rend l'analyse reproductible : sans elle, on ne peut ni dire de quelle analyse relève une
valeur métier, ni comparer deux années.

Quatre choses à savoir avant de commencer :

1. **Rien n'est ressaisi de ce que vous tenez déjà.** Le socle de sécurité de l'atelier 1,
   ce sont vos *Référentiels* et vos *Mesures de sécurité* ; les biens supports, ce sont vos
   *Actifs* et leur *Cartographie*. Et une valeur métier qui est un processus **pointe** le
   bilan d'impact correspondant : sa criticité, son RTO et son RPO restent lus là-bas, et ne
   sont jamais recopiés dans l'étude.
2. **La pertinence d'un couple est une SUGGESTION.** L'outil moyenne vos trois critères —
   motivation, ressources, activité — et affiche une note. ⚠️ **Il ne décide pas** : retenir
   un couple engage les ateliers suivants, et l'outil vous demande alors **pourquoi**. Cette
   phrase est ce qu'un auditeur lira en premier.
3. **La note se tait dès qu'un critère manque** — la colonne affiche « à évaluer », jamais un
   chiffre. Une moyenne calculée sur deux critères sur trois aurait l'air mesurée sans
   l'être, et c'est ce genre de chiffre qu'on cite ensuite en comité de direction.
4. **Écarter un couple ne l'efface pas.** « Aucun signal cette année, à réexaminer » est
   exactement ce qu'on vient rechercher l'exercice suivant.

### Les ateliers 3, 4 et 5 — de l'écosystème à la décision

La même fiche porte la suite, dans l'ordre où la méthode se conduit :

- **l'écosystème** — les parties prenantes dont vous dépendez ou qui pénètrent votre
  système, évaluées sur quatre critères. L'outil en tire un **niveau de menace** :
  au-delà de 1, vous dépendez d'elle plus que vous ne pouvez lui faire confiance.
  ⚠️ La cartographie de vos actifs n'est **pas** refaite ici — elle reste dans l'écran
  *Cartographie* ;
- **les chemins d'attaque** — par où un couple **retenu** à l'atelier 2 atteint un
  événement redouté de l'atelier 1, et par quelle partie prenante il passe. ⚠️ La gravité
  d'un chemin n'est pas ressaisie : c'est celle de l'événement redouté qu'il réalise ;
- **les modes opératoires et le traitement** — comment le chemin se réalise techniquement,
  à quel point c'est vraisemblable, et ce que vous décidez.

Trois choses à savoir :

1. **Seuls les couples retenus sont proposés** comme point de départ d'un chemin. C'est
   tout le sens de la décision que vous avez prise à l'atelier 2.
2. **« Accepter » demande pourquoi, et c'est la seule des quatre décisions.** Éviter,
   réduire et transférer produisent un travail que quelqu'un verra — un projet, un
   contrat, un plan d'actions. Accepter ne produit rien : sans la phrase qui dit pourquoi,
   la décision est indistinguable d'un oubli, et c'est précisément celle qu'un auditeur
   vient chercher.
3. **Rattacher un mode opératoire à un risque du registre ne modifie pas ce risque.** Sa
   cotation fréquence × gravité × maîtrise reste la vôtre. Le lien sert à ce que le plan
   d'actions déjà rattaché à ce risque s'applique ici aussi.

### Les échelles de cotation — ce que « 3 » veut dire

L'onglet **Échelles de cotation**, à côté des *Ateliers EBIOS RM*, porte les graduations
que l'outil emploie : la **gravité**, la **vraisemblance**, les **critères d'une source de
risque** et ceux d'une **partie prenante**.

Par défaut, votre filiale cote sur le **socle du Groupe**, et c'est le cas normal : c'est
lui qui rend les filiales comparables. Vous pouvez publier **la vôtre**, et l'écran dit
alors clairement, devant chaque sujet, laquelle est en service.

Quatre choses à savoir :

1. **Une échelle en service ne se modifie plus.** Vous en publiez une **révision**. Ce
   n'est pas une rigidité administrative : une cotation *pointe* son échelle, et retoucher
   la graduation changerait ce que des analyses déjà produites veulent dire — sans que rien
   ne bouge à l'écran.
2. **Publier une révision ne recote rien.** Les analyses déjà faites gardent la graduation
   sous laquelle elles l'ont été, et la fiche l'affiche. Seul un humain sait si son « 3 »
   d'hier est le « 3 » de la nouvelle échelle ; l'outil ne le devine pas à votre place.
3. **« Échelle non tracée » veut dire ce qu'il dit.** Les cotations saisies avant cette
   version ne portent aucune échelle, et l'outil ne leur en attribue pas une d'office :
   ce serait affirmer un fait que personne n'a constaté. Recotez-les pour qu'elles portent
   la graduation en vigueur.
4. **Votre échelle ne vaut que pour vous.** Le socle du Groupe ne bouge pas, les autres
   filiales continuent de coter dessus, et la vision consolidée sait que vos chiffres ont
   été produits autrement.

### Chiffrer un risque en euros — la quantification FAIR

Sous la cotation F × G × M, la fiche d'un risque porte un panneau **Quantification
financière (FAIR)**. Il est **facultatif**, et il doit le rester : on ne quantifie que là
où l'enjeu le mérite.

La méthode tient en deux estimations, chacune saisie par un **triplet** — minimum, plus
probable, maximum — parce qu'une estimation honnête est un intervalle, pas un chiffre :

1. **la fréquence** : combien de fois par an l'événement survient. *Une fois tous les cinq
   ans s'écrit 0,2.*
2. **la perte primaire** : ce que coûte **un** événement, directement — remise en service,
   heures perdues, matériel remplacé.

Et une troisième, facultative : **la perte secondaire** — amende, litige, clients perdus.
Pour un risque relevant du RGPD, de NIS2 ou de DORA, c'est souvent le terme le plus lourd.

**Quatre choses à savoir, et elles expliquent ce que l'écran refuse de faire :**

1. **Les hypothèses sont obligatoires.** Sans elles, un montant n'est pas une estimation :
   c'est une opinion avec une virgule — et c'est celui-là qu'on cite en comité de
   direction. Écrivez d'où viennent vos chiffres ; c'est la première chose qu'un auditeur
   lit.
2. **Un triplet se saisit en entier, ou pas du tout.** Deux valeurs sur trois donneraient
   une moyenne, et ce nombre aurait l'air mesuré. L'outil refuse d'enregistrer, et il le
   dit.
3. **Un montant précédé de « ≥ » est un plancher.** Il signifie que les pertes secondaires
   n'ont pas été estimées : le total ne porte que la perte primaire. Laisser ce triplet
   vide est un choix légitime — le présenter comme un total ne le serait pas.
4. **Le montant n'apparaît qu'après l'enregistrement.** Il est calculé par le serveur, et
   c'est ce même calcul qui alimente la vision Groupe : il n'y a donc jamais deux chiffres
   pour une même chose.

**Ce que la vision Groupe en fait.** La colonne *Perte annualisée* additionne les montants
du périmètre — c'est la **seule** grandeur du tableau qui s'additionne vraiment. La colonne
*Exposition*, à sa gauche, est ordinale : l'outil refuse de la sommer dès que les filiales
n'ont pas coté sur la même échelle.

⚠️ **Et il refuse d'additionner deux devises.** Un euro et un dollar font un nombre, jamais
une somme. La cellule affiche alors « — », et le détail dit lesquelles coexistent.

### Gérer les catalogues de référentiels

L'onglet **Gestion des catalogues**, à côté de *Catalogue*, ne sert pas à évaluer : il sert
à savoir **ce que vos catalogues contiennent**, quand la norme a été publiée, laquelle
remplace laquelle, et ce qu'un changement de version met en jeu.

**Quatre choses qu'il vous dit :**

1. **L'ancienneté.** Chaque catalogue porte la date de parution de son texte, et l'outil
   signale « à vérifier » au-delà de cinq ans. ⚠️ Il **ne va pas chercher la norme sur
   Internet** — il n'a pas d'accès sortant, et c'est voulu. Il date, et il signale.
   « Date inconnue » veut dire ce qu'il dit : le questionnaire AirCyber ne porte pas de
   date de parution publique, et l'outil n'en invente pas.
2. **Ce qu'un changement de version met en jeu.** La colonne *Réponses* compte les
   auto-évaluations déjà données sur chaque catalogue.
3. **Le plan de reprise**, quand un catalogue en remplace un autre : ce qui se reporte, ce
   qui est abandonné, ce qui reste à évaluer. ⚠️ **Un code identique ne garantit pas un
   sens identique** — ISO 27002:2022 a renuméroté les 114 mesures de 2013 en 93 —, et
   l'écran **signale les intitulés qui ont changé sous le même code**. Rien n'est reporté
   sans votre geste, et chaque réponse reportée garde la mention de son origine.
4. **Des correspondances proposées** entre deux référentiels, par similarité de libellés,
   avec un score. ⚠️ **Rien n'est créé tant que vous ne cliquez pas.** Une correspondance
   appliquée sans lecture propagerait un statut de conformité faux d'un référentiel à
   l'autre, dans un outil produit en audit.

**Pour apporter votre propre grille**, passez par l'écran *Imports* : le référentiel
d'abord, puis ses domaines, puis ses exigences. Elle se comporte ensuite comme un
référentiel livré — radar, déclaration d'applicabilité, correspondances, audits — et elle
n'est visible que de votre filiale.

### Importer des données

L'écran **Imports** couvre les 23 entités. Trois propriétés à connaître :

- **Tout ou rien** — un fichier passe entièrement ou pas du tout. Une coupure au milieu ne
  laisse jamais votre filiale à moitié remplie.
- **L'aperçu n'écrit rien.** Regardez-le : il vous donne le compte exact et la liste des
  lignes fautives, **avec leur numéro et la colonne du fichier**.
- **Réenvoyer le même fichier ne crée rien**, et vous le dit. Un fichier modifié d'un seul
  octet est en revanche un fichier neuf.

⚠️ **L'import CRÉE ; il ne met pas à jour et ne supprime pas.** Pour remplacer un jeu
entier, c'est la reprise d'un fichier d'échange, dans *Paramètres* → **Échange de données**.

### L'écran Paramètres, en trois onglets

| Onglet | Ce qu'il sert |
|---|---|
| **Identité** | ce que le serveur sait de votre filiale — raison sociale, coordonnées, langue — et ce qu'il imprime sur vos fiches et vos exports. ⚠️ En **lecture seule** : une correction se demande à votre exploitant, parce qu'une filiale ne réécrit pas sa propre identité dans l'outil qui sert de preuve en audit |
| **Échange de données** | exporter ou reprendre un **fichier d'échange**. ⚠️ Ce n'est **pas** une sauvegarde — celle-ci est faite par le serveur, sans action de votre part. Deux usages réels : reprendre une filiale rachetée déjà équipée, et **remettre ses données à une filiale qui sort du groupe** (c'est l'unique trace de cette opération, et elle est irréversible) |
| **Jeu de découverte** | charger ou retirer un groupe industriel fictif, pour voir le produit rempli au lieu de l'imaginer. Il n'apparaît que sur une installation de découverte |

---

### Pendant une crise — la main courante

Ouvrez la fiche de l'**incident** : sous les pièces jointes, l'encart **Main courante de
crise**. On y note ce qui se passe, au fur et à mesure : ce qu'on constate, ce qu'on
décide, qui on prévient, ce qu'on escalade.

| Ce que vous saisissez | Ce que le produit pose |
|---|---|
| la **nature** et le **texte** | rien d'autre n'est demandé |
| — | l'**heure**, à l'instant de l'écriture, par le serveur |
| — | l'**auteur**, depuis votre session |
| — | le **numéro** dans la chaîne, et l'empreinte qui la scelle |

⚠️ **Une entrée ajoutée ne se modifie plus, et ne se supprime pas.** Ce n'est pas une
limitation de l'écran : la base elle-même les refuse, par quatre mécanismes distincts. Pour
corriger, **ajoutez une entrée qui le dit** — « rectification de l'entrée n° 7 : il
s'agissait du serveur de secours, pas du serveur principal ». C'est ce que fait une main
courante depuis toujours, et c'est ce qui lui donne sa valeur : un récit qu'on peut relire à
froid et réécrire est un récit rédigé **après**.

⚠️ **L'heure ne se saisit pas non plus.** Elle est posée par le serveur au moment de
l'écriture. Notez au fil de l'eau, même brièvement : une entrée de dix mots écrite à 3 h 12
vaut mieux qu'un paragraphe reconstitué le lendemain.

**Le bandeau « Chaîne intacte »** est affiché en permanence, et pas seulement en cas de
problème. Chaque entrée porte l'empreinte de la précédente : retirer ou retoucher une ligne
se verrait. ⚠️ Il dit aussi ce qu'il **ne** prouve pas — l'administrateur de la base peut
agir, et le mécanisme ne l'en empêche pas : il rend son passage **détectable**.

ℹ️ **La main courante n'est pas dans la sauvegarde `grc-backup`**, pas plus que le journal
d'audit. Faire voyager une chaîne d'empreintes par un fichier qu'on peut éditer, puis la
reconstituer à la relecture, lui ôterait exactement ce qui fait sa valeur.

## 2. Direction — `GRC-GROUPE-DIRECTION`

**Votre périmètre** : toutes les filiales actives, en **lecture**, sur le pilotage et la
conformité.

| Écran | Ce qu'il sert |
|---|---|
| **Vision Groupe** | une ligne par filiale, plus le total — la comparaison que le reste du produit rend possible |
| **Synthèse Direction** | la vue d'une filiale, pour entrer dans le détail |
| **Échéancier** | ce qui arrive à terme, toutes filiales confondues |

✅ **Votre profil ouvre bien les risques et les incidents.** Sur l'écran Vision Groupe, ces
colonnes portent des chiffres, filiale par filiale, et non des tirets.

> ⚠️ **Ce paragraphe disait l'inverse jusqu'au 09/09/2026** — constat **Q-268** de la porte
> S7. Il annonçait que le profil *Direction* n'ouvrait « ni les risques, ni les incidents »
> et invitait à en demander l'ajout à l'administration. C'était vrai jusqu'au **05/09**, où
> la migration `016` a fermé le constat **Q-181** en donnant à ce profil les six domaines qui
> lui manquaient. Mesuré en base : `DIRECTION` porte **douze domaines en lecture**, `risques`
> et `incidents` compris.
>
> ⚠️ **Un tiret garde néanmoins son sens, et c'est important** : là où une colonne affiche
> `—`, cela veut dire *« ce domaine n'est pas dans vos droits »*, **jamais `0`**. Un outil
> qui sert de preuve en audit ne doit pas dire « aucun risque » quand il veut dire « je n'ai
> pas le droit de regarder ».

---

## 3. Contributeur — `GRC-<CODE>-CONTRIB`

**Votre périmètre** : votre filiale, sur **quatre domaines** — actifs, plan d'actions,
incidents, actions préalables (MCO) —, au niveau *contribution*.

Vous **saisissez et modifiez**, vous ne **validez pas**. Concrètement : vous déclarez un
incident, vous ne clôturez pas le circuit d'acceptation d'un risque ; vous mettez à jour une
action du plan, vous ne prononcez pas son acceptation.

> ⚠️ **L'exemple donné ici jusqu'au 09/09/2026 était précisément celui que vous ne pouvez
> pas faire** — « vous rédigez une politique, vous ne l'approuvez pas » (constat **Q-270**).
> `documents` **n'est pas** dans vos quatre domaines : vous ne voyez pas l'écran *Documents*,
> vous n'y écrivez donc rien. Les quatre domaines annoncés ci-dessus, eux, sont exacts —
> mesurés en base.

⚠️ Si un bouton d'approbation n'apparaît pas, c'est votre niveau — pas un défaut d'écran.
Et si vous atteigniez la fonction autrement, **le serveur refuserait aussi** : l'interface
reflète la règle, elle ne l'applique pas.

---

## 3 bis. Répondant de campagne — `GRC-<CODE>-REPONDANT`

**Votre périmètre** : votre filiale, sur **trois domaines seulement** — les référentiels et
les exigences au niveau *contribution*, l'échéancier en *lecture*. **Tout le reste du produit
vous est fermé**, et il l'est *nommément* : chacun des vingt-sept autres domaines porte la
valeur « aucun » dans vos droits, pour qu'une revue de droits puisse le relire.

**Ce que vous faites** : le Groupe vous adresse une **campagne d'évaluation** — « évaluez
l'hygiène ANSSI d'ici le 30 juin » —, et vous y répondez. Votre écran est
*Conformité → Référentiels → **Campagnes du Groupe***.

1. la campagne qui vous convoque y figure, avec son **échéance** et où vous en êtes ;
2. « **J'en prends connaissance** » consigne que vous l'avez vue — c'est un fait daté, pas
   une formalité : le Groupe s'en sert pour savoir qui n'a pas encore ouvert la demande ;
3. vous évaluez le référentiel comme d'habitude (écran *Référentiels*), exigence par
   exigence. **L'avancement se compte tout seul** : il n'y a rien à mettre à jour à la main ;
4. « **Déclarer terminée** » clôt votre part, et vous pouvez nommer le répondant.

⚠️ **L'échéance de la campagne arrive dans votre Échéancier**, avec les autres obligations
datées — et dans les relances par courriel. Vous n'avez pas à surveiller un écran à part.

> ⚠️ **Ce que vous ne voyez pas, et ce n'est pas un défaut** : les parts des **autres**
> filiales convoquées à la même campagne, ni même leur nombre. C'est une information de
> Groupe. Vous voyez la demande — qui est la même pour tout le monde — et votre réponse.

⚠️ **Ce profil existe parce que le contributeur ne pouvait pas répondre** : ses quatre
domaines ne touchent pas la conformité, et lui en donner l'accès entier aurait accordé bien
plus que de répondre à une campagne. Si vous portez **déjà** un profil RSSI ou Qualité, vous
n'avez pas besoin de celui-ci : vous pouvez déjà évaluer.

---

## 4. Service qualité — `GRC-<CODE>-QUALITE`

**Votre périmètre** : audits et revues de direction en *contribution*, documents en
*contribution*, exigences / mesures / référentiels en *lecture*.

- **Audits** : la grille, les constats, le rapport. Une fois **validé**, le rapport est figé
  avec son auteur.
- **Documents** : le registre des politiques, leurs dates de revue, et les alertes quand une
  revue est échue.

### La version qui fait foi, et où elle se décide

Ouvrez une fiche document : sous le formulaire, le panneau **Pièces jointes**. C'est là que
vivent les fichiers — l'application les détient, les analyse, en garde l'empreinte et les
délivre elle-même. Deux gestes, et un piège :

1. **Au dépôt, numérotez le fichier.** Le champ « Version » à côté du bouton *Déposer* n'est
   pas décoratif : c'est lui qui donnera son numéro à la fiche.
2. **Cliquez « Faire foi » sur la version en vigueur.** Elle prend le badge *En vigueur*, les
   autres passent à l'historique — **elles ne sont pas supprimées**, et restent
   téléchargeables. C'est ce qu'un auditeur demande : « montrez-moi la version précédente ».

Dès qu'un fichier fait foi, le champ **Version** de la fiche devient une **lecture** : il
suit le fichier. Pour changer le numéro, on dépose une nouvelle version et on la fait faire
foi — on ne retape pas le champ. C'est délibéré : avant, on pouvait écrire « 2.1 » au-dessus
du PDF de la 1.4, et rien ne le voyait.

⚠️ **« Document resté ailleurs » n'est pas une pièce jointe.** C'est une simple *référence* —
un chemin réseau, un lien vers la GED. L'application ne la lit pas, ne la vérifie pas, et ne
saura jamais si ce qui est au bout a changé. Les deux champs coexistent ; ne les confondez
pas.

### La même procédure devant cinq contrôles — sans la déposer cinq fois

Un auditeur pose la même question devant plusieurs contrôles : *« montrez-moi la
procédure »*. Vous n'avez pas à redéposer le fichier à chaque fois.

Le panneau **Pièces jointes** est désormais aussi sur la **fiche d'un contrôle**
(*Référentiels → Mesures de sécurité*, puis une mesure). Sous le bouton *Déposer*, dépliez
**« Réutiliser une preuve existante »** : choisissez la fiche documentaire d'où vient la
procédure, puis le fichier, et cliquez **Rattacher**.

**Rien n'est déposé.** Le fichier reste en **un seul exemplaire**, avec son empreinte, son
analyse antivirale et sa place dans le quota de votre filiale. C'est le point : le jour où
la procédure change, il y a **une** chose à mettre à jour, pas cinq.

⚠️ **Le bouton de retrait change de mot, et il dit la vérité.**

| Ce que vous lisez | Ce qui se passe |
|---|---|
| **Détacher** | la preuve est retirée de **cette fiche seulement**. Le fichier est conservé : il sert d'autres fiches, nommées dans l'infobulle de la mention *Sert aussi N fiches* |
| **Supprimer** | cette fiche est le **dernier** porteur : le fichier est retiré définitivement |

La même règle vaut quand vous supprimez la fiche elle-même : tant qu'un autre contrôle
invoque la preuve, elle lui reste attachée. Elle ne disparaît qu'avec son dernier porteur.

ℹ️ **On ne réutilise que les preuves de sa propre filiale**, et c'est voulu : une preuve
empruntée à une filiale voisine dépendrait, pour être retirée, d'un geste que vous ne
pouvez pas faire.

### Vérifier qu'un fichier n'a pas été remplacé

Chaque pièce porte son **empreinte SHA-256**, calculée à son dépôt sur le fichier réellement
écrit. Elle s'affiche sous le nom du fichier, repliée ; cliquez sur **SHA-256** pour voir les
64 caractères et les comparer à ceux de votre propre exemplaire.

Le bouton **Vérifier** demande au serveur de relire le fichier et de le comparer à cette
empreinte. Trois réponses :

- *le fichier correspond* — rien n'a bougé depuis le dépôt ;
- **Empreinte en écart** — les octets ont changé. Le fichier ne peut plus servir de preuve :
  prévenez votre exploitant ;
- **Fichier introuvable** — le fichier a disparu du magasin. Prévenez votre exploitant.

Un balayage automatique fait ce rapprochement tous les mois ; le badge que vous voyez sur une
ligne vient de lui. Le bouton, lui, mesure **maintenant**.

⚠️ **Ce que cela prouve.** Que le fichier détenu ici n'a pas changé depuis son dépôt — ce qui
est exactement la question d'un auditeur. Ce n'est **pas** une garantie absolue : quelqu'un
qui aurait la main sur le serveur pourrait modifier le fichier *et* son empreinte. Aucun
dispositif de ce genre ne prétend le contraire.

### Faire valider une politique avant de la publier

Sur la fiche, en bas, l'encart **Circuit d'approbation** : rédaction → revue → approbation →
publication. Chaque décision est horodatée, attribuée, et **irréversible**.

Mettez le document au statut **« en validation »** pendant que le circuit tourne. Tant que
l'étape **publication** n'est pas approuvée, le serveur **refuse** de le passer « en
vigueur », et vous dit pourquoi. Repasser par « brouillon » ne contourne rien : dès qu'un
circuit est ouvert, il faut le conclure. La tentative refusée est journalisée — c'est normal,
et c'est ce qui permet de répondre « oui, et voici la preuve » à un auditeur.

Un document qui n'a **aucun** circuit ouvert, lui, se publie directement : toutes les
procédures ne réclament pas une validation formelle.

⚠️ Vous ne voyez **pas** la cartographie des dépendances (`cartographie: aucun`, posé
explicitement dans votre profil) : c'est une décision de découpage, pas un oubli.

---

## 5. Délégué à la protection des données — `GRC-<CODE>-DPO`

**Votre périmètre** : le registre **RGPD** au niveau *validation*, les incidents en
*contribution*, les documents et l'annuaire en *lecture*.

- **Registre des traitements** (article 30) : c'est votre écran principal, et il est
  imprimable tel quel pour un contrôle.
- **Analyses d'impact** (article 35) : l'onglet voisin dit où en est chaque analyse — et
  quels traitements n'en ont aucune. Voir plus bas.
- **Demandes de droits** (articles 15 à 22) : le registre de ce qu'on vous a demandé, avec
  le délai d'un mois **calculé par le produit**. Voir plus bas.
- **Incidents** : vous suivez les déclarations CNIL — le produit calcule le **délai de 72 h**
  à partir de la date de détection et le fait remonter dans l'Échéancier.

⚠️ **Les purges de données personnelles anonymisent, elles ne suppriment pas.** Le produit
stocke les noms **en texte** dans les fiches ; effacer seulement l'annuaire laisserait les
noms partout ailleurs. Et **les incidents ne sont jamais purgés automatiquement** : une
description peut contenir un nom comme elle peut contenir la seule preuve d'un incident —
le produit vous les signale, vous tranchez.

⚠️ **Le journal d'audit n'est jamais purgé**, RGPD compris. Il est en ajout seul et chaîné :
y toucher casserait la preuve. Sa rétention est une procédure d'exploitation à trois ans.

### L'analyse d'impact (article 35) — et surtout : ce qui n'en a aucune

Sur votre écran **Registre RGPD**, l'onglet **« Analyses d'impact »** répond à deux
questions, et la seconde est celle qu'un contrôle pose en premier.

| Ce que la vue montre | Pourquoi |
|---|---|
| **les analyses enregistrées**, avec leur état | *où en est-on ?* |
| **les traitements qui n'ont AUCUNE analyse** | *lesquels auraient dû en avoir une ?* |

L'analyse elle-même se saisit **sur la fiche du traitement**, dans l'encart « Analyse
d'impact (AIPD) ». Elle ne vous redemande **rien** de ce que le registre porte déjà — ni la
finalité, ni les catégories de données, ni les destinataires : ils sont dans le formulaire
au-dessus. L'analyse **désigne** le traitement, elle ne le recopie pas.

⚠️ **« Présumée requise » n'est pas « requise », et la nuance est à vous.** L'article 35 §3
vise trois cas : le profilage systématique, le traitement à grande échelle de catégories
particulières, et la surveillance systématique d'un lieu public. **Le registre ne permet
d'en mesurer qu'un** — celui des catégories particulières. Le produit signale donc une
présomption sur ce seul critère, **et il n'écarte personne** : les traitements non
présumés restent dans la liste. C'est vous qui décidez, et c'est le champ « Motif » qui
garde la trace de votre décision — y compris celle de **ne pas** mener d'analyse. C'est
cette trace-là qu'un contrôle demande en premier.

⚠️ **Une analyse validée dont la date de revue est passée cesse de valoir — toute seule.**
Elle repasse en **« À revoir »** au changement de jour, sans qu'un traitement ait eu à
s'exécuter, donc sans que personne puisse oublier de le lancer. L'écran affiche alors deux
choses qui semblent se contredire, et il vous dit pourquoi : la **décision** enregistrée
reste « validée » — c'est un fait, il ne s'efface pas —, mais l'**état** ne l'est plus.

ℹ️ **Retirer un traitement du registre suppose d'avoir retiré son analyse.** Le lien est
volontairement rigide : effacer un traitement dont l'analyse existe encore effacerait la
preuve qu'on l'avait analysé.

### Quand quelqu'un exerce ses droits — l'horloge d'un mois

Sur votre écran **Registre RGPD**, l'onglet **« Demandes de droits »**. Vous y enregistrez
ce qui arrive — un courriel, un courrier, un appel — et le produit tient le délai.

| Ce que vous saisissez | Ce que le produit en fait |
|---|---|
| **la date de RÉCEPTION** | l'origine du délai. ⚠️ C'est la date d'arrivée, **pas celle de la saisie** : un courriel qui a dormi trois jours dans une boîte partagée a déjà consommé trois jours |
| le droit invoqué, le canal | le classement du registre |
| **le nom du demandeur** | sans lui, vous ne saurez pas à qui vous avez répondu — c'est la pièce qui vous protège |

**L'échéance, elle, n'est pas saisie : elle est calculée.** Un mois à compter de la
réception (RGPD **article 12 §3**), et l'écran l'affiche avec sa référence. Corrigez la date
de réception, et l'échéance suit — il n'y a pas deux endroits où elle vit.

⚠️ **Une demande dont le mois est écoulé passe « En retard » toute seule**, au changement de
jour, sans qu'aucun traitement ait à s'exécuter. Et le retard est **chiffré** : « en retard
de douze jours ». C'est délibéré — « en retard de douze jours » se défend devant une
autorité, « bientôt » ne se défend pas.

**La prorogation de deux mois existe** (article 12 §3, second alinéa), mais elle ne
s'invoque pas après coup : le texte impose d'**informer la personne dans le premier mois**,
en motivant. Le produit exige donc les deux — la date de notification et le motif — avant
d'accepter qu'une demande soit prorogée. Une prorogation non notifiée ne proroge rien ; elle
fabriquerait un délai que vous croyez avoir.

**Un refus se motive et se date.** L'article 12 §4 vous oblige à informer la personne *dans
le même délai*, avec les voies de recours : le produit refuse d'enregistrer un refus sans
motif ni date de réponse. Une fin de non-recevoir silencieuse est exactement ce que le texte
proscrit.

⚠️ **Ce que le produit ne fait pas** : il ne répond pas à la personne, n'extrait pas ses
données et ne juge pas si la demande est fondée. Il **tient le registre** et **arme
l'horloge**. Le reste vous appartient.

ℹ️ **Ce registre contient des données personnelles de gens qui ne sont pas vos
utilisateurs.** C'est nécessaire, et c'est déclaré : l'onglet « L'outil lui-même » les
range, avec leur sort à l'expiration — le nom se **conserve** (sans lui, la preuve d'avoir
répondu n'a plus de sujet), le contact s'**anonymise**.

### Ce que l'outil fait de VOS données — la réponse est dans l'outil

Sur votre écran **Registre RGPD**, l'onglet **« L'outil lui-même »** : un bouton, et vous
obtenez la liste **colonne par colonne** de ce que cette application détient — la finalité,
la base légale, la durée, et ce qu'elle en fait à l'expiration. C'est l'article 30 appliqué
au logiciel, et c'est la pièce à produire quand on vous demande *« que fait votre outil de
nos données ? »*.

⚠️ **Il ne contient aucune donnée personnelle** : il décrit la structure du produit, pas les
gens. C'est pourquoi il est en lecture simple.

Quatre devenirs à l'expiration, et le quatrième mérite d'être connu : **« signaler »**. Quand
un nom est *au milieu d'une phrase* — la note d'une cellule de crise, la description d'un
incident —, le remplacer détruirait la phrase : c'est à vous de trancher, pas à la machine.

✅ **Et c'est bien ce que le produit fait, depuis le 11/09/2026** (constat **Q-293**, fermé).
Le rapport de purge vous rend une liste **« à examiner »** qui nomme la table et la ligne
— jamais le texte, qui n'a pas à voyager dans cette réponse-là. Une note de cellule de
crise, la description d'un incident, la valeur d'une cellule rejetée à l'import : tout ce
que le registre déclare « signaler » y figure.

> ⚠️ *Jusqu'au 11/09/2026, le régime existait dans la base et la purge ne le lisait pas :
> elle ne connaissait que la description d'un incident, codée en dur. Une note de cellule de
> crise revenait donc classée « **anomalie** » — c'est-à-dire « une colonne que la purge
> aurait dû traiter » — alors que c'était une **décision**. Le rapport se trompait dans les
> deux sens à la fois : il accusait d'un défaut une décision délibérée, et il restait muet
> là où le registre promet qu'un humain sera prévenu.*

### Les documents portent enfin une classification

Sur chaque fiche de `/documents`, un bloc **Classification** :

| Champ | Ce qu'il sert |
|---|---|
| **Niveau de diffusion** | `public`, `interne`, `confidentiel`, `restreint` — obligatoire |
| **Contient des données personnelles** | à cocher si le document **nomme** des gens, pas s'il en *parle* |
| **Traitement RGPD dont il relève** | relie le document au registre de l'article 30 |
| **Étiquettes** | mots de classement libres (« audit 2026 », « client X ») |

Trois choses à savoir :

- **Le défaut est « interne »**, jamais « public » : un document dont personne n'a tranché la
  diffusion ne doit pas être réputé diffusable au dehors.
- **« Public » + « données personnelles » n'est PAS interdit** — un document public nomme
  légitimement son DPO (article 13). Mais la liste `/documents` vous le **signale** en tête,
  avec un bouton qui filtre : c'est la combinaison qu'un contrôle regarde en premier.
- **Une procédure qui DÉCRIT un traitement ne contient, elle, aucune donnée personnelle.**
  Le rattachement et la case ne disent donc pas la même chose, et rien ne force l'un à
  impliquer l'autre.

L'écran `/rgpd` compte pour vous les documents **porteurs de données personnelles sans
traitement rattaché** : ce n'est pas une faute — tout document nommant quelqu'un ne relève
pas d'un traitement déclaré —, c'est la liste par laquelle commence une revue.

---

## 6. Ressources humaines — `GRC-<CODE>-RH`

**Votre périmètre** : l'annuaire des personnes en *contribution*, les incidents et le RGPD
en *lecture*.

L'écran **Personnel** alimente l'autocomplétion de tous les champs « Responsable » du
produit. ⚠️ **Supprimer une fiche ne casse rien** : les noms restent enregistrés en texte
dans les fiches où ils ont été saisis ; vous retirez la suggestion, pas l'historique.

---

## 7. Auditeur externe — `GRC-<CODE>-AUDITEUR`

**Votre périmètre** : **lecture seule** — vingt-six domaines sur trente, avec les **mêmes
quatre exclusions que le RSSI** : ni le journal d'audit, ni les droits, ni les paramètres,
ni la **gestion des filiales**. ⚠️ Cette dernière manquait à l'énumération jusqu'au
09/09/2026 (constat **Q-277**) : l'incidence pratique est nulle, mais c'est l'exhaustivité
qui distingue un guide de droits d'une paraphrase.

⚠️ **Lire n'est pas exporter.** Extraire un jeu de données est une autorisation **distincte**
(`GRC-EXPORT`), qu'un auditeur ne reçoit pas par défaut. Si un bouton d'export est inerte,
c'est cette règle-là.

Ce que vous cherchez probablement : la **déclaration d'applicabilité** (SoA), le registre des
incidents, les rapports d'audit validés, et les circuits d'approbation — qui répondent à
« qui a validé cette politique, et sur quelle version ».

---

## 8. Administrateur — `GRC-ADMIN`

> ⚠️ **Ce groupe est l'une des DEUX exceptions à la règle de nommage, et c'est pour cela
> qu'il faut la lire.** Tous les autres groupes s'écrivent `GRC-<PÉRIMÈTRE>-<PROFIL>` —
> `GRC-TLS-RSSI`, `GRC-GROUPE-DIRECTION`. **`GRC-ADMIN` et `GRC-EXPORT` n'ont pas de segment
> de périmètre** : ils sont transversaux. Écrire `GRC-GROUPE-ADMIN` par analogie donne donc
> un nom **plausible et inexistant**, et c'est exactement ce que ce guide faisait jusqu'au
> 09/09/2026 (constat **Q-265** de la porte S7).
>
> ⚠️ **Et la conséquence est silencieuse**, ce qui la rend coûteuse : la résolution des
> droits ne *décompose* pas les noms de groupes, elle les **cherche** en base. Un groupe
> absent n'accorde rien et ne se plaint de rien — le compte d'administration entrerait
> **sans aucun droit**, sans un message qui l'explique. La liste qui fait foi est celle
> qu'engendre `backend/deploy/groupes-ad.sh --csv`, jamais celle qu'on recopie.

**Votre périmètre** : tout, au niveau *administration*, **sur le groupe entier**. Il n'existe
pas d'administrateur d'une seule filiale.

### Ce que vous seul pouvez faire

> ⚠️ **Deux de ces écrans ont changé de chemin le 16/09/2026**, et le guide le dit plutôt
> que de vous laisser chercher. Le socle de risques et l'activation des référentiels
> n'étaient pas des objets mais des **points de vue** — sur les risques pour l'un, sur les
> référentiels pour l'autre. Ils ont quitté le menu pour devenir des **onglets** de l'écran
> dont ils sont une vue : le menu passe de 32 entrées à 28, et plus aucun écran n'est sans
> porte. Le contenu, lui, n'a pas bougé d'une ligne.


| Geste | Où | À savoir |
|---|---|---|
| **Créer une filiale** | ⚠️ **Aucun écran — par l'API** (voir l'encadré sous ce tableau) | La réponse vous donne **la liste des groupes AD à créer** dans l'annuaire. Sans eux, personne n'entre — vous compris. |
| **Voir et gérer les droits** | **Administration → Habilitations** | ⚠️ **Écran neuf du 22/09/2026.** Quatre vues : la matrice, les groupes d'annuaire, les comptes, et les revues d'accès. Voir la section détaillée ci-dessous. |
| **Écrire au socle de risques** | Registre des risques → onglet **Socle du Groupe** | Ce que vous y mettez s'applique à **toutes** les filiales. |
| **Activer un référentiel** | Référentiels → onglet **Applicables ici** | ⚠️ À ne pas confondre avec « non applicable » par exigence : l'activation dit *quels référentiels s'appliquent à ce site*, le « non applicable » écarte *un point dans un référentiel pratiqué*. |
| **Lire le journal d'audit** | Journal d'audit | Trois ans d'identités et d'adresses IP. C'est un domaine à part, et ce n'est pas un hasard. |
| **Faire sortir une filiale** | ⚠️ **Aucun écran — par l'API** | ⚠️ **Exportez d'abord** — et faites-le faire par un compte qui porte `GRC-EXPORT`, l'export étant une permission distincte que `GRC-ADMIN` **ne donne pas** (constat Q-278). Une filiale sortie disparaît de tous les périmètres, et l'exporter après demanderait de contourner le cloisonnement. |

> ### ⚠️ La création d'une filiale reste sans écran — et cette phrase a déjà coûté cher une fois
>
> ⚠️ **Amendé le 22/09/2026, et il faut dire ce qui a changé.** Ce paragraphe affirmait
> qu'« il n'y a pas d'écran d'administration ». C'est devenu **faux pour les droits** :
> l'écran **Administration → Habilitations** existe depuis cette date, et il couvre les
> profils, les groupes d'annuaire, les comptes et les revues d'accès. Il ne couvre
> **toujours pas** la création ni la sortie d'une filiale, qui passent par l'API — et
> c'est ce que la suite décrit.
>
> *Laisser la phrase telle quelle aurait été la faute du 14/09 : une phrase devenue
> fausse sous un contrôle mécanique entièrement vert. Le banc sait dire qu'un CHIFFRE de
> ce document est faux ; il ne sait pas dire qu'une PHRASE l'est devenue.*
>
> Ce tableau renvoyait à un écran « Administration » **qui n'existe pas** : mesuré à la porte
> S7 (constat **Q-266**), l'application compte 29 entrées de menu et **aucune n'ouvre un
> écran de ce nom**. ⚠️ *La barre latérale porte bien l'intitulé « Administration » — c'est
> un titre de SECTION, pas une entrée, et il ne mène nulle part. La phrase disait « aucune
> ne porte ce nom » et se serait fait contredire par le premier exploitant qui aurait
> regardé (constat B-9). La conclusion, elle, ne bouge pas : il n'y a pas d'écran.*
> Les routes, elles, existent bel et bien côté serveur ; c'est l'interface qui n'a pas été
> construite. Un exploitant restait donc bloqué **au moment exact que ce guide devait
> couvrir** — l'intégration d'une société rachetée.
>
> **En attendant l'écran, voici le chemin réel.** Les deux opérations exigent le profil
> *Administration* **et** un périmètre Groupe, et elles sont journalisées comme telles.
>
> **1. Ouvrir une session et garder son cookie** (`grc_session` par défaut, réglable par
> `SESSION_NOM_COOKIE`) :
>
> ```bash
> curl -sc /tmp/grc.cookies -X POST https://grc-test.site/api/connexion \
>      -H 'content-type: application/json' \
>      -d '{"identifiant":"admin.grc","motDePasse":"…"}'
> ```
>
> **2. Créer la filiale** — la réponse porte **la liste des groupes AD à créer** :
>
> ```bash
> curl -sb /tmp/grc.cookies -X POST https://grc-test.site/api/filiales \
>      -H 'content-type: application/json' \
>      -d '{"code":"LYO","raison_sociale":"… SAS","pays":"FR"}'
> ```
>
> **3. Faire sortir une filiale** — `POST /api/cycle/sortie-filiale` ; la purge RGPD est une
> opération distincte, `POST /api/cycle/purge-rgpd`. **Exportez avant**, avec un compte qui
> porte `GRC-EXPORT`.
>
> `code` et `raison_sociale` sont **obligatoires** ; `pays` est facultatif et s'écrit sur deux
> lettres majuscules (ISO 3166-1 alpha-2 : `FR`, `DE`, `ES`).
>
> ⚠️ **Effacez le fichier de cookies après usage** : il vaut une session d'administration
> Groupe. `rm -f /tmp/grc.cookies`.
>
> **Cette procédure a été JOUÉE sur la recette le 09/09/2026**, à travers Apache, et non
> écrite de mémoire — c'est précisément ce qui manquait aux quatre affirmations que la porte
> S7 a démenties. Relevé : connexion → **200** et cookie posé ; `POST /api/filiales` avec un
> corps vide → **400**, « *Le champ « code » est obligatoire pour créer une filiale* » ;
> `POST /api/cycle/sortie-filiale` → **400**, « *Le champ « filiale_id » est obligatoire* » ;
> et, en témoin, la **même requête sans cookie** → **401**. Aucune filiale n'a été créée : la
> recette n'en porte volontairement aucune de plus (constat **Q-155** — une filiale active
> supplémentaire ferait basculer le périmètre Groupe des sessions ouvertes).
>
> ⚠️ **Et n'inventez pas les groupes AD à partir de la réponse** : créez exactement ceux
> qu'elle nomme, ou engendrez-les avec `backend/deploy/groupes-ad.sh --powershell`, qui rend
> le script prêt à jouer côté annuaire. Le §8 ci-dessus dit pourquoi un nom approchant
> n'accorde rien.

### L'écran Habilitations — qui a le droit de faire quoi

**Administration → Habilitations**, quatre onglets. C'est le seul endroit du produit qui
montre le modèle de droits, et c'est la pièce qu'un auditeur ISO 27001 réclame au titre
de l'**A.5.18**.

> 🛑 **Ce logiciel n'écrit JAMAIS dans l'Active Directory.** Il le lit, compare ce qu'il
> y trouve à ce qu'il attend, et vous rend **la liste des groupes à créer**. La création,
> comme le retrait d'une personne d'un groupe, se fait dans l'annuaire, par son
> administrateur. Ce n'est pas une prudence de rédaction : le produit n'a **aucune**
> capacité d'écriture LDAP.

> ⚠️ **Les droits sont résolus à la connexion et figés dans la session.** Une
> modification faite ici ne s'applique aux personnes concernées qu'à leur **prochaine
> connexion** — leur session en cours garde les droits qu'elle a reçus. Pour un effet
> immédiat, il faut révoquer leurs sessions. L'écran le dit en permanence, et non
> seulement après coup : quelqu'un qui vient fermer un accès en urgence doit le savoir
> **avant** de cliquer.

**1. Matrice des droits.** Les trente domaines fonctionnels en lignes, les profils en
colonnes, le niveau dans la case — de « aucun » à « administration ». Cliquer l'en-tête
d'une colonne ouvre le profil correspondant et permet de le modifier, domaine par
domaine. Elle **s'imprime** : c'est sous cette forme qu'on la remet à un auditeur.

> ⚠️ **« Non ouvert » et « Aucun » ne sont pas la même chose**, et la distinction se
> relit en revue de droits. Les deux refusent le domaine ; mais « Aucun » le ferme
> **explicitement**, ce qui se voit, là où une absence ne se voit pas.

> ⚠️ **Les couleurs de cette matrice ne sont pas celles des statuts de conformité.** Un
> niveau de droit n'est pas un statut : « lecture » n'est pas « partiellement conforme ».
> La graduation est une intensité de bleu, et c'est délibéré — employer le vert et le
> rouge ferait lire un tableau d'habilitations comme un tableau de risques.

**2. Groupes d'annuaire.** La correspondance entre un groupe de l'AD et ce que le
produit en fait : périmètre, filiale, profil, droit d'export, administration.

Le bouton **« Vérifier l'annuaire »** est le plus utile de l'écran. Il confronte trois
listes — ce que la convention attend, ce que l'application déclare, ce que l'annuaire
contient — et nomme quatre écarts. 🛑 **Le premier est celui qui coûte le plus** :
*déclaré ici, introuvable dans l'annuaire*. Un compte de ce groupe entre dans le
produit, n'obtient **aucun droit**, et le seul symptôme est quelqu'un qui dit « je ne
vois rien ». Ce contrôle a trouvé trois groupes dans ce cas le jour de sa mise en
service.

**« Synchroniser la déclaration »** ajoute à l'application les groupes que la convention
attend. ⚠️ Elle écrit **dans le produit**, pas dans l'annuaire, et elle n'efface jamais
rien : un groupe retiré du dispositif se **désactive**, ce qui conserve la trace de ce
qu'il accordait.

**3. Comptes.** Qui s'est connecté, quand, et depuis quelle filiale par défaut. Un
compte n'apparaît ici qu'à partir de sa **première connexion** : le produit ne recopie
pas l'annuaire, il le lit.

C'est ici que vit **« Que verrait ce compte ? »**, qui répond en cinq secondes à la
question la plus posée à un administrateur — *« pourquoi X ne voit pas l'écran Y ? »*.
Saisissez un login : le produit interroge l'annuaire, résout ses groupes — imbrications
comprises —, et affiche le périmètre, les filiales, le droit d'export et les trente
domaines qu'il obtiendrait. **Aucun mot de passe n'est demandé, et rien n'est écrit.**

⚠️ Il nomme aussi les **groupes portés mais IGNORÉS** par l'application. C'est la cause
numéro un d'un compte qui entre et ne voit rien.

**4. Revues des accès.** L'exigence A.5.18, et la seule vue qui produise une pièce.

« Ouvrir une revue » lit l'annuaire et **fige** la liste de qui appartient à chaque
groupe déclaré. Chaque ligne se décide — *maintenu*, *à retirer*, *à vérifier* —, et la
décision porte **son auteur et sa date**. Un retrait ou une vérification demande un
**motif** : c'est lui qu'on relira dans six mois, quand personne ne se souviendra du
contexte. À la clôture, une **conclusion** est exigée : une revue close sans conclusion
n'atteste que du fait d'avoir regardé.

> ⚠️ **Deux signaux à chercher en priorité**, et l'écran les met en avant :
> **un compte désactivé dans l'annuaire et encore membre d'un groupe d'accès** —
> l'anomalie la plus fréquente —, et **un accès obtenu par imbrication**, qui ne se voit
> pas dans le groupe lui-même et qu'une revue faite à la main oublie.

> ⚠️ **Vous pouvez clore une revue dont des lignes restent à examiner**, et le produit
> les compte — dans la revue et au journal. L'interdire rendrait une revue de quatre
> cents lignes dont douze restent en suspens impossible à clore, donc laissée ouverte
> indéfiniment ; et une revue jamais close ne prouve rien du tout.

> 🛑 **Une revue close ne se modifie plus.** C'est ce qui lui donne sa valeur : une pièce
> qu'on peut retoucher après coup n'atteste de rien. Pour revenir sur une décision, on
> ouvre une nouvelle revue.

> ⚠️ **L'instantané ne se rafraîchit jamais.** Une revue close cite des personnes qui ont
> pu quitter le groupe depuis — c'est voulu : c'est ce qu'on a revu.

---

⚠️ **Créer ou retirer une filiale change le périmètre des sessions Direction en cours.**
Jusqu'à leur reconnexion, elles perdent les lectures de portée Groupe. Prévenez-les.

---

## 8 bis. Ouvrir le produit à un autre outil — et surveiller par lui-même

Deux écrans, réservés à l'administration, ouvrent le produit vers l'extérieur.

### Paramètres → **Ouverture technique**

**Un jeton d'API** laisse un autre système — un outil de tickets, un tableau de bord, un
script — parler à ce produit **sans compte humain**.

⚠️ **Son secret ne s'affiche qu'une fois.** Copiez-le à ce moment-là : le serveur n'en
garde qu'une empreinte et ne sait pas le retrouver. S'il est perdu, on en émet un autre et
on révoque celui-ci.

⚠️ **Un jeton ne peut jamais porter plus que vous.** Vous choisissez ses domaines et son
niveau parmi les vôtres ; le serveur refuse le reste, et il vous dit lequel. C'est
voulu : un accès qui survit à votre session ne doit pas pouvoir dépasser ce que vous
pouviez faire quand vous l'avez ouvert.

⚠️ **Révoquer coupe l'accès immédiatement**, et **ne supprime pas la ligne** : qui l'a
émis, quand, et qui l'a coupé restent visibles. C'est ce qu'un auditeur vient chercher.

**Un abonnement** fait partir un événement vers un outil tiers quand quelque chose arrive
ici : un incident créé, une approbation refusée, une action ouverte, une échéance
franchie. L'événement dit **qu'il s'est passé quelque chose et où le trouver** — il ne
porte ni le titre, ni la description : votre outil vient les chercher avec son jeton.

⚠️ **Rien ne part tant que votre exploitant n'a pas ouvert la sortie réseau du service.**
L'écran vous le dit, et la file se remplit en attendant. Ce n'est pas une panne.

### Mesures de sécurité → **Collecte automatique**

Un **connecteur** va regarder une source — un dépôt de sauvegarde, le démon antivirus,
un groupe de l'annuaire — et rapporte une **preuve datée**, rattachée à une mesure.

⚠️ **« Indéterminé » n'est ni vert ni rouge**, et c'est le point important. Une source
injoignable n'est pas un contrôle en échec : c'est un contrôle qu'on **n'a pas pu faire**.
Le produit ne dira **jamais** « conforme » pour un test qui n'a pas tourné.

⚠️ **Une preuve périmée redevient absente.** Une sauvegarde constatée réussie il y a onze
mois n'est pas une preuve de sauvegarde : c'est la preuve qu'on sauvegardait il y a onze
mois. La fraîcheur attendue se règle sur le connecteur.

⚠️ **Le passage au rouge ouvre une action**, rattachée à la mesure — vous la retrouvez
dans votre plan d'actions. Rester rouge n'en ouvre pas d'autre.

⚠️ **Une collecte ne décide pas de votre conformité.** Elle constate un fait ; c'est vous
qui évaluez la mesure. Un produit qui passerait une mesure au vert parce qu'un script a
répondu « OK » remplacerait votre jugement par un test de connexion.

---

## 8 ter. L'assistance par IA — ce qu'elle fait, et ce qu'elle ne fera jamais

*Paramètres → Assistance IA.*

**Elle PROPOSE ; vous décidez.** Cinq usages, et pas un de plus : correspondances entre
référentiels, brouillon de politique, résumé d'incident, réponse à un questionnaire
client, recherche en langage courant.

⚠️ **Aucun de ces usages n'écrit dans vos données.** L'écran compose une demande, vous
montre le texte **exact** avant qu'il parte, l'envoie si vous le lui dites, et affiche ce
qui revient. Ce que vous en retenez, vous le recopiez vous-même — délibérément.

⚠️ **« Indisponible » n'est pas une panne.** Si la source est coupée, si aucun modèle
n'est installé, ou si la réponse est illisible, le produit **le dit** et ne remplit pas le
trou. Un outil qui sert de preuve en audit ne doit jamais inventer.

⚠️ **Et l'assistance ne conclut jamais à votre place** : elle ne qualifie pas un incident
au regard de NIS2 ou du RGPD, elle ne publie aucune politique — le circuit d'approbation
reste seul maître —, et elle n'envoie aucune réponse à un client.

**Si un bandeau rouge est affiché**, le mode externe est actif pour votre filiale : ce que
vous soumettez part chez le fournisseur nommé, à l'hébergement indiqué, et **chaque envoi
est journalisé**. Le bandeau ne se ferme pas, et c'est voulu — *ce qu'on ne voit pas
devient une habitude.*

---

## 9. Langue

Le sélecteur de langue est dans l'interface. La valeur par défaut vient de votre filiale ;
votre choix vaut pour votre poste et survit à un rechargement.

⚠️ **Les messages de refus du serveur restent en français**, même en interface anglaise.
C'est déclaré, pas oublié — les traduire demanderait que le serveur connaisse une langue,
et c'est un travail à part.

---

## 10. Quand quelque chose refuse

| Ce que vous lisez | Ce que cela veut dire | Ce qu'il faut faire |
|---|---|---|
| « Votre profil ne donne pas accès… » | le **domaine** manque | demandez-le à votre administrateur |
| « … relève d'un profil de validation » | le **niveau** manque | quelqu'un d'autre doit approuver |
| « L'export est une autorisation distincte » | il manque `GRC-EXPORT` | c'est **volontaire** : lire n'est pas extraire |
| « Cet enregistrement a été modifié » | quelqu'un est passé avant vous | rechargez — **votre saisie est conservée** |
| « Votre périmètre a changé » | vos filiales ou vos droits ont bougé | reconnectez-vous |
| « Le serveur n'est pas joignable » | incident d'exploitation | réessayez ; **rien n'est perdu**, l'écriture n'a pas eu lieu |
