# Installer Cyber GRC — en dix minutes

> **Une page, cinq commandes.** Si vous devez ouvrir un autre fichier pour **finir
> l'installation**, c'est un défaut de cette page : signalez-le.
>
> ⚠️ *Cette ligne promettait « aucun renvoi » — et le 25/09/2026 j'en ai posé un juste en
> dessous, vers le déroulé de première mise en service. La promesse était donc devenue fausse
> **dans le fichier qui l'énonce**. Elle est précisée plutôt que retirée : aucun renvoi n'est
> nécessaire pour **finir l'installation**, et celui ci-dessous vise un autre besoin — se
> PRÉPARER, avant d'avoir la machine. Une promesse qu'on ne peut plus tenir se reformule ; on
> ne la laisse pas se contredire deux lignes plus bas.*
>
> ⚠️ *Cette ligne annonçait « dix commandes » quand la page en titrait **cinq** — et c'est
> le constat **Q-275** lui-même, refait DANS le fichier qu'il visait. Corrigé le 25/09/2026.*
>
> 🛑 **PREMIÈRE MISE EN SERVICE CHEZ UN CLIENT ? Lisez d'abord
> [`INSTALLATION_ENTREPRISE.md`](INSTALLATION_ENTREPRISE.md).** Cette page-ci décrit **le
> chemin** ; celle-là décrit **la préparation** — ce qu'il faut obtenir, de qui, et dans quel
> ordre. Trois choses font échouer une première installation, et **aucune des trois n'est sur
> cette page** : le certificat TLS (en production l'installateur n'en engendre aucun), la
> sortie réseau que l'unité systemd ferme, et le fait que **personne n'est administrateur
> tant que personne n'est dans `GRC-ADMIN`**.
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

# ⚠️ CLONEZ AVEC VOTRE COMPTE, JAMAIS « sudo git clone » : le dépôt
#     appartiendrait à root, et un « git pull » ultérieur refuserait de
#     l'ouvrir (« detected dubious ownership »). C'est `install.sh` qui a
#     besoin de root, pas git. Après l'installation, `node_modules/` et
#     `dist/` appartiendront à root — c'est normal et sans effet.

# 2 — Installer. L'assistant pose les six questions, engendre les secrets,
#     déclare vos filiales, puis pose PostgreSQL 17, la base, le service et Apache.
sudo bash backend/deploy/install.sh --assistant

# 3 — Constater. Quinze sujets contrôlés, chaque ligne dit quoi faire.
sudo bash backend/deploy/install.sh --diagnostic

# 4 — Engendrer le script des groupes Active Directory, prêt à exécuter
sudo bash backend/deploy/groupes-ad.sh --powershell \
     --ou 'OU=Cyber GRC,OU=Groupes,DC=votre-domaine,DC=interne' > creer-groupes-grc.ps1

