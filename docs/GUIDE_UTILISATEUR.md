# Guide utilisateur — Cyber GRC Édition Groupe

> **Pour qui** : les huit profils du produit. Chacun a sa section — lisez la vôtre, le reste
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

### Deux personnes sur la même fiche

Si quelqu'un a modifié la fiche depuis que vous l'avez ouverte, l'enregistrement est
**refusé** et vous êtes invité à recharger. Votre saisie n'est pas perdue : elle reste à
l'écran. C'est délibéré — écraser silencieusement le travail d'un collègue est le risque
n° 1 de ce produit.

---

## 1. RSSI de filiale — `GRC-<CODE>-RSSI`

**Votre périmètre** : votre filiale, **tous les domaines**, au niveau *validation* — vous
lisez, vous écrivez, et vous **approuvez**.

### Ce que vous faites au quotidien

| Écran | Ce qu'il sert |
|---|---|
| **Tableau de bord** | l'état de votre filiale en un coup d'œil, avec les tendances |
| **Échéancier** | tout ce qui est daté et qui approche — plan d'actions, revues, déclarations |
| **Risques (EBIOS)** | l'analyse : fréquence × gravité × maîtrise, brut et résiduel |
| **Conformité** | l'évaluation des référentiels applicables, et la déclaration d'applicabilité |
| **Approbations** | ce qui attend votre décision |

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

### Importer des données

L'écran **Imports** couvre les 23 entités. Trois propriétés à connaître :

- **Tout ou rien** — un fichier passe entièrement ou pas du tout. Une coupure au milieu ne
  laisse jamais votre filiale à moitié remplie.
- **L'aperçu n'écrit rien.** Regardez-le : il vous donne le compte exact et la liste des
  lignes fautives, **avec leur numéro et la colonne du fichier**.
- **Réenvoyer le même fichier ne crée rien**, et vous le dit. Un fichier modifié d'un seul
  octet est en revanche un fichier neuf.

⚠️ **L'import CRÉE ; il ne met pas à jour et ne supprime pas.** Pour remplacer un jeu
entier, c'est la reprise d'une sauvegarde, dans *Paramètres*.

---

## 2. Direction — `GRC-GROUPE-DIRECTION`

**Votre périmètre** : toutes les filiales actives, en **lecture**, sur le pilotage et la
conformité.

| Écran | Ce qu'il sert |
|---|---|
| **Vision Groupe** | une ligne par filiale, plus le total — la comparaison que le reste du produit rend possible |
| **Synthèse Direction** | la vue d'une filiale, pour entrer dans le détail |
| **Échéancier** | ce qui arrive à terme, toutes filiales confondues |

⚠️ **Ce que votre profil ne montre PAS, et c'est à savoir avant de vous en étonner** : le
profil *Direction* livré avec le produit n'ouvre **ni les risques, ni les incidents**. Sur
l'écran Vision Groupe, ces colonnes affichent donc `—`, et non `0`.

**Ce n'est pas une panne, et ce n'est probablement pas ce que vous voulez.** Si la direction
doit voir combien de risques critiques porte chaque filiale, il faut ajouter les domaines
`risques` et `incidents` au profil — c'est une décision d'administration, pas un
développement. Voir le constat **Q-181** au registre du projet.

---

## 3. Contributeur — `GRC-<CODE>-CONTRIB`

**Votre périmètre** : votre filiale, sur **quatre domaines** — actifs, plan d'actions,
incidents, actions préalables (MCO) —, au niveau *contribution*.

Vous **saisissez et modifiez**, vous ne **validez pas**. Concrètement : vous rédigez une
politique, vous ne l'approuvez pas ; vous déclarez un incident, vous ne clôturez pas le
circuit d'acceptation d'un risque.

⚠️ Si un bouton d'approbation n'apparaît pas, c'est votre niveau — pas un défaut d'écran.
Et si vous atteigniez la fonction autrement, **le serveur refuserait aussi** : l'interface
reflète la règle, elle ne l'applique pas.

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
- **Incidents** : vous suivez les déclarations CNIL — le produit calcule le **délai de 72 h**
  à partir de la date de détection et le fait remonter dans l'Échéancier.

⚠️ **Les purges de données personnelles anonymisent, elles ne suppriment pas.** Le produit
stocke les noms **en texte** dans les fiches ; effacer seulement l'annuaire laisserait les
noms partout ailleurs. Et **les incidents ne sont jamais purgés automatiquement** : une
description peut contenir un nom comme elle peut contenir la seule preuve d'un incident —
le produit vous les signale, vous tranchez.

⚠️ **Le journal d'audit n'est jamais purgé**, RGPD compris. Il est en ajout seul et chaîné :
y toucher casserait la preuve. Sa rétention est une procédure d'exploitation à trois ans.

---

## 6. Ressources humaines — `GRC-<CODE>-RH`

**Votre périmètre** : l'annuaire des personnes en *contribution*, les incidents et le RGPD
en *lecture*.

L'écran **Personnel** alimente l'autocomplétion de tous les champs « Responsable » du
produit. ⚠️ **Supprimer une fiche ne casse rien** : les noms restent enregistrés en texte
dans les fiches où ils ont été saisis ; vous retirez la suggestion, pas l'historique.

---

## 7. Auditeur externe — `GRC-<CODE>-AUDITEUR`

**Votre périmètre** : **lecture seule**, sur presque tout — mais pas sur le journal d'audit,
ni sur les droits, ni sur les paramètres.

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

| Geste | Où | À savoir |
|---|---|---|
| **Créer une filiale** | ⚠️ **Aucun écran — par l'API** (voir l'encadré sous ce tableau) | La réponse vous donne **la liste des groupes AD à créer** dans l'annuaire. Sans eux, personne n'entre — vous compris. |
| **Écrire au socle de risques** | Socle de risques | Ce que vous y mettez s'applique à **toutes** les filiales. |
| **Activer un référentiel** | Référentiels applicables | ⚠️ À ne pas confondre avec « non applicable » par exigence : l'activation dit *quels référentiels s'appliquent à ce site*, le « non applicable » écarte *un point dans un référentiel pratiqué*. |
| **Lire le journal d'audit** | Journal | Trois ans d'identités et d'adresses IP. C'est un domaine à part, et ce n'est pas un hasard. |
| **Faire sortir une filiale** | ⚠️ **Aucun écran — par l'API** | ⚠️ **Exportez d'abord** — et faites-le faire par un compte qui porte `GRC-EXPORT`, l'export étant une permission distincte que `GRC-ADMIN` **ne donne pas** (constat Q-278). Une filiale sortie disparaît de tous les périmètres, et l'exporter après demanderait de contourner le cloisonnement. |

> ### ⚠️ Il n'y a pas d'écran d'administration — et c'était la promesse la plus coûteuse de ce guide
>
> Ce tableau renvoyait à un écran « Administration » **qui n'existe pas** : mesuré à la porte
> S7 (constat **Q-266**), l'application compte 31 entrées de menu et aucune ne porte ce nom.
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
> curl -sc /tmp/grc.cookies -X POST https://grc.exemple.interne/api/connexion \
>      -H 'content-type: application/json' \
>      -d '{"identifiant":"admin.grc","motDePasse":"…"}'
> ```
>
> **2. Créer la filiale** — la réponse porte **la liste des groupes AD à créer** :
>
> ```bash
> curl -sb /tmp/grc.cookies -X POST https://grc.exemple.interne/api/filiales \
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

⚠️ **Créer ou retirer une filiale change le périmètre des sessions Direction en cours.**
Jusqu'à leur reconnexion, elles perdent les lectures de portée Groupe. Prévenez-les.

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
