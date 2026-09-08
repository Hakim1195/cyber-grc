# Installer Cyber GRC — en dix minutes

> **Une page, dix commandes, aucun renvoi.** Si vous devez ouvrir un autre fichier pour
> finir cette page, c'est un défaut de cette page : signalez-le.
>
> Pour l'exploitation courante — sauvegardes, rétention, acquisitions, diagnostic des
> pannes déjà rencontrées — voir [`GUIDE_EXPLOITATION.md`](GUIDE_EXPLOITATION.md).

## Ce qu'il vous faut avant de commencer

| | |
|---|---|
| **Machine** | Debian 13, 4 Go de RAM, 40 Go de disque, accès root |
| **Réseau** | un nom DNS qui pointe vers elle, et un certificat TLS pour ce nom |
| **Annuaire** | l'URL LDAPS de votre Active Directory, et **un compte de service en lecture seule** |
| **Filiales** | la liste des entités à créer — code court et raison sociale |

**Et c'est tout.** Le produit lit **68 variables de configuration** ; il ne vous en demande
que **six**, parce que ce sont les seules qu'il ne peut pas deviner :

```
SERVEUR_URL_PUBLIQUE              https://grc.votre-domaine.interne
LDAP_URL                          ldaps://dc01.votre-domaine.interne:636
LDAP_BASE_RECHERCHE               DC=votre-domaine,DC=interne
LDAP_DN_SERVICE                   CN=svc-grc,OU=Services,DC=votre-domaine,DC=interne
LDAP_MOT_DE_PASSE_SERVICE         (le mot de passe de ce compte)
SMTP_HOTE                         smtp.office365.com     ← seulement si vous voulez les relances
```

Tout le reste porte un défaut sûr, et les secrets internes sont **engendrés** par
l'installateur — il ne vous les demandera jamais, et ne les affichera jamais.

---

## Les cinq commandes

```bash
# 1 — Récupérer le produit
git clone https://github.com/Hakim1195/cyber-grc.git
cd cyber-grc

# 2 — Installer. L'assistant pose les six questions, engendre les secrets,
#     déclare vos filiales, puis pose PostgreSQL 17, la base, le service et Apache.
sudo bash backend/deploy/install.sh --assistant

# 3 — Constater. Douze sujets contrôlés, chaque ligne dit quoi faire.
sudo bash backend/deploy/install.sh --diagnostic

# 4 — Engendrer le script des groupes Active Directory, prêt à exécuter
sudo bash backend/deploy/groupes-ad.sh --powershell \
     --ou 'OU=Cyber GRC,OU=Groupes,DC=votre-domaine,DC=interne' > creer-groupes-grc.ps1

# 5 — Faire exécuter creer-groupes-grc.ps1 par l'administrateur du domaine,
#     puis ouvrir https://votre-nom/ et se connecter avec un compte de l'annuaire
```

**L'étape 4 est idempotente** : relancée après une acquisition, elle ne crée que ce qui
manque, et **elle ne supprime jamais rien** — retirer un groupe retirerait des accès sans
que personne l'ait décidé. Régénérez-la après chaque acquisition : la liste change, le
fichier non.

*Vous préférez tout écrire à la main ?* `install.sh` sans `--assistant` fonctionne comme
avant : il s'arrête en code 2 en nommant ce qui manque dans `/etc/cyber-grc/env`, et la
déclaration des filiales se pose depuis `backend/deploy/filiales.conf.exemple`.

⚠️ **L'étape 4 n'est pas décorative.** Un jour, le dépôt était vert pendant que la machine
servait encore l'ancien fichier, et une fuite restait ouverte en vol (constat **Q-103**).
*Un banc vert sur l'arbre ne dit rien du commit, et un commit vert ne dit rien de la
machine.*

---

## Juste voir le produit ? Le profil découverte

À la question « raccorder le produit à votre Active Directory maintenant ? », répondez
**non**. L'assistant pose alors une installation de **découverte** : pas d'annuaire, pas de
courriel, un certificat auto-signé, et un **compte de secours** que vous choisissez — sans
lui, l'installation serait complète et personne ne pourrait entrer.

⚠️ **Ce n'est pas une installation de production, et elle le dit partout** : dans la
configuration (`CYBER_GRC_PROFIL=decouverte`), en réserve au `--diagnostic`, et par un
bandeau dans le produit. **N'y saisissez pas de données réelles.** Un profil dégradé qu'on
ne voit pas devient une production par oubli.

Le compte de secours donne l'administration Groupe et **chacun de ses usages est
journalisé** ; son mot de passe n'est jamais écrit sur le disque — seule une empreinte
`scrypt`, calculée par le code du produit lui-même, entre dans la configuration.

---

## Les trois choses qui se passent mal, et leur réparation

| Ce que vous voyez | Ce que c'est | Ce qu'il faut faire |
|---|---|---|
| `install.sh` s'arrête en **code 2** en nommant des variables | Une valeur qui vient de **votre** SI manque — le script refuse de deviner | Complétez `/etc/cyber-grc/env`, relancez. **Les secrets déjà engendrés sont conservés** |
| `https://votre-nom/` rend **403** | La liste blanche de publication ne couvre pas « / » (constat **Q-36**) | `sudo bash backend/deploy/install.sh --maj` |
| Personne ne peut se connecter | L'annuaire est injoignable, ou les groupes `GRC-*` n'existent pas encore | `--diagnostic` le dit sur sa ligne « annuaire ». Puis étape 5 |

**Une installation à moitié faite est pire qu'une installation refusée** : c'est pour cela
que le script s'arrête au lieu de continuer avec des valeurs inventées.

---

## Mettre à jour

```bash
git pull
sudo bash backend/deploy/install.sh --maj              # compile, déploie, redémarre
sudo bash backend/deploy/install.sh --diagnostic       # et vérifie que c'est bien servi
```

⚠️ **Ne republiez JAMAIS par une copie à la main.** Le jeton de version d'`index.html`
dérive du contenu : une copie manuelle sert un fichier que les navigateurs gardent en cache
un mois.

---

## Désinstaller

```bash
sudo bash backend/deploy/install.sh --desinstaller     # retire le LOGICIEL, garde les DONNÉES
```

Pour détruire aussi la base, les pièces jointes et les secrets, il faut le demander
explicitement **et** fournir un export vérifié — le journal d'audit a une rétention de
trois ans et fait preuve en audit :

```bash
sudo bash backend/deploy/install.sh --desinstaller --avec-les-donnees \
     --export-verifie=/chemin/vers/export-grc-backup.json
```

---

## Ce que l'installateur ne fera pas à votre place

- **Il n'écrit pas dans votre Active Directory.** Il lit les appartenances et vous *rend la
  liste* des groupes à créer. Une application exposée qui écrit dans l'annuaire du client
  est ce qu'un RSSI refuse.
- **Il ne charge aucune donnée de démonstration.** À la première ouverture les écrans sont
  vides, et c'est voulu : un outil qui affiche « aucun risque » sur une base vide ne ment
  pas.
- **Il ne remplace pas un mot de passe de rôle existant**, ni ne reprend la propriété d'une
  base existante, sans qu'on le lui demande. Sur un outil qui héberge le PCA d'un groupe
  industriel, on ne bricole pas la base de production en silence.
