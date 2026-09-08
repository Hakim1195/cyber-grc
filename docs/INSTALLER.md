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

## Les dix commandes

```bash
# 1 — Récupérer le produit
git clone https://github.com/Hakim1195/cyber-grc.git
cd cyber-grc

# 2 — Déclarer vos filiales (le script ne peut pas les inventer)
sudo install -D -m 0640 backend/deploy/filiales.conf.exemple /etc/cyber-grc/filiales.conf
sudo $EDITOR /etc/cyber-grc/filiales.conf

# 3 — Installer. Le script pose les six questions, engendre les secrets,
#     pose PostgreSQL 17, la base, le service, Apache et le certificat.
sudo bash backend/deploy/install.sh

# 4 — Constater. Douze sujets contrôlés, chaque ligne dit quoi faire.
sudo bash backend/deploy/install.sh --diagnostic

# 5 — Engendrer les groupes Active Directory à créer chez vous
sudo bash backend/deploy/groupes-ad.sh --csv

# 6 — (chez l'administrateur du domaine) créer ces groupes, puis y mettre les personnes

# 7 — Ouvrir https://votre-nom/ et se connecter avec un compte de l'annuaire
```

⚠️ **L'étape 4 n'est pas décorative.** Un jour, le dépôt était vert pendant que la machine
servait encore l'ancien fichier, et une fuite restait ouverte en vol (constat **Q-103**).
*Un banc vert sur l'arbre ne dit rien du commit, et un commit vert ne dit rien de la
machine.*

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
