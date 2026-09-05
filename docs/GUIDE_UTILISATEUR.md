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
de droit sont écrits au **journal d'audit**, qui ne peut être ni modifié ni effacé. Les
suppressions y conservent **le différentiel**, pas l'enregistrement entier.

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

## 8. Administrateur — `GRC-GROUPE-ADMIN`

**Votre périmètre** : tout, au niveau *administration*, **sur le groupe entier**. Il n'existe
pas d'administrateur d'une seule filiale.

### Ce que vous seul pouvez faire

| Geste | Où | À savoir |
|---|---|---|
| **Créer une filiale** | Administration | La réponse vous donne **la liste des groupes AD à créer** dans l'annuaire. Sans eux, personne n'entre — vous compris. |
| **Écrire au socle de risques** | Socle de risques | Ce que vous y mettez s'applique à **toutes** les filiales. |
| **Activer un référentiel** | Référentiels applicables | ⚠️ À ne pas confondre avec « non applicable » par exigence : l'activation dit *quels référentiels s'appliquent à ce site*, le « non applicable » écarte *un point dans un référentiel pratiqué*. |
| **Lire le journal d'audit** | Journal | Trois ans d'identités et d'adresses IP. C'est un domaine à part, et ce n'est pas un hasard. |
| **Faire sortir une filiale** | Administration | ⚠️ **Exportez d'abord.** Une filiale sortie disparaît de tous les périmètres, et l'exporter après demanderait de contourner le cloisonnement. |

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