# 5 — Faire exécuter creer-groupes-grc.ps1 par l'administrateur du domaine,
#     ET lui faire AJOUTER VOTRE COMPTE À « GRC-ADMIN » — sans quoi vous entrerez
#     sans aucun droit (403). Puis ouvrir https://votre-nom/ et se connecter avec
#     votre identifiant et votre mot de passe Active Directory habituels.
```

⚠️ **L'étape 2 porte vos filiales EN BASE** — c'est là que `filiales.conf` cesse d'être un
fichier et devient le périmètre du produit. Elle ne le fait **qu'une fois**, si la base n'en
connaît aucune : à partir de là, c'est la base qui fait foi, et une acquisition se déclare
dans le produit (**Administration → Filiales**), jamais en éditant ce fichier. L'étape 4 lit
donc la base, plus le fichier.

> 🛑 **Sans cette étape, l'installation aurait l'air réussie et ne servirait qu'à vous.**
> C'est un défaut mesuré le 24/09/2026 : votre annuaire recevait les 26 groupes, le produit
> n'en déclarait que 10, et seul `GRC-ADMIN` — qui ne dépend d'aucune filiale — accordait
> quelque chose. Tous les comptes de filiale entraient **sans le moindre droit, en
> silence**. Migrations `064` et `065`.

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

### Sans terminal — un agent, un script

L'assistant exige un terminal. Sans terminal, le profil découverte se pose en **quatre
lignes dans `/etc/cyber-grc/env`** (créé depuis `backend/.env.example` au premier passage,
qui s'arrête alors en code 2 en nommant ce qui manque) :

```
SERVEUR_URL_PUBLIQUE=https://<nom-de-la-machine>
CYBER_GRC_PROFIL=decouverte
AUTH_LDAP_ACTIF=non
SMTP_ACTIF=non
```

Le premier passage crée `env` et s'arrête en code 2 en nommant `SERVEUR_URL_PUBLIQUE` **et**
`LDAP_MOT_DE_PASSE_SERVICE` (le modèle porte `AUTH_LDAP_ACTIF=oui`) ; posez les quatre lignes **et au moins une filiale** dans
`/etc/cyber-grc/filiales.conf` — `TLS ; Site de Toulouse ; FR ; oui` — car sans filiale active
**personne** ne peut ouvrir de session, pas même le compte de secours, et l'installateur
s'arrête désormais en le disant ; le deuxième s'arrête en nommant `AUTH_COMPTE_SECOURS_EMPREINTE` **et les
deux issues** ; le troisième, avec le mot de passe du compte de secours **par un fichier 0600,
jamais en argument ni dans l'environnement**, effacé une fois l'empreinte posée, va au bout —
certificat auto-signé engendré au nom de l'URL, vhost **nommé et activé**, compte `secours.grc` :

```bash
sudo bash -c 'umask 077; openssl rand -base64 18 > /root/secours.txt'   # ENGENDRÉ : aucun secret sur une ligne de commande
sudo cat /root/secours.txt                                              # VOUS le relevez MAINTENANT : il sera effacé
sudo bash backend/deploy/install.sh --secours-fichier=/root/secours.txt
```

🛑 **Ne mettez jamais le mot de passe lui-même dans une commande** — `sudo bash -c '… "MonMot" …'`
l'écrit **en clair dans le journal système** (`journalctl _COMM=sudo`, ligne `COMMAND=`, lisible
par le groupe `adm`) et le montre dans `ps` le temps de la commande. Mesuré le 30/09/2026 par
l'agent du labo, sur une recette que j'avais écrite. Si vous voulez le choisir vous-même, avec un
terminal : `sudo bash -c 'umask 077; read -rsp "Mot de passe : " m; printf "%s" "$m" > /root/secours.txt; echo'`.

🛑 **Si un agent installe pour vous, c'est VOUS qui lisez ce fichier — jamais lui.** Tout ce
qu'un agent affiche entre dans la transcription de sa session (`~/.claude/projects/…`), **en
clair**, et y reste jusqu'à ce qu'elle soit effacée. Mesuré le 30/09/2026 : le mot de passe du
compte de secours du labo y était, remis par l'agent à son utilisateur dans la conversation.
La règle est dans `BRIEF_AGENT_INSTALLATION.md` §3, et le scellement d'une appliance efface la
transcription — mais un mot de passe qui a été lu se **change**, il ne s'efface pas.

⚠️ Avant le 30/09/2026 ce chemin n'existait pas : sans terminal, l'installation en découverte
produisait un produit où **personne ne pouvait entrer**. Trouvé par un agent qui installait en
labo, pas par une relecture.

Le compte de secours donne l'administration Groupe et **chacun de ses usages est
journalisé** ; son mot de passe n'est jamais écrit sur le disque — seule une empreinte
`scrypt`, calculée par le code du produit lui-même, entre dans la configuration.

---

## Les trois choses qui se passent mal, et leur réparation

| Ce que vous voyez | Ce que c'est | Ce qu'il faut faire |
|---|---|---|
| `install.sh` s'arrête en **code 2** en nommant des variables | Une valeur qui vient de **votre** SI manque — le script refuse de deviner | Complétez `/etc/cyber-grc/env`, relancez. **Les secrets déjà engendrés sont conservés** |
| `git pull` dit « propriétaire douteux » / « dubious ownership » | le dépôt a été cloné par un **autre compte** que celui qui tire — typiquement cloné en root | `sudo chown -R "$(id -un):$(id -gn)" ~/cyber-grc`. ⚠️ `safe.directory` ne règle qu'à moitié : git se taira, puis l'écriture échouera |
| `openssl : verify error:num=66:EE certificate key too weak` | la clé du certificat LDAPS du contrôleur est sous le minimum de Debian 13 (2048 bits) — **pas** un défaut de chaîne | c'est une **réserve**, pas un blocage : l'installation continue. Faire réémettre le certificat du DC en 2048 bits |
| `https://votre-nom/` rend **403** | La liste blanche de publication ne couvre pas « / » (constat **Q-36**) | `sudo bash backend/deploy/install.sh --maj` |
| Personne ne peut se connecter | L'annuaire est injoignable, ou les groupes `GRC-*` n'existent pas encore | `--diagnostic` le dit sur sa ligne « annuaire ». Puis étape 5 |
| On entre, et **rien n'est ouvert** (403) | **Aucun groupe `GRC-*` pour ce compte.** Il n'existe **aucun** administrateur par défaut : le premier accès s'obtient en mettant un compte réel dans `GRC-ADMIN` | étape 5, seconde moitié |

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
- **Il ne crée aucun compte administrateur.** Il n'y a pas de « admin/admin » à changer plus
  tard, donc pas de porte qu'on oublie de refermer — et pas de premier accès sans que
  quelqu'un ait été mis dans `GRC-ADMIN`. ⚠️ **Et en production il ne pose aucun compte de
  secours** : si vous en voulez un comme voie de retour en cas de panne d'annuaire, c'est un
  geste à part — voir [`INSTALLATION_ENTREPRISE.md`](INSTALLATION_ENTREPRISE.md) §0 bis.
- **Il ne charge aucune donnée de démonstration.** À la première ouverture les écrans sont
  vides, et c'est voulu : un outil qui affiche « aucun risque » sur une base vide ne ment
  pas.
- **Il ne remplace pas un mot de passe de rôle existant**, ni ne reprend la propriété d'une
  base existante, sans qu'on le lui demande. Sur un outil qui héberge le PCA d'un groupe
  industriel, on ne bricole pas la base de production en silence.
